import assert from "node:assert/strict";
import { test } from "node:test";
import {
  completeCheckout,
  findCheckout,
  findListingById,
} from "../src/billing/create.js";
import { FixturePolar } from "../src/billing/fixture.js";
import type { AppDb, Listing } from "../src/db.js";
import { incrementPublicClick } from "../src/http/routes/click.js";
import { ListingError } from "../src/listings.js";
import { buildApp } from "../src/server.js";
import { canonicalizeSponsorUrl, redirectTarget } from "../src/url.js";

const OPEN_ISSUE = "2099-01-05";

function insertIssue(db: AppDb, issueDate: string, status: "open" | "closed"): void {
  db.prepare(
    "INSERT INTO issues (issue_date, status, closed_at) VALUES (?, ?, ?)",
  ).run(issueDate, status, status === "closed" ? "2020-01-06T00:00:00.000Z" : null);
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

async function boardJson(app: Awaited<ReturnType<typeof buildApp>>, path = "/") {
  const board = await app.inject({
    method: "GET",
    url: path,
    headers: { accept: "application/json" },
  });
  assert.equal(board.statusCode, 200);
  return board.json() as {
    listings: Array<{
      id: string;
      rank: number;
      bidUsd: number;
      clicks: number;
      createdAt: string;
    }>;
  };
}

test("GET /l/:id 302s to the cleaned sponsor URL and increments public clicks", async (t) => {
  const polar = new FixturePolar();
  const app = await buildApp({ polar });
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const raw =
    "https://Sponsor.Example/cover?utm_source=x&fbclid=y&keep=yes#frag";
  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: raw,
      blurb: "Tracking must not survive the redirect",
      bidUsd: 5,
    },
  });
  assert.equal(created.statusCode, 200);
  const polarId = new URL(
    (created.json() as { url: string }).url,
    "http://localhost",
  ).searchParams.get("checkoutId");
  assert.ok(polarId);
  const pending = findCheckout(app.db, polarId);
  assert.ok(pending);
  await completeCheckout(app.db, polar, polarId);

  const listing = findListingById(app.db, pending.listingId);
  assert.ok(listing);
  assert.equal(listing.clicks, 0);
  const canonical = canonicalizeSponsorUrl(raw);
  assert.equal(canonical.ok, true);
  if (!canonical.ok) {
    throw new Error("expected canonical url");
  }
  assert.equal(listing.sponsorUrl, canonical.url);
  assert.equal(redirectTarget(listing.sponsorUrl), listing.sponsorUrl);
  assert.doesNotMatch(listing.sponsorUrl, /utm_/);
  assert.doesNotMatch(listing.sponsorUrl, /fbclid/);

  const click = await app.inject({
    method: "GET",
    url: `/l/${listing.id}`,
  });
  assert.equal(click.statusCode, 302);
  assert.equal(click.headers.location, listing.sponsorUrl);
  assert.notEqual(click.headers.location, raw);
  assert.doesNotMatch(String(click.headers.location), /utm_/);
  assert.doesNotMatch(String(click.headers.location), /fbclid/);
  assert.doesNotMatch(String(click.headers.location), /#/);

  const after = findListingById(app.db, listing.id);
  assert.ok(after);
  assert.equal(after.clicks, 1);

  const board = await boardJson(app);
  const publicRow = board.listings.find((row) => row.id === listing.id);
  assert.ok(publicRow);
  assert.equal(publicRow.clicks, 1);

  const html = await app.inject({ method: "GET", url: "/" });
  assert.equal(html.statusCode, 200);
  assert.match(html.body, /1 clicks/);

  const again = await app.inject({ method: "GET", url: `/l/${listing.id}` });
  assert.equal(again.statusCode, 302);
  assert.equal(again.headers.location, listing.sponsorUrl);
  assert.equal(findListingById(app.db, listing.id)?.clicks, 2);
  assert.equal(
    (await boardJson(app)).listings.find((row) => row.id === listing.id)?.clicks,
    2,
  );
});

test("clicks do not change rank when bids tie", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");
  insertListing(app.db, {
    id: "lst_older",
    issueDate: OPEN_ISSUE,
    sponsorUrl: "https://older.example/cover",
    blurb: "Older five",
    bidUsd: 5,
    createdAt: "2026-08-01T00:00:00.000Z",
    clicks: 0,
  });
  insertListing(app.db, {
    id: "lst_newer",
    issueDate: OPEN_ISSUE,
    sponsorUrl: "https://newer.example/cover",
    blurb: "Newer five",
    bidUsd: 5,
    createdAt: "2026-08-02T00:00:00.000Z",
    clicks: 0,
  });

  const before = await boardJson(app);
  assert.deepEqual(
    before.listings.map((row) => ({ id: row.id, rank: row.rank, clicks: row.clicks })),
    [
      { id: "lst_older", rank: 1, clicks: 0 },
      { id: "lst_newer", rank: 2, clicks: 0 },
    ],
  );

  for (let i = 0; i < 9; i += 1) {
    const click = await app.inject({ method: "GET", url: "/l/lst_newer" });
    assert.equal(click.statusCode, 302);
    assert.equal(click.headers.location, "https://newer.example/cover");
  }

  const after = await boardJson(app);
  assert.deepEqual(
    after.listings.map((row) => ({ id: row.id, rank: row.rank, clicks: row.clicks })),
    [
      { id: "lst_older", rank: 1, clicks: 0 },
      { id: "lst_newer", rank: 2, clicks: 9 },
    ],
  );
  assert.equal(findListingById(app.db, "lst_older")?.createdAt, "2026-08-01T00:00:00.000Z");
  assert.equal(findListingById(app.db, "lst_newer")?.createdAt, "2026-08-02T00:00:00.000Z");
  assert.equal(findListingById(app.db, "lst_older")?.bidUsd, 5);
  assert.equal(findListingById(app.db, "lst_newer")?.bidUsd, 5);
});

test("unknown, unpaid, and rejected listings 404 and do not increment", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");
  insertListing(app.db, {
    id: "lst_unpaid",
    issueDate: OPEN_ISSUE,
    sponsorUrl: "https://unpaid.example/cover",
    blurb: "Not paid yet",
    bidUsd: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    clicks: 0,
  });
  insertListing(app.db, {
    id: "lst_rejected",
    issueDate: OPEN_ISSUE,
    sponsorUrl: "https://rejected.example/cover",
    blurb: "Taken down",
    bidUsd: 9,
    createdAt: "2026-08-01T00:00:00.000Z",
    clicks: 3,
    status: "rejected",
  });

  const missing = await app.inject({ method: "GET", url: "/l/does-not-exist" });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.json(), { error: "unknown_listing" });
  assert.equal(missing.headers.location, undefined);

  const unpaid = await app.inject({ method: "GET", url: "/l/lst_unpaid" });
  assert.equal(unpaid.statusCode, 404);
  assert.deepEqual(unpaid.json(), { error: "unknown_listing" });
  assert.equal(unpaid.headers.location, undefined);
  assert.equal(findListingById(app.db, "lst_unpaid")?.clicks, 0);

  const rejected = await app.inject({ method: "GET", url: "/l/lst_rejected" });
  assert.equal(rejected.statusCode, 404);
  assert.deepEqual(rejected.json(), { error: "unknown_listing" });
  assert.equal(rejected.headers.location, undefined);
  assert.equal(findListingById(app.db, "lst_rejected")?.clicks, 3);

  assert.throws(
    () => incrementPublicClick(app.db, "does-not-exist"),
    (err: unknown) => {
      assert.ok(err instanceof ListingError);
      assert.equal(err.code, "unknown_listing");
      assert.equal(err.statusCode, 404);
      return true;
    },
  );
});

test("archived paid listing still 302s; clicks stay public on the archive", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "closed");
  insertListing(app.db, {
    id: "lst_archive",
    issueDate: OPEN_ISSUE,
    sponsorUrl: "https://archive.example/cover",
    blurb: "Frozen cover",
    bidUsd: 7,
    createdAt: "2026-08-01T00:00:00.000Z",
    clicks: 4,
  });

  const click = await app.inject({ method: "GET", url: "/l/lst_archive" });
  assert.equal(click.statusCode, 302);
  assert.equal(click.headers.location, "https://archive.example/cover");
  assert.equal(findListingById(app.db, "lst_archive")?.clicks, 5);

  const archive = await boardJson(app, `/issue/${OPEN_ISSUE}`);
  assert.equal(archive.listings[0]?.id, "lst_archive");
  assert.equal(archive.listings[0]?.clicks, 5);
  assert.equal(archive.listings[0]?.rank, 1);
});
