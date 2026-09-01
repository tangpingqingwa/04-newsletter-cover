import { randomUUID } from "node:crypto";
import type { AppDb, Listing } from "./db.js";
import {
  catchUpIssues,
  issueIsOpenForBids,
  loadIssue,
  loadOpenIssue,
} from "./issues.js";
import { canonicalizeSponsorUrl, isNsfwBlurb } from "./url.js";

const BLURB_MAX = 120;
const URL_IN_BLURB = /https?:\/\/|www\./i;

export const MIN_BID_USD = 5;
export const MAX_BID_USD = 10_000;

export class ListingError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "ListingError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type CreateListingInput = {
  sponsorUrl: string;
  blurb: string;
};

export type BidQuote = {
  raise: boolean;
  currentBidUsd: number;
  targetBidUsd: number;
  amountUsd: number;
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

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.trim();
}

/** Next live open issueDate (SPEC §5). Occupied weeks stay live across Monday midnight. Frozen issues never stamp. */
export function openIssueDate(db: AppDb, now: Date = new Date()): string | null {
  catchUpIssues(db, now);
  return loadOpenIssue(db, now)?.issueDate ?? null;
}

/** Canonical http(s) sponsor URL. Chat / NSFW → `rejected_content` (SPEC §6). */
export function parseSponsorUrl(raw: unknown): string {
  const result = canonicalizeSponsorUrl(raw);
  if (!result.ok) {
    if (result.error === "rejected_content") {
      throw new ListingError(
        "rejected_content",
        "chat and NSFW sponsor URLs are not allowed",
      );
    }
    throw new ListingError("invalid_url", "sponsor URL must be http or https");
  }
  return result.url;
}

/** 1–120 characters, single line, no URLs, trimmed (SPEC §3). */
export function parseBlurb(raw: unknown): string {
  const text = asTrimmedString(raw);
  if (text === undefined || text.length < 1 || text.length > BLURB_MAX) {
    throw new ListingError(
      "invalid_blurb",
      `blurb must be 1–${BLURB_MAX} characters`,
    );
  }
  if (/[\r\n]/.test(text)) {
    throw new ListingError("invalid_blurb", "blurb must be a single line");
  }
  if (URL_IN_BLURB.test(text)) {
    throw new ListingError("invalid_blurb", "blurb must not contain a URL");
  }
  if (isNsfwBlurb(text)) {
    throw new ListingError("rejected_content", "NSFW blurbs are not allowed");
  }
  return text;
}

export function parseCreateListingBody(body: unknown): CreateListingInput {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ListingError("invalid_listing", "listing body must be an object");
  }
  const input = body as Record<string, unknown>;
  return {
    sponsorUrl: parseSponsorUrl(input.sponsorUrl),
    blurb: parseBlurb(input.blurb),
  };
}

export function parseBidUsd(raw: unknown): number {
  if (typeof raw === "boolean") {
    throw new ListingError("invalid_bid", "bid must be a whole USD amount");
  }
  if (typeof raw === "number") {
    if (!Number.isInteger(raw)) {
      throw new ListingError("invalid_bid", "bid must be a whole USD amount");
    }
    return assertBidCeiling(raw);
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new ListingError("invalid_bid", "bid must be a whole USD amount");
  }
  const trimmed = raw.trim().replace(/^\$/, "");
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new ListingError("invalid_bid", "bid must be a whole USD amount");
  }
  return assertBidCeiling(Number(trimmed));
}

function assertBidCeiling(value: number): number {
  if (value > MAX_BID_USD) {
    throw new ListingError(
      "above_maximum",
      `bid must be at most $${MAX_BID_USD}`,
    );
  }
  return value;
}

/**
 * First bid charges the full amount (≥ $5). A raise charges only
 * `targetBidUsd - currentBidUsd` and rejects a non-increasing bid.
 */
export function quoteListingBid(
  currentBidUsd: number,
  targetBidUsd: number,
): BidQuote {
  if (!Number.isInteger(targetBidUsd) || targetBidUsd < 0) {
    throw new ListingError("invalid_bid", "bid must be a whole USD amount");
  }
  if (targetBidUsd > MAX_BID_USD) {
    throw new ListingError(
      "above_maximum",
      `bid must be at most $${MAX_BID_USD}`,
    );
  }

  const current = Number.isInteger(currentBidUsd) ? currentBidUsd : 0;
  if (current <= 0) {
    if (targetBidUsd < MIN_BID_USD) {
      throw new ListingError(
        "below_minimum",
        `first bid must be at least $${MIN_BID_USD}`,
      );
    }
    return {
      raise: false,
      currentBidUsd: 0,
      targetBidUsd,
      amountUsd: targetBidUsd,
    };
  }

  if (targetBidUsd <= current) {
    throw new ListingError(
      "bid_not_higher",
      "raise must be greater than the current bid",
    );
  }
  return {
    raise: true,
    currentBidUsd: current,
    targetBidUsd,
    amountUsd: targetBidUsd - current,
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

export function findListingByUrlAndIssue(
  db: AppDb,
  sponsorUrl: string,
  issueDate: string,
): Listing | null {
  const row = db
    .prepare<[string, string], ListingRow>(
      `SELECT id, issue_date, sponsor_url, blurb, bid_usd, created_at, clicks, status
       FROM listings
       WHERE sponsor_url = ? AND issue_date = ?`,
    )
    .get(sponsorUrl, issueDate);
  return row ? listingFromRow(row) : null;
}

/**
 * Create a listing on the open issue. Sponsors do not pick issueDate (SPEC §3).
 * Same (sponsorUrl, issueDate) is unique — a second submit is not a second row.
 * Unpaid rows stay bidUsd 0 until a signed Waffo completion is applied.
 */
export function createListing(
  db: AppDb,
  body: unknown,
  now: Date = new Date(),
): Listing {
  const input = parseCreateListingBody(body);
  const issueDate = openIssueDate(db, now);
  if (!issueDate) {
    throw new ListingError(
      "no_open_issue",
      "only the open issue accepts listings",
      409,
    );
  }

  const existing = findListingByUrlAndIssue(db, input.sponsorUrl, issueDate);
  if (existing) {
    return existing;
  }

  const listing: Listing = {
    id: randomUUID(),
    issueDate,
    sponsorUrl: input.sponsorUrl,
    blurb: input.blurb,
    bidUsd: 0,
    createdAt: now.toISOString(),
    clicks: 0,
    status: "active",
  };

  db.prepare(
    `INSERT INTO listings (id, issue_date, sponsor_url, blurb, bid_usd, created_at, clicks, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    listing.id,
    listing.issueDate,
    listing.sponsorUrl,
    listing.blurb,
    listing.bidUsd,
    listing.createdAt,
    listing.clicks,
    listing.status,
  );

  return listing;
}

/**
 * Apply a paid bid. First pay stamps `createdAt`. A raise updates `bidUsd`
 * only — `createdAt` stays the first paid time (SPEC §4).
 */
export function applyPaidBid(
  db: AppDb,
  listingId: string,
  targetBidUsd: number,
  now: Date = new Date(),
): Listing {
  const listing = findListingById(db, listingId);
  if (!listing) {
    throw new ListingError("unknown_listing", "listing not found", 404);
  }

  if (!issueIsOpenForBids(db, loadIssue(db, listing.issueDate), now)) {
    throw new ListingError(
      "issue_closed",
      "do not accept bids or raises after close",
      409,
    );
  }

  const quote = quoteListingBid(listing.bidUsd, targetBidUsd);
  if (quote.raise) {
    db.prepare("UPDATE listings SET bid_usd = ? WHERE id = ?").run(
      quote.targetBidUsd,
      listing.id,
    );
    return { ...listing, bidUsd: quote.targetBidUsd };
  }

  const paidAt = now.toISOString();
  db.prepare("UPDATE listings SET bid_usd = ?, created_at = ? WHERE id = ?").run(
    quote.targetBidUsd,
    paidAt,
    listing.id,
  );
  return { ...listing, bidUsd: quote.targetBidUsd, createdAt: paidAt };
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
