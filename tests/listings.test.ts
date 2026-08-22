import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppDb, Listing } from "../src/db.js";
import {
  createListing,
  findListingByUrlAndIssue,
  ListingError,
} from "../src/listings.js";
import { buildApp } from "../src/server.js";

const OPEN_ISSUE = "2099-01-05";
const CLOSED_ISSUE = "2020-01-06";
const OTHER_FUTURE = "2099-06-01";

function insertIssue(
  db: AppDb,
  issueDate: string,
  status: "open" | "closed",
): void {
  db.prepare(
    "INSERT INTO issues (issue_date, status, closed_at) VALUES (?, ?, ?)",
  ).run(issueDate, status, status === "closed" ? "2020-01-06T00:00:00.000Z" : null);
}

function listingCount(db: AppDb): number {
  const row = db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM listings").get();
  assert.ok(row);
  return row.n;
}

test("createListing shape is sponsor URL + one-line blurb + stamped open issueDate", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const listing = createListing(app.db, {
    sponsorUrl: "https://sponsor.example/cover",
    blurb: "We make widgets for newsletters",
    issueDate: "1999-01-01",
    company: "Acme",
    logo: "https://cdn.example/logo.png",
  });

  assert.equal(listing.sponsorUrl, "https://sponsor.example/cover");
  assert.equal(listing.blurb, "We make widgets for newsletters");
  assert.equal(listing.issueDate, OPEN_ISSUE);
  assert.notEqual(listing.issueDate, "1999-01-01");
  assert.ok(listing.id);
  assert.match(listing.createdAt, /Z$/);
  assert.equal(listing.clicks, 0);
  assert.equal(listing.status, "active");
  assert.equal("company" in listing, false);
  assert.equal("logo" in listing, false);
});

test("POST /listings stamps the open issue and ignores a client issueDate", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, CLOSED_ISSUE, "closed");
  insertIssue(app.db, OPEN_ISSUE, "open");
  insertIssue(app.db, OTHER_FUTURE, "open");

  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "http://news.example/slot",
      blurb: "First slot on the next issue",
      issueDate: OTHER_FUTURE,
    },
  });

  assert.equal(created.statusCode, 200);
  const body = created.json() as Listing;
  assert.equal(body.sponsorUrl, "http://news.example/slot");
  assert.equal(body.blurb, "First slot on the next issue");
  assert.equal(body.issueDate, OPEN_ISSUE);
  assert.notEqual(body.issueDate, OTHER_FUTURE);
  assert.notEqual(body.issueDate, CLOSED_ISSUE);
});

test("same sponsor URL on the same issue is unique — not a second row", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const first = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://same.example/path",
      blurb: "Original blurb",
    },
  });
  const second = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://same.example/path",
      blurb: "A different blurb that must not fork a row",
    },
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  const a = first.json() as Listing;
  const b = second.json() as Listing;
  assert.equal(a.id, b.id);
  assert.equal(a.issueDate, OPEN_ISSUE);
  assert.equal(b.issueDate, OPEN_ISSUE);
  assert.equal(a.sponsorUrl, b.sponsorUrl);
  assert.equal(a.blurb, "Original blurb");
  assert.equal(b.blurb, "Original blurb");
  assert.equal(listingCount(app.db), 1);
  const stored = findListingByUrlAndIssue(
    app.db,
    "https://same.example/path",
    OPEN_ISSUE,
  );
  assert.ok(stored);
  assert.equal(stored.id, a.id);
});

test("different URLs on the open issue are separate rows", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const one = await app.inject({
    method: "POST",
    url: "/listings",
    payload: { sponsorUrl: "https://one.example", blurb: "One" },
  });
  const two = await app.inject({
    method: "POST",
    url: "/listings",
    payload: { sponsorUrl: "https://two.example", blurb: "Two" },
  });

  assert.equal(one.statusCode, 200);
  assert.equal(two.statusCode, 200);
  assert.notEqual(one.json().id, two.json().id);
  assert.equal(one.json().issueDate, OPEN_ISSUE);
  assert.equal(two.json().issueDate, OPEN_ISSUE);
  assert.equal(listingCount(app.db), 2);
});

test("unpaid create does not appear on the public board", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://unpaid.example",
      blurb: "Waiting on Polar",
    },
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().bidUsd, 0);

  const board = await app.inject({
    method: "GET",
    url: "/",
    headers: { accept: "application/json" },
  });
  assert.equal(board.statusCode, 200);
  assert.deepEqual(board.json().listings, []);
});

test("POST /listings without an open issue is rejected", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, CLOSED_ISSUE, "closed");

  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://nobody.example",
      blurb: "No window",
    },
  });
  assert.equal(created.statusCode, 409);
  assert.deepEqual(created.json(), { error: "no_open_issue" });
  assert.equal(listingCount(app.db), 0);
});

test("blurb is trimmed, 1–120, single line, and must not contain a URL", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const trimmed = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://trim.example",
      blurb: "  Padded blurb  ",
    },
  });
  assert.equal(trimmed.statusCode, 200);
  assert.equal(trimmed.json().blurb, "Padded blurb");

  const empty = await app.inject({
    method: "POST",
    url: "/listings",
    payload: { sponsorUrl: "https://ok.example", blurb: "   " },
  });
  assert.equal(empty.statusCode, 400);
  assert.equal(empty.json().error, "invalid_blurb");

  const tooLong = await app.inject({
    method: "POST",
    url: "/listings",
    payload: { sponsorUrl: "https://ok.example", blurb: "x".repeat(121) },
  });
  assert.equal(tooLong.statusCode, 400);
  assert.equal(tooLong.json().error, "invalid_blurb");

  const multiline = await app.inject({
    method: "POST",
    url: "/listings",
    payload: { sponsorUrl: "https://ok.example", blurb: "line one\nline two" },
  });
  assert.equal(multiline.statusCode, 400);
  assert.equal(multiline.json().error, "invalid_blurb");

  const withUrl = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://ok.example",
      blurb: "See https://spam.example",
    },
  });
  assert.equal(withUrl.statusCode, 400);
  assert.equal(withUrl.json().error, "invalid_blurb");
});

test("sponsor URL must be http or https", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const missing = await app.inject({
    method: "POST",
    url: "/listings",
    payload: { blurb: "No url" },
  });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.json().error, "invalid_url");

  const javascript = await app.inject({
    method: "POST",
    url: "/listings",
    payload: { sponsorUrl: "javascript:alert(1)", blurb: "Nope" },
  });
  assert.equal(javascript.statusCode, 400);
  assert.equal(javascript.json().error, "invalid_url");

  const mailto = await app.inject({
    method: "POST",
    url: "/listings",
    payload: { sponsorUrl: "mailto:hi@example.com", blurb: "Nope" },
  });
  assert.equal(mailto.statusCode, 400);
  assert.equal(mailto.json().error, "invalid_url");
});

test("createListing throws ListingError when the body is not an object", () => {
  assert.throws(
    () => createListing({} as AppDb, null),
    (err: unknown) => {
      assert.ok(err instanceof ListingError);
      assert.equal(err.code, "invalid_listing");
      return true;
    },
  );
});
