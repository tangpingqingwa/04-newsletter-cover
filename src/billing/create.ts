import { randomUUID } from "node:crypto";
import type { AppDb, Checkout } from "../db.js";
import { catchUpIssues } from "../issues.js";
import {
  applyPaidBid,
  createListing,
  findListingById,
  findListingByUrlAndIssue,
  ListingError,
  MAX_BID_USD,
  MIN_BID_USD,
  openIssueDate,
  parseBidUsd,
  parseCreateListingBody,
  quoteListingBid,
} from "../listings.js";
import { FixturePolar } from "./fixture.js";
import type { PolarPort } from "./port.js";

export { findListingById, MAX_BID_USD, MIN_BID_USD, parseBidUsd };

export type StartedCheckout = {
  url: string;
  checkoutId: string;
  polarCheckoutId: string;
  listingId: string;
  amountUsd: number;
  targetBidUsd: number;
};

type CheckoutRow = {
  id: string;
  listing_id: string;
  amount_usd: number;
  target_bid_usd: number;
  polar_checkout_id: string;
  status: Checkout["status"];
};

export function polarFixtureOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.POLAR_FIXTURE_ONLY === "1";
}

export function polarLiveEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (polarFixtureOnly(env)) {
    return false;
  }
  return env.POLAR_LIVE === "1";
}

/** Fixture unless live is enabled. `POLAR_FIXTURE_ONLY=1` always wins. */
export function createPolar(env: NodeJS.ProcessEnv = process.env): PolarPort {
  if (polarLiveEnabled(env)) {
    if (!env.POLAR_ACCESS_TOKEN?.trim()) {
      throw new Error("BLOCKED-SECRET: POLAR_ACCESS_TOKEN");
    }
    throw new Error("live Polar is env-gated and must not run in tests");
  }
  return new FixturePolar();
}

export function publicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.PUBLIC_BASE_URL?.trim();
  if (raw) {
    return raw.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

function checkoutFromRow(row: CheckoutRow): Checkout {
  return {
    id: row.id,
    listingId: row.listing_id,
    amountUsd: row.amount_usd,
    targetBidUsd: row.target_bid_usd,
    polarCheckoutId: row.polar_checkout_id,
    status: row.status,
  };
}

export function findCheckout(
  db: AppDb,
  checkoutId: string,
): Checkout | null {
  const row = db
    .prepare<[string, string], CheckoutRow>(
      `SELECT id, listing_id, amount_usd, target_bid_usd, polar_checkout_id, status
       FROM checkouts
       WHERE polar_checkout_id = ? OR id = ?`,
    )
    .get(checkoutId, checkoutId);
  return row ? checkoutFromRow(row) : null;
}

export function paidCheckoutCount(db: AppDb): number {
  const row = db
    .prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM checkouts WHERE status = 'paid'",
    )
    .get();
  return row?.n ?? 0;
}

/**
 * Validate listing + min $5, insert unpaid listing or raise, then start Polar.
 * Charge is the full first bid or the raise difference. Does not apply the bid.
 */
export async function startListingCheckout(
  db: AppDb,
  polar: PolarPort,
  body: unknown,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<StartedCheckout> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ListingError("invalid_listing", "listing body must be an object");
  }
  const input = body as Record<string, unknown>;
  const parsed = parseCreateListingBody(body);
  const targetBidUsd = parseBidUsd(input.bidUsd);
  const issueDate = openIssueDate(db, now);
  if (!issueDate) {
    throw new ListingError(
      "no_open_issue",
      "only the open issue accepts listings",
      409,
    );
  }
  const existing = findListingByUrlAndIssue(db, parsed.sponsorUrl, issueDate);
  const quote = quoteListingBid(existing?.bidUsd ?? 0, targetBidUsd);

  const listing = createListing(db, body, now);

  const base = publicBaseUrl(env);
  const created = await polar.createCheckout({
    amountUsd: quote.amountUsd,
    listingId: listing.id,
    successUrl: `${base}/`,
    cancelUrl: `${base}/`,
  });

  const checkoutId = randomUUID();
  db.prepare(
    `INSERT INTO checkouts (id, listing_id, amount_usd, target_bid_usd, polar_checkout_id, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
  ).run(
    checkoutId,
    listing.id,
    quote.amountUsd,
    quote.targetBidUsd,
    created.checkoutId,
  );

  return {
    url: created.url,
    checkoutId,
    polarCheckoutId: created.checkoutId,
    listingId: listing.id,
    amountUsd: quote.amountUsd,
    targetBidUsd: quote.targetBidUsd,
  };
}

/**
 * Apply a paid Polar (or fixture) checkout. Unknown id → 404.
 * Already paid → idempotent no-op. `$4` never becomes a paid row.
 */
export function applyPaidCheckout(
  db: AppDb,
  checkoutId: string,
  now: Date = new Date(),
): Checkout {
  catchUpIssues(db, now);
  const checkout = findCheckout(db, checkoutId);
  if (!checkout) {
    throw new ListingError("unknown_checkout", "checkout not found", 404);
  }
  if (checkout.status === "paid") {
    return checkout;
  }

  const listing = findListingById(db, checkout.listingId);
  if (!listing) {
    throw new ListingError("unknown_checkout", "checkout listing not found", 404);
  }

  const quote = quoteListingBid(listing.bidUsd, checkout.targetBidUsd);
  if (checkout.amountUsd !== quote.amountUsd) {
    throw new ListingError(
      quote.raise ? "raise_not_difference" : "below_minimum",
      quote.raise
        ? `raise pays the difference only (expected $${quote.amountUsd})`
        : `first bid must be at least $${MIN_BID_USD}`,
    );
  }

  const apply = db.transaction(() => {
    db.prepare("UPDATE checkouts SET status = 'paid' WHERE id = ?").run(checkout.id);
    applyPaidBid(db, listing.id, checkout.targetBidUsd, now);
  });
  apply();

  return { ...checkout, status: "paid" };
}

export async function completeCheckout(
  db: AppDb,
  polar: PolarPort,
  checkoutId: string,
  now: Date = new Date(),
): Promise<Checkout> {
  if (polar instanceof FixturePolar) {
    const local = polar.getCheckout(checkoutId);
    if (!local && !findCheckout(db, checkoutId)) {
      throw new ListingError("unknown_checkout", "checkout not found", 404);
    }
    if (local) {
      await polar.complete(checkoutId);
    }
  }
  return applyPaidCheckout(db, checkoutId, now);
}
