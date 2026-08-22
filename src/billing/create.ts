import { randomUUID } from "node:crypto";
import type { AppDb, Checkout, Listing } from "../db.js";
import {
  createListing,
  ListingError,
  parseCreateListingBody,
} from "../listings.js";
import { FixturePolar } from "./fixture.js";
import type { PolarPort } from "./port.js";

export const MIN_BID_USD = 5;
export const MAX_BID_USD = 10_000;

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

type ListingRow = {
  id: string;
  issue_date: string;
  sponsor_url: string;
  blurb: string;
  bid_usd: number;
  created_at: string;
  clicks: number;
  status: Listing["status"];
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

export function parseBidUsd(raw: unknown): number {
  if (typeof raw === "boolean") {
    throw new ListingError("invalid_bid", "bid must be a whole USD amount");
  }
  if (typeof raw === "number") {
    if (!Number.isInteger(raw)) {
      throw new ListingError("invalid_bid", "bid must be a whole USD amount");
    }
    return assertBidRange(raw);
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new ListingError("invalid_bid", "bid must be a whole USD amount");
  }
  const trimmed = raw.trim().replace(/^\$/, "");
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new ListingError("invalid_bid", "bid must be a whole USD amount");
  }
  return assertBidRange(Number(trimmed));
}

function assertBidRange(value: number): number {
  if (value < MIN_BID_USD) {
    throw new ListingError(
      "below_minimum",
      `first bid must be at least $${MIN_BID_USD}`,
    );
  }
  if (value > MAX_BID_USD) {
    throw new ListingError(
      "above_maximum",
      `bid must be at most $${MAX_BID_USD}`,
    );
  }
  return value;
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

function listingFromRow(row: ListingRow): Listing {
  return {
    id: row.id,
    issueDate: row.issue_date,
    sponsorUrl: row.sponsor_url,
    blurb: row.blurb,
    bidUsd: row.bid_usd,
    createdAt: row.created_at,
    clicks: row.clicks,
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

export function findListingById(db: AppDb, listingId: string): Listing | null {
  const row = db
    .prepare<[string], ListingRow>(
      `SELECT id, issue_date, sponsor_url, blurb, bid_usd, created_at, clicks, status
       FROM listings
       WHERE id = ?`,
    )
    .get(listingId);
  return row ? listingFromRow(row) : null;
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
 * Validate listing + min $5, insert unpaid listing + pending checkout,
 * then start Polar (fixture in tests). Does not apply the bid.
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
  parseCreateListingBody(body);
  const targetBidUsd = parseBidUsd(input.bidUsd);

  const listing = createListing(db, body, now);
  if (listing.bidUsd > 0) {
    throw new ListingError(
      "already_listed",
      "listing already paid for this issue",
      409,
    );
  }

  const base = publicBaseUrl(env);
  const created = await polar.createCheckout({
    amountUsd: targetBidUsd,
    listingId: listing.id,
    successUrl: `${base}/`,
    cancelUrl: `${base}/`,
  });

  const checkoutId = randomUUID();
  db.prepare(
    `INSERT INTO checkouts (id, listing_id, amount_usd, target_bid_usd, polar_checkout_id, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
  ).run(checkoutId, listing.id, targetBidUsd, targetBidUsd, created.checkoutId);

  return {
    url: created.url,
    checkoutId,
    polarCheckoutId: created.checkoutId,
    listingId: listing.id,
    amountUsd: targetBidUsd,
    targetBidUsd,
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
  const checkout = findCheckout(db, checkoutId);
  if (!checkout) {
    throw new ListingError("unknown_checkout", "checkout not found", 404);
  }
  if (checkout.status === "paid") {
    return checkout;
  }
  if (checkout.targetBidUsd < MIN_BID_USD || checkout.amountUsd < MIN_BID_USD) {
    throw new ListingError(
      "below_minimum",
      `first bid must be at least $${MIN_BID_USD}`,
    );
  }

  const listing = findListingById(db, checkout.listingId);
  if (!listing) {
    throw new ListingError("unknown_checkout", "checkout listing not found", 404);
  }

  const paidAt = now.toISOString();
  const apply = db.transaction(() => {
    db.prepare("UPDATE checkouts SET status = 'paid' WHERE id = ?").run(checkout.id);
    if (listing.bidUsd <= 0) {
      db.prepare("UPDATE listings SET bid_usd = ?, created_at = ? WHERE id = ?").run(
        checkout.targetBidUsd,
        paidAt,
        listing.id,
      );
    } else {
      db.prepare("UPDATE listings SET bid_usd = ? WHERE id = ?").run(
        checkout.targetBidUsd,
        listing.id,
      );
    }
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
