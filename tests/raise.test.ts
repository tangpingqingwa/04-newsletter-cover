import assert from "node:assert/strict";
import { test } from "node:test";
import {
  completeCheckout,
  findCheckout,
  findListingById,
  startListingCheckout,
} from "../src/billing/create.js";
import { FixturePolar } from "../src/billing/fixture.js";
import type { AppDb } from "../src/db.js";
import {
  applyPaidBid,
  ListingError,
  quoteListingBid,
} from "../src/listings.js";
import { buildApp } from "../src/server.js";

const OPEN_ISSUE = "2099-01-05";
const LIVE_NOW = new Date("2026-08-01T18:00:00.000Z");

function insertIssue(db: AppDb, issueDate: string, status: "open" | "closed"): void {
  db.prepare(
    "INSERT INTO issues (issue_date, status, closed_at) VALUES (?, ?, ?)",
  ).run(issueDate, status, status === "closed" ? "2020-01-06T00:00:00.000Z" : null);
}

function listingCount(db: AppDb): number {
  const row = db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM listings").get();
  assert.ok(row);
  return row.n;
}

async function boardListings(app: Awaited<ReturnType<typeof buildApp>>) {
  const board = await app.inject({
    method: "GET",
    url: "/",
    headers: { accept: "application/json" },
  });
  assert.equal(board.statusCode, 200);
  return board.json().listings as Array<{
    id: string;
    bidUsd: number;
    rank: number;
    createdAt: string;
  }>;
}

async function payListing(
  app: Awaited<ReturnType<typeof buildApp>>,
  polar: FixturePolar,
  payload: { sponsorUrl: string; blurb: string; bidUsd: number },
) {
  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload,
  });
  assert.equal(created.statusCode, 200);
  const body = created.json() as { url: string };
  const polarId = new URL(body.url, "http://localhost").searchParams.get(
    "checkoutId",
  );
  assert.ok(polarId);
  const pending = findCheckout(app.db, polarId);
  assert.ok(pending);
  await completeCheckout(app.db, polar, polarId, app.now());
  return pending;
}

test("quoteListingBid charges the full first bid and only the raise difference", () => {
  assert.deepEqual(quoteListingBid(0, 5), {
    raise: false,
    currentBidUsd: 0,
    targetBidUsd: 5,
    amountUsd: 5,
  });
  assert.deepEqual(quoteListingBid(5, 8), {
    raise: true,
    currentBidUsd: 5,
    targetBidUsd: 8,
    amountUsd: 3,
  });
  assert.throws(
    () => quoteListingBid(0, 4),
    (err: unknown) => {
      assert.ok(err instanceof ListingError);
      assert.equal(err.code, "below_minimum");
      return true;
    },
  );
  assert.throws(
    () => quoteListingBid(5, 5),
    (err: unknown) => {
      assert.ok(err instanceof ListingError);
      assert.equal(err.code, "bid_not_higher");
      return true;
    },
  );
  assert.throws(
    () => quoteListingBid(8, 7),
    (err: unknown) => {
      assert.ok(err instanceof ListingError);
      assert.equal(err.code, "bid_not_higher");
      return true;
    },
  );
});

test("same URL $5 → $8 charges $3; createdAt unchanged; rank recomputed", async (t) => {
  const polar = new FixturePolar();
  const app = await buildApp({ polar, now: LIVE_NOW });
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const first = await startListingCheckout(
    app.db,
    polar,
    {
      sponsorUrl: "https://raise.example/cover",
      blurb: "Five dollars for the cover",
      bidUsd: 5,
    },
    new Date("2026-08-01T09:00:00.000Z"),
  );
  assert.equal(first.amountUsd, 5);
  assert.equal(first.targetBidUsd, 5);
  const paidFirst = await completeCheckout(
    app.db,
    polar,
    first.polarCheckoutId,
    new Date("2026-08-01T09:05:00.000Z"),
  );
  assert.equal(paidFirst.amountUsd, 5);
  assert.equal(paidFirst.targetBidUsd, 5);

  const listingAfterFirst = findListingById(app.db, first.listingId);
  assert.ok(listingAfterFirst);
  assert.equal(listingAfterFirst.bidUsd, 5);
  const createdAt = listingAfterFirst.createdAt;
  assert.equal(createdAt, "2026-08-01T09:05:00.000Z");

  const rival = await startListingCheckout(
    app.db,
    polar,
    {
      sponsorUrl: "https://rival.example/cover",
      blurb: "Seven takes the cover for now",
      bidUsd: 7,
    },
    new Date("2026-08-01T10:00:00.000Z"),
  );
  await completeCheckout(
    app.db,
    polar,
    rival.polarCheckoutId,
    new Date("2026-08-01T10:05:00.000Z"),
  );

  const beforeRaise = await boardListings(app);
  assert.deepEqual(
    beforeRaise.map((row) => ({ id: row.id, rank: row.rank, bidUsd: row.bidUsd })),
    [
      { id: rival.listingId, rank: 1, bidUsd: 7 },
      { id: first.listingId, rank: 2, bidUsd: 5 },
    ],
  );

  const raised = await startListingCheckout(
    app.db,
    polar,
    {
      sponsorUrl: "https://raise.example/cover",
      blurb: "A different blurb must not fork a row",
      bidUsd: 8,
    },
    new Date("2026-08-01T11:00:00.000Z"),
  );
  assert.equal(raised.listingId, first.listingId);
  assert.equal(raised.amountUsd, 3);
  assert.equal(raised.targetBidUsd, 8);
  assert.equal(listingCount(app.db), 2);

  const unpaidRaise = findListingById(app.db, first.listingId);
  assert.ok(unpaidRaise);
  assert.equal(unpaidRaise.bidUsd, 5);
  assert.equal(unpaidRaise.createdAt, createdAt);
  assert.deepEqual(
    (await boardListings(app)).map((row) => ({
      id: row.id,
      rank: row.rank,
      bidUsd: row.bidUsd,
    })),
    [
      { id: rival.listingId, rank: 1, bidUsd: 7 },
      { id: first.listingId, rank: 2, bidUsd: 5 },
    ],
  );

  await completeCheckout(
    app.db,
    polar,
    raised.polarCheckoutId,
    new Date("2026-08-01T11:05:00.000Z"),
  );

  const listingAfterRaise = findListingById(app.db, first.listingId);
  assert.ok(listingAfterRaise);
  assert.equal(listingAfterRaise.bidUsd, 8);
  assert.equal(listingAfterRaise.createdAt, createdAt);
  assert.equal(listingAfterRaise.blurb, "Five dollars for the cover");
  assert.equal(listingCount(app.db), 2);

  const afterRaise = await boardListings(app);
  assert.deepEqual(
    afterRaise.map((row) => ({
      id: row.id,
      rank: row.rank,
      bidUsd: row.bidUsd,
      createdAt: row.createdAt,
    })),
    [
      {
        id: first.listingId,
        rank: 1,
        bidUsd: 8,
        createdAt,
      },
      {
        id: rival.listingId,
        rank: 2,
        bidUsd: 7,
        createdAt: "2026-08-01T10:05:00.000Z",
      },
    ],
  );
});

test("POST /listings raise of the same URL pays the difference only", async (t) => {
  const polar = new FixturePolar();
  const app = await buildApp({ polar, now: LIVE_NOW });
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const first = await payListing(app, polar, {
    sponsorUrl: "https://same.example/path",
    blurb: "Original five",
    bidUsd: 5,
  });
  assert.equal(first.amountUsd, 5);
  const createdAt = findListingById(app.db, first.listingId)?.createdAt;
  assert.ok(createdAt);

  const raised = await payListing(app, polar, {
    sponsorUrl: "https://same.example/path",
    blurb: "Must stay one row",
    bidUsd: 8,
  });
  assert.equal(raised.listingId, first.listingId);
  assert.equal(raised.amountUsd, 3);
  assert.equal(raised.targetBidUsd, 8);
  assert.equal(listingCount(app.db), 1);

  const stored = findListingById(app.db, first.listingId);
  assert.ok(stored);
  assert.equal(stored.bidUsd, 8);
  assert.equal(stored.createdAt, createdAt);
  const board = await boardListings(app);
  assert.equal(board.length, 1);
  assert.equal(board[0]?.id, first.listingId);
  assert.equal(board[0]?.rank, 1);
  assert.equal(board[0]?.bidUsd, 8);
});

test("non-increasing raise is rejected and leaves bid and createdAt unchanged", async (t) => {
  const polar = new FixturePolar();
  const app = await buildApp({ polar, now: LIVE_NOW });
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const first = await payListing(app, polar, {
    sponsorUrl: "https://stay.example",
    blurb: "Do not lower this bid",
    bidUsd: 8,
  });
  const before = findListingById(app.db, first.listingId);
  assert.ok(before);

  const same = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://stay.example",
      blurb: "Same eight is not a raise",
      bidUsd: 8,
    },
  });
  assert.equal(same.statusCode, 400);
  assert.deepEqual(same.json(), { error: "bid_not_higher" });

  const lower = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://stay.example",
      blurb: "Seven is not a raise",
      bidUsd: 7,
    },
  });
  assert.equal(lower.statusCode, 400);
  assert.deepEqual(lower.json(), { error: "bid_not_higher" });

  const after = findListingById(app.db, first.listingId);
  assert.ok(after);
  assert.equal(after.bidUsd, 8);
  assert.equal(after.createdAt, before.createdAt);
  assert.equal(listingCount(app.db), 1);
  const board = await boardListings(app);
  assert.equal(board.length, 1);
  assert.equal(board[0]?.bidUsd, 8);
});

test("applyPaidBid raise updates bidUsd only", async (t) => {
  const polar = new FixturePolar();
  const app = await buildApp({ polar, now: LIVE_NOW });
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const first = await payListing(app, polar, {
    sponsorUrl: "https://apply.example",
    blurb: "Apply raise in listings",
    bidUsd: 5,
  });
  const before = findListingById(app.db, first.listingId);
  assert.ok(before);
  const raised = applyPaidBid(
    app.db,
    first.listingId,
    9,
    new Date("2026-08-02T00:00:00.000Z"),
  );
  assert.equal(raised.id, first.listingId);
  assert.equal(raised.bidUsd, 9);
  assert.equal(raised.createdAt, before.createdAt);
  assert.notEqual(raised.createdAt, "2026-08-02T00:00:00.000Z");
  assert.throws(
    () => applyPaidBid(app.db, first.listingId, 9, LIVE_NOW),
    (err: unknown) => {
      assert.ok(err instanceof ListingError);
      assert.equal(err.code, "bid_not_higher");
      return true;
    },
  );
});
