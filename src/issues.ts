import type { AppDb, Issue, Listing } from "./db.js";
import { rankListings, type RankedListing } from "./rank.js";

export const ISSUE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const WEEK_DAYS = 7;

type IssueRow = {
  issue_date: string;
  status: Issue["status"];
  closed_at: string | null;
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

export function isIssueDate(value: string): boolean {
  if (!ISSUE_DATE_RE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  );
}

export function utcCalendarDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Close instant is `issueDate 00:00:00 UTC` (SPEC §5). */
export function issueCloseAt(issueDate: string): Date {
  return new Date(`${issueDate}T00:00:00.000Z`);
}

export function isDueToClose(issueDate: string, now: Date = new Date()): boolean {
  return now.getTime() >= issueCloseAt(issueDate).getTime();
}

export function addUtcDays(issueDate: string, days: number): string {
  const next = issueCloseAt(issueDate);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Following weekly cover date. Preserves the existing weekday. */
export function nextWeeklyIssueDate(issueDate: string): string {
  return addUtcDays(issueDate, WEEK_DAYS);
}

/**
 * Next Monday UTC calendar date that is still strictly after `now`.
 * A Monday midnight instant already closed that week's cover.
 */
export function nextMondayIssueDate(now: Date = new Date()): string {
  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const dayMs = 86_400_000;
  if (now.getUTCDay() === 1) {
    return new Date(startOfToday + WEEK_DAYS * dayMs).toISOString().slice(0, 10);
  }
  const daysUntilMonday = (8 - now.getUTCDay()) % 7;
  return new Date(startOfToday + daysUntilMonday * dayMs).toISOString().slice(0, 10);
}

export function issueFromRow(row: IssueRow): Issue {
  return {
    issueDate: row.issue_date,
    status: row.status,
    closedAt: row.closed_at,
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

export function loadIssue(db: AppDb, issueDate: string): Issue | null {
  const row = db
    .prepare<[string], IssueRow>(
      "SELECT issue_date, status, closed_at FROM issues WHERE issue_date = ?",
    )
    .get(issueDate);
  return row ? issueFromRow(row) : null;
}

/** Open issue is the next issueDate strictly after now (SPEC §5). */
export function loadOpenIssue(db: AppDb, now: Date = new Date()): Issue | null {
  const row = db
    .prepare<[string], IssueRow>(
      `SELECT issue_date, status, closed_at
       FROM issues
       WHERE status = 'open' AND issue_date > ?
       ORDER BY issue_date ASC
       LIMIT 1`,
    )
    .get(utcCalendarDate(now));
  return row ? issueFromRow(row) : null;
}

/** Only a still-open, not-yet-due issue accepts bids or raises. */
export function issueIsOpenForBids(
  issue: Issue | null,
  now: Date = new Date(),
): boolean {
  return (
    issue !== null &&
    issue.status === "open" &&
    !isDueToClose(issue.issueDate, now)
  );
}

export function loadLatestIssue(db: AppDb): Issue | null {
  const row = db
    .prepare<[], IssueRow>(
      `SELECT issue_date, status, closed_at
       FROM issues
       ORDER BY issue_date DESC
       LIMIT 1`,
    )
    .get();
  return row ? issueFromRow(row) : null;
}

/** Open issues whose close instant is at or before `now`. */
export function loadDueOpenIssues(db: AppDb, now: Date = new Date()): Issue[] {
  const rows = db
    .prepare<[string], IssueRow>(
      `SELECT issue_date, status, closed_at
       FROM issues
       WHERE status = 'open' AND issue_date <= ?
       ORDER BY issue_date ASC`,
    )
    .all(utcCalendarDate(now));
  return rows.map(issueFromRow);
}

export function loadListingsForIssue(db: AppDb, issueDate: string): Listing[] {
  const rows = db
    .prepare<[string], ListingRow>(
      `SELECT id, issue_date, sponsor_url, blurb, bid_usd, created_at, clicks, status
       FROM listings
       WHERE issue_date = ?`,
    )
    .all(issueDate);
  return rows.map(listingFromRow);
}

export type ClosedIssue = {
  issue: Issue;
  /** Rank 1 at close. Null when there are zero paid listings — do not invent a cover. */
  winner: RankedListing | null;
  listings: RankedListing[];
};

export type CatchUpResult = {
  closed: ClosedIssue[];
  open: Issue | null;
};

export function snapshotClosedIssue(db: AppDb, issue: Issue): ClosedIssue {
  const listings = rankListings(loadListingsForIssue(db, issue.issueDate), {
    issueDate: issue.issueDate,
  });
  return {
    issue,
    winner: listings[0] ?? null,
    listings,
  };
}

export function insertOpenIssue(db: AppDb, issueDate: string): Issue {
  const existing = loadIssue(db, issueDate);
  if (existing) {
    return existing;
  }
  db.prepare(
    "INSERT INTO issues (issue_date, status, closed_at) VALUES (?, 'open', NULL)",
  ).run(issueDate);
  return { issueDate, status: "open", closedAt: null };
}

export function markIssueClosed(
  db: AppDb,
  issueDate: string,
  closedAt: string,
): Issue {
  db.prepare(
    `UPDATE issues
     SET status = 'closed', closed_at = ?
     WHERE issue_date = ? AND status = 'open'`,
  ).run(closedAt, issueDate);
  const issue = loadIssue(db, issueDate);
  if (!issue) {
    throw new Error(`unknown issue ${issueDate}`);
  }
  return issue;
}

/**
 * First weekly issueDate strictly after `now`, walking +7 from `fromIssueDate`.
 * Does not insert skipped past weeks.
 */
export function followingOpenIssueDate(fromIssueDate: string, now: Date): string {
  let next = nextWeeklyIssueDate(fromIssueDate);
  while (isDueToClose(next, now)) {
    next = nextWeeklyIssueDate(next);
  }
  return next;
}

/** Open the next future weekly issue after `fromIssueDate`. Empty boards are allowed. */
export function ensureFollowingOpenIssue(
  db: AppDb,
  fromIssueDate: string,
  now: Date = new Date(),
): Issue {
  const existing = loadOpenIssue(db, now);
  if (existing) {
    return existing;
  }
  return insertOpenIssue(db, followingOpenIssueDate(fromIssueDate, now));
}

/**
 * Production seed: keep exactly one future open issue.
 * An empty database gets the next Monday UTC cover. Tests do not have to call this.
 */
export function ensureOpenIssue(db: AppDb, now: Date = new Date()): Issue {
  const open = loadOpenIssue(db, now);
  if (open) {
    return open;
  }
  const latest = loadLatestIssue(db);
  if (latest) {
    return ensureFollowingOpenIssue(db, latest.issueDate, now);
  }
  return insertOpenIssue(db, nextMondayIssueDate(now));
}

/**
 * Freeze ranking for an issue. Winner is whatever paid listing sits at rank 1.
 * Zero paid rows → empty archive, no invented cover (SPEC §5).
 */
export function closeIssue(
  db: AppDb,
  issueDate: string,
  now: Date = new Date(),
): ClosedIssue {
  const existing = loadIssue(db, issueDate);
  if (!existing) {
    throw new Error(`unknown issue ${issueDate}`);
  }
  if (existing.status === "closed") {
    return snapshotClosedIssue(db, existing);
  }
  const closed = markIssueClosed(
    db,
    issueDate,
    issueCloseAt(issueDate).toISOString(),
  );
  ensureFollowingOpenIssue(db, closed.issueDate, now);
  return snapshotClosedIssue(db, closed);
}

/**
 * If `now` is past an open issue’s close and it is not frozen, freeze it
 * before the next issue can take bids. Opens the following weekly issueDate.
 */
export function catchUpIssues(db: AppDb, now: Date = new Date()): CatchUpResult {
  const due = loadDueOpenIssues(db, now);
  const closed: ClosedIssue[] = [];
  for (const issue of due) {
    closed.push(closeIssue(db, issue.issueDate, now));
  }
  if (closed.length === 0) {
    return { closed, open: loadOpenIssue(db, now) };
  }
  const latestClosed = closed[closed.length - 1];
  if (!latestClosed) {
    return { closed, open: loadOpenIssue(db, now) };
  }
  return {
    closed,
    open: ensureFollowingOpenIssue(db, latestClosed.issue.issueDate, now),
  };
}
