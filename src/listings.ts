import { randomUUID } from "node:crypto";
import type { AppDb, Listing } from "./db.js";

const BLURB_MAX = 120;
const URL_IN_BLURB = /https?:\/\/|www\./i;

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

function utcCalendarDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Next open issueDate strictly after now (SPEC §5). */
export function openIssueDate(db: AppDb, now: Date = new Date()): string | null {
  const row = db
    .prepare<[string], { issue_date: string }>(
      `SELECT issue_date
       FROM issues
       WHERE status = 'open' AND issue_date > ?
       ORDER BY issue_date ASC
       LIMIT 1`,
    )
    .get(utcCalendarDate(now));
  return row?.issue_date ?? null;
}

/** http(s) only. Tracking strip / chat / NSFW are PR 6. */
export function parseSponsorUrl(raw: unknown): string {
  const text = asTrimmedString(raw);
  if (text === undefined || text.length < 1) {
    throw new ListingError("invalid_url", "sponsor URL must be http or https");
  }
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new ListingError("invalid_url", "sponsor URL must be http or https");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ListingError("invalid_url", "sponsor URL must be http or https");
  }
  if (!parsed.hostname) {
    throw new ListingError("invalid_url", "sponsor URL must be http or https");
  }
  return text;
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
 * Polar checkout / paid bid land in a later PR; bidUsd stays 0 here.
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
