import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppDb, Issue, Listing } from "../../db.js";
import { paidListings, rankListings, type RankedListing } from "../../rank.js";
import { renderBoardHtml } from "../../views/skin.js";

export { renderBoardHtml };

export const BOARD_PATH = "/" as const;
export const ISSUE_BOARD_PATH = "/issue/:date" as const;

const ISSUE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type PublicListing = {
  rank: number;
  id: string;
  issueDate: string;
  sponsorUrl: string;
  blurb: string;
  bidUsd: number;
  createdAt: string;
  clicks: number;
};

export type BoardPayload = {
  issueDate: string | null;
  status: Issue["status"] | null;
  listings: PublicListing[];
};

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
  return ISSUE_DATE_RE.test(value);
}

export function utcCalendarDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function issueFromRow(row: IssueRow): Issue {
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

export function loadListingsForIssue(db: AppDb, issueDate: string): Listing[] {
  const rows = db
    .prepare<[string], ListingRow>(
      `SELECT id, issue_date, sponsor_url, blurb, bid_usd, created_at, clicks, status
       FROM listings
       WHERE issue_date = ?`,
    )
    .all(issueDate);
  return paidListings(rows.map(listingFromRow));
}

export function toPublicListing(listing: RankedListing): PublicListing {
  return {
    rank: listing.rank,
    id: listing.id,
    issueDate: listing.issueDate,
    sponsorUrl: listing.sponsorUrl,
    blurb: listing.blurb,
    bidUsd: listing.bidUsd,
    createdAt: listing.createdAt,
    clicks: listing.clicks,
  };
}

export function getBoard(
  db: AppDb,
  requestedIssueDate?: string,
  now: Date = new Date(),
): BoardPayload {
  if (requestedIssueDate !== undefined) {
    if (!isIssueDate(requestedIssueDate)) {
      return { issueDate: null, status: null, listings: [] };
    }
    const issue = loadIssue(db, requestedIssueDate);
    const listings = rankListings(loadListingsForIssue(db, requestedIssueDate), {
      issueDate: requestedIssueDate,
    }).map(toPublicListing);
    return {
      issueDate: requestedIssueDate,
      status: issue?.status ?? null,
      listings,
    };
  }

  const open = loadOpenIssue(db, now);
  if (!open) {
    return { issueDate: null, status: null, listings: [] };
  }
  return {
    issueDate: open.issueDate,
    status: open.status,
    listings: rankListings(loadListingsForIssue(db, open.issueDate), {
      issueDate: open.issueDate,
    }).map(toPublicListing),
  };
}

export function wantsJson(request: FastifyRequest): boolean {
  const query = request.query as { format?: unknown };
  if (query.format === "json") {
    return true;
  }
  const accept = request.headers.accept ?? "";
  return /\bapplication\/json\b/.test(accept) && !/\btext\/html\b/.test(accept);
}

async function sendBoard(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  issueDate?: string,
): Promise<void> {
  const board = getBoard(app.db, issueDate);
  if (wantsJson(request)) {
    await reply.type("application/json; charset=utf-8").send(board);
    return;
  }
  await reply.type("text/html; charset=utf-8").send(renderBoardHtml(board));
}

export function registerBoardRoutes(app: FastifyInstance): void {
  app.get(BOARD_PATH, async (request, reply) => {
    await sendBoard(app, request, reply);
  });
  app.get<{ Params: { date: string } }>(ISSUE_BOARD_PATH, async (request, reply) => {
    await sendBoard(app, request, reply, request.params.date);
  });
}
