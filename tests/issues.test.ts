import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyPaidCheckout,
  completeCheckout,
  findCheckout,
  findListingById,
  startListingCheckout,
} from "../src/billing/create.js";
import { FixturePolar } from "../src/billing/fixture.js";
import { catchUpIssues, closeIssue } from "../src/close.js";
import type { AppDb, Listing } from "../src/db.js";
import { openDatabase } from "../src/db.js";
import { getBoard } from "../src/http/routes/board.js";
import {
  addUtcDays,
  followingOpenIssueDate,
  isDueToClose,
  issueCloseAt,
  loadIssue,
  loadOpenIssue,
  nextMondayIssueDate,
  nextWeeklyIssueDate,
} from "../src/issues.js";
import { createListing, ListingError, openIssueDate } from "../src/listings.js";
import { buildApp } from "../src/server.js";
import { ROLLING_WEEK_MS } from "../src/week.js";

const ISSUE = "2026-08-24";
const NEXT_ISSUE = "2026-08-31";
const BEFORE_CLOSE = new Date("2026-08-23T23:59:59.999Z");
const PAID_AT = new Date("2026-08-23T12:00:00.000Z");
const AT_CLOSE = new Date("2026-08-24T00:00:00.000Z");
const AFTER_CLOSE = new Date("2026-08-24T00:00:00.001Z");
const MID_NEXT_WEEK = new Date("2026-08-27T12:00:00.000Z");

function insertIssue(
  db: AppDb,
  issueDate: string,
  status: "open" | "closed",
  closedAt: string | null = status === "closed" ? `${issueDate}T00:00:00.000Z` : null,
): void {
  db.prepare(
    "INSERT INTO issues (issue_date, status, closed_at) VALUES (?, ?, ?)",
  ).run(issueDate, status, closedAt);
}

function insertListing(
  db: AppDb,
  row: {
    id: string;
    issueDate: string;
    sponsorUrl: string;
    blurb: string;
    bidUsd: number;
    createdAt: string;
    clicks?: number;
    status?: Listing["status"];
  },
): void {
  db.prepare(
    `INSERT INTO listings (id, issue_date, sponsor_url, blurb, bid_usd, created_at, clicks, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.issueDate,
    row.sponsorUrl,
    row.blurb,
    row.bidUsd,
    row.createdAt,
    row.clicks ?? 0,
    row.status ?? "active",
  );
}

async function boardJson(
  app: Awaited<ReturnType<typeof buildApp>>,
  path = "/",
) {
  const board = await app.inject({
    method: "GET",
    url: path,
    headers: { accept: "application/json" },
  });
  assert.equal(board.statusCode, 200);
  return board.json() as {
    issueDate: string | null;
    status: "open" | "closed" | null;
    listings: Array<{
      id: string;
      rank: number;
      bidUsd: number;
      blurb: string;
      sponsorUrl: string;
    }>;
  };
}

async function payListing(
  app: Awaited<ReturnType<typeof buildApp>>,
  polar: FixturePolar,
  payload: { sponsorUrl: string; blurb: string; bidUsd: number },
  now?: Date,
) {
  const created = now
    ? await startListingCheckout(app.db, polar, payload, now)
    : undefined;
  if (created) {
    await completeCheckout(app.db, polar, created.polarCheckoutId, now);
    return created;
  }
  const response = await app.inject({
    method: "POST",
    url: "/listings",
    payload,
  });
  assert.equal(response.statusCode, 200);
  const polarId = new URL(
    (response.json() as { url: string }).url,
    "http://localhost",
  ).searchParams.get("checkoutId");
  assert.ok(polarId);
  const pending = findCheckout(app.db, polarId);
  assert.ok(pending);
  await completeCheckout(app.db, polar, polarId);
  return pending;
}

test("weekly UTC close is issueDate 00:00:00 UTC; next cover is +7 days", () => {
  assert.equal(issueCloseAt(ISSUE).toISOString(), "2026-08-24T00:00:00.000Z");
  assert.equal(isDueToClose(ISSUE, BEFORE_CLOSE), false);
  assert.equal(isDueToClose(ISSUE, AT_CLOSE), true);
  assert.equal(isDueToClose(ISSUE, AFTER_CLOSE), true);
  assert.equal(nextWeeklyIssueDate(ISSUE), NEXT_ISSUE);
  assert.equal(addUtcDays(ISSUE, 7), NEXT_ISSUE);
  assert.equal(followingOpenIssueDate(ISSUE, AT_CLOSE), NEXT_ISSUE);
  assert.equal(followingOpenIssueDate(ISSUE, new Date("2026-09-01T00:00:00.000Z")), "2026-09-07");
  assert.equal(nextMondayIssueDate(new Date("2026-08-22T15:00:00.000Z")), "2026-08-24");
  assert.equal(nextMondayIssueDate(new Date("2026-08-24T00:00:00.000Z")), "2026-08-31");
});

test("occupied close is 7 days from paid placement; Monday 00:00 UTC does not drop issue #1", async (t) => {
  const polar = new FixturePolar();
  const app = await buildApp({ polar, now: PAID_AT });
  t.after(() => app.close());
  insertIssue(app.db, ISSUE, "open");

  const second = await payListing(
    app,
    polar,
    {
      sponsorUrl: "https://second.example/cover",
      blurb: "Older five dollars",
      bidUsd: 5,
    },
    PAID_AT,
  );
  const first = await payListing(
    app,
    polar,
    {
      sponsorUrl: "https://winner.example/cover",
      blurb: "Highest bid wins the cover",
      bidUsd: 12,
    },
    PAID_AT,
  );

  const monday = catchUpIssues(app.db, AT_CLOSE);
  assert.equal(monday.closed.length, 0);
  assert.equal(loadIssue(app.db, ISSUE)?.status, "open");
  const mondayBoard = getBoard(app.db, undefined, AT_CLOSE);
  assert.equal(mondayBoard.issueDate, ISSUE);
  assert.equal(mondayBoard.status, "open");
  assert.equal(mondayBoard.listings[0]?.id, first.listingId);
  assert.equal(mondayBoard.listings[0]?.rank, 1);
  assert.equal(mondayBoard.listings[1]?.id, second.listingId);

  const expiry = new Date(PAID_AT.getTime() + ROLLING_WEEK_MS);
  const stillIn = new Date(expiry.getTime() - 1);
  const afterExpiry = new Date(expiry.getTime() + 1);
  assert.equal(catchUpIssues(app.db, stillIn).closed.length, 0);

  const closed = catchUpIssues(app.db, afterExpiry);
  assert.equal(closed.closed.length, 1);
  const snapshot = closed.closed[0];
  assert.ok(snapshot);
  assert.equal(snapshot.issue.status, "closed");
  assert.equal(snapshot.issue.closedAt, expiry.toISOString());
  assert.ok(snapshot.winner);
  assert.equal(snapshot.winner.id, first.listingId);
  assert.equal(snapshot.winner.rank, 1);
  assert.equal(snapshot.winner.bidUsd, 12);
  assert.equal(snapshot.listings[1]?.id, second.listingId);
  assert.equal(snapshot.listings[1]?.rank, 2);
  assert.equal(closed.open?.issueDate, NEXT_ISSUE);
  assert.equal(closed.open?.status, "open");

  const archive = await boardJson(app, `/issue/${ISSUE}`);
  assert.equal(archive.issueDate, ISSUE);
  assert.equal(archive.status, "closed");
  assert.equal(archive.listings[0]?.id, first.listingId);
  assert.equal(archive.listings[0]?.rank, 1);
  assert.equal(archive.listings[0]?.bidUsd, 12);
  assert.equal(archive.listings.length, 2);

  const live = getBoard(app.db, undefined, afterExpiry);
  assert.equal(live.issueDate, NEXT_ISSUE);
  assert.equal(live.status, "open");
  assert.deepEqual(live.listings, []);
});

test("empty close invents no cover; archive stays an empty frozen board", async (t) => {
  const app = await buildApp({ now: BEFORE_CLOSE });
  t.after(() => app.close());
  insertIssue(app.db, ISSUE, "open");
  insertListing(app.db, {
    id: "lst_unpaid",
    issueDate: ISSUE,
    sponsorUrl: "https://unpaid.example",
    blurb: "Never paid",
    bidUsd: 0,
    createdAt: "2026-08-20T00:00:00.000Z",
  });

  const closed = closeIssue(app.db, ISSUE, AT_CLOSE);
  assert.equal(closed.issue.status, "closed");
  assert.equal(closed.winner, null);
  assert.deepEqual(closed.listings, []);

  const archive = await boardJson(app, `/issue/${ISSUE}`);
  assert.equal(archive.status, "closed");
  assert.deepEqual(archive.listings, []);
  const html = await app.inject({ method: "GET", url: `/issue/${ISSUE}` });
  assert.equal(html.statusCode, 200);
  assert.match(html.body, /No paid listings on this board/);
  assert.match(html.body, /no last-7-days cover sold/i);
  assert.doesNotMatch(html.body, /data-rank="1"/);
  assert.doesNotMatch(html.body, /unpaid\.example/);
});

test("closed archive is frozen: new bids stamp the next issue, not the winner board", async (t) => {
  const polar = new FixturePolar();
  const app = await buildApp({ polar, now: BEFORE_CLOSE });
  t.after(() => app.close());
  insertIssue(app.db, ISSUE, "open");

  const winner = await payListing(
    app,
    polar,
    {
      sponsorUrl: "https://locked.example",
      blurb: "Cover at close",
      bidUsd: 9,
    },
    BEFORE_CLOSE,
  );
  closeIssue(app.db, ISSUE, AT_CLOSE);

  const after = await payListing(
    app,
    polar,
    {
      sponsorUrl: "https://nextweek.example",
      blurb: "New week empty board",
      bidUsd: 50,
    },
    AFTER_CLOSE,
  );

  const archived = findListingById(app.db, winner.listingId);
  assert.ok(archived);
  assert.equal(archived.issueDate, ISSUE);
  assert.equal(archived.bidUsd, 9);

  const nextListing = findListingById(app.db, after.listingId);
  assert.ok(nextListing);
  assert.equal(nextListing.issueDate, NEXT_ISSUE);
  assert.equal(nextListing.bidUsd, 50);

  const archive = await boardJson(app, `/issue/${ISSUE}`);
  assert.equal(archive.status, "closed");
  assert.deepEqual(
    archive.listings.map((row) => row.id),
    [winner.listingId],
  );
  assert.equal(archive.listings[0]?.bidUsd, 9);

  const live = getBoard(app.db, undefined, AFTER_CLOSE);
  assert.equal(live.issueDate, NEXT_ISSUE);
  assert.equal(live.listings[0]?.id, after.listingId);
  assert.equal(live.listings[0]?.rank, 1);
});

test("after weekly close, new listings stamp the next empty issue", async (t) => {
  const app = await buildApp({ now: BEFORE_CLOSE });
  t.after(() => app.close());
  insertIssue(app.db, ISSUE, "open");

  const caught = catchUpIssues(app.db, AT_CLOSE);
  assert.equal(caught.open?.issueDate, NEXT_ISSUE);
  assert.equal(openIssueDate(app.db, AT_CLOSE), NEXT_ISSUE);

  const created = createListing(
    app.db,
    { sponsorUrl: "https://after.example", blurb: "Next week only" },
    AFTER_CLOSE,
  );
  assert.equal(created.issueDate, NEXT_ISSUE);
  assert.equal(created.bidUsd, 0);
});

test("applyPaidCheckout on a frozen issue does not change rank", async (t) => {
  const polar = new FixturePolar();
  const app = await buildApp({ polar, now: BEFORE_CLOSE });
  t.after(() => app.close());
  insertIssue(app.db, ISSUE, "open");

  const started = await startListingCheckout(
    app.db,
    polar,
    {
      sponsorUrl: "https://late.example",
      blurb: "Paid after close",
      bidUsd: 20,
    },
    BEFORE_CLOSE,
  );
  closeIssue(app.db, ISSUE, AT_CLOSE);

  assert.throws(
    () => applyPaidCheckout(app.db, started.polarCheckoutId, AFTER_CLOSE),
    (err: unknown) => {
      assert.ok(err instanceof ListingError);
      assert.equal(err.code, "issue_closed");
      return true;
    },
  );
  const listing = findListingById(app.db, started.listingId);
  assert.ok(listing);
  assert.equal(listing.bidUsd, 0);
  const archive = await boardJson(app, `/issue/${ISSUE}`);
  assert.deepEqual(archive.listings, []);
});

test("boot catch-up freezes a due open issue before the next issue takes bids", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  insertIssue(db, ISSUE, "open");
  insertListing(db, {
    id: "lst_cover",
    issueDate: ISSUE,
    sponsorUrl: "https://boot.example",
    blurb: "Winner waiting on restart",
    bidUsd: 7,
    createdAt: "2026-08-20T00:00:00.000Z",
  });

  const app = await buildApp({ db, now: MID_NEXT_WEEK });
  t.after(() => app.close());

  const frozen = loadIssue(app.db, ISSUE);
  assert.ok(frozen);
  assert.equal(frozen.status, "closed");
  assert.equal(frozen.closedAt, "2026-08-27T00:00:00.000Z");

  const open = loadOpenIssue(app.db, MID_NEXT_WEEK);
  assert.ok(open);
  assert.equal(open.issueDate, NEXT_ISSUE);
  assert.equal(open.status, "open");

  const archive = await boardJson(app, `/issue/${ISSUE}`);
  assert.equal(archive.status, "closed");
  assert.equal(archive.listings[0]?.id, "lst_cover");
  assert.equal(archive.listings[0]?.rank, 1);

  const live = await boardJson(app);
  assert.equal(live.issueDate, NEXT_ISSUE);
  assert.deepEqual(live.listings, []);

  const created = createListing(
    app.db,
    { sponsorUrl: "https://fresh.example", blurb: "After catch-up" },
    MID_NEXT_WEEK,
  );
  assert.equal(created.issueDate, NEXT_ISSUE);
});

test("catch-up on a due empty open issue invents no winner and opens next week", () => {
  const db = openDatabase(":memory:");
  insertIssue(db, ISSUE, "open");

  const result = catchUpIssues(db, AT_CLOSE);
  assert.equal(result.closed.length, 1);
  assert.equal(result.closed[0]?.winner, null);
  assert.deepEqual(result.closed[0]?.listings, []);
  assert.equal(result.closed[0]?.issue.status, "closed");
  assert.equal(result.open?.issueDate, NEXT_ISSUE);
  assert.equal(result.open?.status, "open");
  db.close();
});

test("already-closed issue is a no-op close; ranking snapshot is unchanged", () => {
  const db = openDatabase(":memory:");
  insertIssue(db, ISSUE, "closed", "2026-08-24T00:00:00.000Z");
  insertListing(db, {
    id: "lst_one",
    issueDate: ISSUE,
    sponsorUrl: "https://one.example",
    blurb: "Locked cover",
    bidUsd: 11,
    createdAt: "2026-08-18T00:00:00.000Z",
  });

  const first = closeIssue(db, ISSUE, AFTER_CLOSE);
  const second = closeIssue(db, ISSUE, MID_NEXT_WEEK);
  assert.equal(first.issue.closedAt, "2026-08-24T00:00:00.000Z");
  assert.equal(second.issue.closedAt, "2026-08-24T00:00:00.000Z");
  assert.equal(first.winner?.id, "lst_one");
  assert.equal(second.winner?.id, "lst_one");
  assert.equal(second.winner?.rank, 1);
  db.close();
});
