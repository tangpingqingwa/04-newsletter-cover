import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppDb, Listing } from "../src/db.js";
import { renderBoardHtml } from "../src/http/routes/board.js";
import {
  isPolarPaidListing,
  paidListings,
  rankListings,
  type RankableListing,
} from "../src/rank.js";
import { buildApp } from "../src/server.js";

const ISSUE = "2099-01-05";

function listing(
  partial: Partial<RankableListing> &
    Pick<RankableListing, "id" | "bidUsd" | "createdAt">,
): RankableListing {
  return {
    issueDate: ISSUE,
    sponsorUrl: `https://${partial.id}.example`,
    blurb: `Blurb ${partial.id}`,
    clicks: 0,
    status: "active",
    ...partial,
  };
}

test("higher bid ranks above a lower bid", () => {
  const ranked = rankListings([
    listing({ id: "low", bidUsd: 5, createdAt: "2026-08-01T00:00:00.000Z" }),
    listing({ id: "high", bidUsd: 7, createdAt: "2026-08-02T00:00:00.000Z" }),
  ]);
  assert.deepEqual(
    ranked.map((row) => ({ id: row.id, rank: row.rank })),
    [
      { id: "high", rank: 1 },
      { id: "low", rank: 2 },
    ],
  );
});

test("equal bids: older createdAt wins (SPEC older-wins-ties)", () => {
  const ranked = rankListings([
    listing({
      id: "newer",
      bidUsd: 5,
      createdAt: "2026-08-02T00:00:00.000Z",
      sponsorUrl: "https://aaa.example",
      blurb: "aaa",
      clicks: 99,
    }),
    listing({
      id: "older",
      bidUsd: 5,
      createdAt: "2026-08-01T00:00:00.000Z",
      sponsorUrl: "https://zzz.example",
      blurb: "zzz",
      clicks: 0,
    }),
  ]);
  assert.equal(ranked[0]?.id, "older");
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[1]?.id, "newer");
  assert.equal(ranked[1]?.rank, 2);
});

test("below #1 still lists: $5 then $7 then $6 sits at rank 2", () => {
  const ranked = rankListings([
    listing({ id: "first", bidUsd: 5, createdAt: "2026-08-01T00:00:00.000Z" }),
    listing({ id: "top", bidUsd: 7, createdAt: "2026-08-02T00:00:00.000Z" }),
    listing({ id: "mid", bidUsd: 6, createdAt: "2026-08-03T00:00:00.000Z" }),
  ]);
  assert.deepEqual(
    ranked.map((row) => ({ id: row.id, rank: row.rank, bidUsd: row.bidUsd })),
    [
      { id: "top", rank: 1, bidUsd: 7 },
      { id: "mid", rank: 2, bidUsd: 6 },
      { id: "first", rank: 3, bidUsd: 5 },
    ],
  );
});

test("rejected and unpaid rows do not rank", () => {
  const ranked = rankListings([
    listing({ id: "live", bidUsd: 5, createdAt: "2026-08-01T00:00:00.000Z" }),
    listing({
      id: "veto",
      bidUsd: 9,
      createdAt: "2026-08-01T00:00:00.000Z",
      status: "rejected",
    }),
    listing({
      id: "pending-pay",
      bidUsd: 8,
      createdAt: "2026-08-01T00:00:00.000Z",
      paid: false,
    }),
  ]);
  assert.deepEqual(
    ranked.map((row) => row.id),
    ["live"],
  );
});

test("unpaid stays off the folio — No Cover · #1 until Polar reports paid", () => {
  const unpaid = listing({
    id: "ghost",
    bidUsd: 99,
    createdAt: "2026-08-01T00:00:00.000Z",
    paid: false,
    blurb: "Abandoned Polar checkout",
    sponsorUrl: "https://ghost.example/cover",
  });
  const abandoned = listing({
    id: "vapor",
    bidUsd: 80,
    createdAt: "1970-01-01T00:00:00.000Z",
    blurb: "Epoch createdAt is not Polar paid",
    sponsorUrl: "https://vapor.example/cover",
  });
  const emptyCreated = listing({
    id: "blank",
    bidUsd: 70,
    createdAt: "   ",
    blurb: "Blank createdAt is leftover",
    sponsorUrl: "https://blank.example/cover",
  });
  const zeroBid = listing({
    id: "zero",
    bidUsd: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    blurb: "Waiting on Polar",
    sponsorUrl: "https://zero.example/cover",
  });
  const paid = listing({
    id: "paid-only",
    bidUsd: 5,
    createdAt: "2026-08-01T00:00:05.000Z",
    blurb: "Widgets for the next issue",
    sponsorUrl: "https://sponsor.example/pitch",
  });

  assert.equal(isPolarPaidListing(unpaid), false);
  assert.equal(isPolarPaidListing(abandoned), false);
  assert.equal(isPolarPaidListing(emptyCreated), false);
  assert.equal(isPolarPaidListing(zeroBid), false);
  assert.equal(isPolarPaidListing(paid), true);
  assert.equal(isPolarPaidListing({ bidUsd: 12 }), true);
  assert.deepEqual(
    paidListings([unpaid, abandoned, emptyCreated, zeroBid, paid]).map((row) => row.id),
    ["paid-only"],
  );
  assert.deepEqual(rankListings([unpaid, abandoned, emptyCreated, zeroBid]), []);
  const mixed = rankListings([unpaid, abandoned, emptyCreated, zeroBid, paid]);
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0]?.id, "paid-only");
  assert.equal(mixed[0]?.rank, 1);
  assert.doesNotMatch(
    mixed.map((row) => row.id).join(","),
    /ghost|vapor|blank|zero/,
  );
});

test("other issueDate rows are excluded when an issue is requested", () => {
  const ranked = rankListings(
    [
      listing({ id: "here", bidUsd: 5, createdAt: "2026-08-01T00:00:00.000Z" }),
      listing({
        id: "there",
        bidUsd: 50,
        createdAt: "2026-08-01T00:00:00.000Z",
        issueDate: "2099-01-12",
      }),
    ],
    { issueDate: ISSUE },
  );
  assert.deepEqual(
    ranked.map((row) => row.id),
    ["here"],
  );
});

test("empty listings rank to an empty board, not an error", () => {
  assert.deepEqual(rankListings([]), []);
});

test("EDITOR_VETO unset keeps a paid active listing visible", () => {
  const previous = process.env.EDITOR_VETO;
  delete process.env.EDITOR_VETO;
  try {
    const ranked = rankListings([
      listing({ id: "paid", bidUsd: 5, createdAt: "2026-08-01T00:00:00.000Z" }),
    ]);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.id, "paid");
  } finally {
    if (previous === undefined) {
      delete process.env.EDITOR_VETO;
    } else {
      process.env.EDITOR_VETO = previous;
    }
  }
});

function insertIssue(db: AppDb, issueDate: string, status: "open" | "closed"): void {
  db.prepare(
    "INSERT INTO issues (issue_date, status, closed_at) VALUES (?, ?, ?)",
  ).run(issueDate, status, status === "closed" ? "2026-08-17T00:00:00.000Z" : null);
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

test("GET / empty board is valid HTML and JSON, not an error", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const html = await app.inject({ method: "GET", url: "/" });
  assert.equal(html.statusCode, 200);
  assert.match(html.headers["content-type"] ?? "", /text\/html/);
  assert.match(html.body, /<!DOCTYPE html>/i);
  assert.match(html.body, /<html/i);
  assert.match(html.body, /<\/html>/i);
  assert.match(html.body, /No paid listings on this board/);
  assert.match(html.body, /no cover sold/i);
  assert.doesNotMatch(html.body, /data-rank="1"/);

  const json = await app.inject({
    method: "GET",
    url: "/",
    headers: { accept: "application/json" },
  });
  assert.equal(json.statusCode, 200);
  assert.match(json.headers["content-type"] ?? "", /application\/json/);
  assert.deepEqual(json.json(), {
    issueDate: null,
    status: null,
    listings: [],
  });
});

test("GET /issue/:date empty archive is valid HTML/JSON, not an error", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const html = await app.inject({ method: "GET", url: `/issue/${ISSUE}` });
  assert.equal(html.statusCode, 200);
  assert.match(html.headers["content-type"] ?? "", /text\/html/);
  assert.match(html.body, /<!DOCTYPE html>/i);
  assert.match(html.body, /No paid listings on this board/);
  assert.match(html.body, /no cover sold/i);
  assert.match(html.body, new RegExp(ISSUE));
  assert.doesNotMatch(html.body, /data-rank="1"/);

  const json = await app.inject({
    method: "GET",
    url: `/issue/${ISSUE}?format=json`,
  });
  assert.equal(json.statusCode, 200);
  assert.deepEqual(json.json(), {
    issueDate: ISSUE,
    status: null,
    listings: [],
  });
});

test("public board ranks paid listings; older $5 stays #1; unpaid stays off", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  insertIssue(app.db, ISSUE, "open");
  insertListing(app.db, {
    id: "lst_old",
    issueDate: ISSUE,
    sponsorUrl: "https://older.example",
    blurb: "Older five",
    bidUsd: 5,
    createdAt: "2026-08-01T00:00:00.000Z",
    clicks: 0,
  });
  insertListing(app.db, {
    id: "lst_new",
    issueDate: ISSUE,
    sponsorUrl: "https://newer.example",
    blurb: "Newer five",
    bidUsd: 5,
    createdAt: "2026-08-02T00:00:00.000Z",
    clicks: 40,
  });
  insertListing(app.db, {
    id: "lst_top",
    issueDate: ISSUE,
    sponsorUrl: "https://seven.example",
    blurb: "Seven",
    bidUsd: 7,
    createdAt: "2026-08-03T00:00:00.000Z",
  });
  insertListing(app.db, {
    id: "lst_mid",
    issueDate: ISSUE,
    sponsorUrl: "https://six.example",
    blurb: "Six",
    bidUsd: 6,
    createdAt: "2026-08-04T00:00:00.000Z",
  });
  insertListing(app.db, {
    id: "lst_rejected",
    issueDate: ISSUE,
    sponsorUrl: "https://rejected.example",
    blurb: "Gone",
    bidUsd: 90,
    createdAt: "2026-08-01T00:00:00.000Z",
    status: "rejected",
  });
  app.db
    .prepare(
      `INSERT INTO checkouts (id, listing_id, amount_usd, target_bid_usd, polar_checkout_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("chk_unpaid", "lst_unpaid", 50, 50, "polar_unpaid", "pending");

  const home = await app.inject({
    method: "GET",
    url: "/",
    headers: { accept: "application/json" },
  });
  assert.equal(home.statusCode, 200);
  const homeBody = home.json();
  assert.equal(homeBody.issueDate, ISSUE);
  assert.equal(homeBody.status, "open");
  assert.deepEqual(
    homeBody.listings.map((row: { id: string; rank: number; bidUsd: number }) => ({
      id: row.id,
      rank: row.rank,
      bidUsd: row.bidUsd,
    })),
    [
      { id: "lst_top", rank: 1, bidUsd: 7 },
      { id: "lst_mid", rank: 2, bidUsd: 6 },
      { id: "lst_old", rank: 3, bidUsd: 5 },
      { id: "lst_new", rank: 4, bidUsd: 5 },
    ],
  );

  const html = await app.inject({ method: "GET", url: "/" });
  assert.equal(html.statusCode, 200);
  assert.match(html.body, /#1/);
  assert.match(html.body, /\$7/);
  assert.match(html.body, /Seven/);
  assert.doesNotMatch(html.body, /Gone/);
  assert.doesNotMatch(html.body, /lst_unpaid/);

  const archive = await app.inject({
    method: "GET",
    url: `/issue/${ISSUE}`,
    headers: { accept: "application/json" },
  });
  assert.deepEqual(
    archive.json().listings.map((row: { id: string }) => row.id),
    homeBody.listings.map((row: { id: string }) => row.id),
  );
});

test("clicks do not change rank when bids tie", () => {
  const board = {
    issueDate: ISSUE,
    status: "open" as const,
    listings: rankListings([
      listing({
        id: "quiet",
        bidUsd: 10,
        createdAt: "2026-08-01T00:00:00.000Z",
        clicks: 0,
      }),
      listing({
        id: "loud",
        bidUsd: 10,
        createdAt: "2026-08-02T00:00:00.000Z",
        clicks: 500,
      }),
    ]).map((row) => ({
      rank: row.rank,
      id: row.id,
      issueDate: row.issueDate,
      sponsorUrl: row.sponsorUrl,
      blurb: row.blurb,
      bidUsd: row.bidUsd,
      createdAt: row.createdAt,
      clicks: row.clicks,
    })),
  };
  assert.equal(board.listings[0]?.id, "quiet");
  const html = renderBoardHtml(board);
  assert.match(html, /data-rank="1"/);
  assert.match(html, /quiet/);
});

test("malformed issue date is an empty valid board, not an error", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const html = await app.inject({ method: "GET", url: "/issue/nope" });
  assert.equal(html.statusCode, 200);
  assert.match(html.headers["content-type"] ?? "", /text\/html/);
  assert.match(html.body, /<!DOCTYPE html>/i);
  assert.match(html.body, /No paid listings on this board/);
  assert.match(html.body, /no cover sold/i);
  assert.doesNotMatch(html.body, /data-rank="1"/);

  const json = await app.inject({
    method: "GET",
    url: "/issue/nope",
    headers: { accept: "application/json" },
  });
  assert.equal(json.statusCode, 200);
  assert.deepEqual(json.json(), {
    issueDate: null,
    status: null,
    listings: [],
  });
});
