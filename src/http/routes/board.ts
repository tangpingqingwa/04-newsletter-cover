import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppDb, Issue } from "../../db.js";
import {
  isIssueDate,
  loadIssue,
  loadListingsForIssue,
  loadOpenIssue,
} from "../../issues.js";
import { rankListings, type RankedListing } from "../../rank.js";
import { renderBoardHtml } from "../../views/skin.js";

export { renderBoardHtml };

export const BOARD_PATH = "/" as const;
export const ISSUE_BOARD_PATH = "/issue/:date" as const;

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
    const liveOpen = issue?.status === "open";
    const listings = rankListings(loadListingsForIssue(db, requestedIssueDate), {
      issueDate: requestedIssueDate,
      now: liveOpen ? now : undefined,
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
      now,
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
  const board = getBoard(app.db, issueDate, app.now());
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
