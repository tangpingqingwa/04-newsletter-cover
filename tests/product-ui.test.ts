import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppDb, Listing } from "../src/db.js";
import { renderBoardHtml } from "../src/http/routes/board.js";
import { buildApp } from "../src/server.js";
import { spokenIssueDate } from "../src/views/skin.js";

const ISSUE = "2099-01-05";

function insertIssue(db: AppDb, issueDate: string, status: "open" | "closed"): void {
  db.prepare(
    "INSERT INTO issues (issue_date, status, closed_at) VALUES (?, ?, ?)",
  ).run(issueDate, status, status === "closed" ? `${issueDate}T00:00:00.000Z` : null);
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

test("spoken issue date is a print folio, not a form label", () => {
  assert.equal(spokenIssueDate("2026-08-24"), "Monday, August 24, 2026");
  assert.equal(spokenIssueDate("not-a-date"), "not-a-date");
});

test("open board is a print masthead: folio OPEN, Claim #1, dashed amount, ±, Outbid", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, ISSUE, "open");

  const html = await app.inject({ method: "GET", url: "/" });
  assert.equal(html.statusCode, 200);
  const body = html.body;
  assert.match(body, /class="masthead"/);
  assert.match(body, /class="nameplate"/);
  assert.match(body, /data-issue-date="2099-01-05"/);
  assert.match(body, /data-issue-status="open"/);
  assert.match(body, />OPEN</);
  assert.match(body, /Claim #1 for/);
  assert.match(body, /class="amount-field"/);
  assert.match(body, /text-decoration: underline dashed/);
  assert.match(body, /data-bid-step="-1"/);
  assert.match(body, /data-bid-step="1"/);
  assert.match(body, />−</);
  assert.match(body, />\+</);
  assert.match(body, /class="outbid"/);
  assert.match(body, />Outbid</);
  assert.match(body, /name="sponsorUrl"/);
  assert.match(body, /name="blurb"/);
  assert.match(body, /name="bidUsd"/);
  assert.match(body, /Leaderboard/);
  assert.match(body, /no cover sold/i);
  assert.match(body, /No paid listings on this board/);
  assert.match(body, /data-empty-issue="true"/);
  assert.doesNotMatch(body, /data-rank="1"/);
  assert.doesNotMatch(body, /class="cover-line"/);
  assert.doesNotMatch(body, /subscriber/i);
  assert.doesNotMatch(body, /open rate/i);
  assert.doesNotMatch(body, /article list/i);
});

test("empty archive is no cover sold; Claim #1 chrome must not count as a winner", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, ISSUE, "closed");

  const html = await app.inject({ method: "GET", url: `/issue/${ISSUE}` });
  assert.equal(html.statusCode, 200);
  assert.match(html.body, /data-issue-status="closed"/);
  assert.match(html.body, />CLOSED</);
  assert.match(html.body, /no cover sold/i);
  assert.match(html.body, /No paid listings on this board/);
  assert.match(html.body, /data-empty-issue="true"/);
  assert.doesNotMatch(html.body, /data-rank="1"/);
  assert.doesNotMatch(html.body, /class="cover-line"/);
  assert.doesNotMatch(html.body, /data-sponsor-url=/);
});

test("paid listing is a cover pitch: blurb, sponsor hop, $bid, clicks", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, ISSUE, "open");
  insertListing(app.db, {
    id: "lst_cover",
    issueDate: ISSUE,
    sponsorUrl: "https://sponsor.example/pitch",
    blurb: "Widgets for the next issue",
    bidUsd: 12,
    createdAt: "2026-08-01T00:00:00.000Z",
    clicks: 3,
  });

  const html = await app.inject({ method: "GET", url: "/" });
  assert.equal(html.statusCode, 200);
  assert.match(html.body, /class="cover-line cover"/);
  assert.match(html.body, /data-rank="1"/);
  assert.match(html.body, /data-id="lst_cover"/);
  assert.match(html.body, /Cover · #1/);
  assert.match(html.body, /Widgets for the next issue/);
  assert.match(html.body, /href="\/l\/lst_cover"/);
  assert.match(html.body, /sponsor\.example\/pitch/);
  assert.match(html.body, /class="bid"/);
  assert.match(html.body, /\$12/);
  assert.match(html.body, /3 clicks/);
  assert.doesNotMatch(html.body, /no cover sold/i);
  assert.doesNotMatch(html.body, /subscribers/i);
});

test("form POST /listings accepts urlencoded sponsor + blurb + bid", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, ISSUE, "open");

  const response = await app.inject({
    method: "POST",
    url: "/listings",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html",
    },
    payload:
      "sponsorUrl=https%3A%2F%2Fform.example%2Fcover&blurb=Cover%20pitch&bidUsd=5",
  });
  assert.equal(response.statusCode, 303);
  assert.match(response.headers.location ?? "", /checkoutId=fix_/);
});

test("renderBoardHtml empty payload never invents a ranked cover", () => {
  const html = renderBoardHtml({
    issueDate: null,
    status: null,
    listings: [],
  });
  assert.match(html, /class="masthead"/);
  assert.match(html, /no cover sold/i);
  assert.match(html, /No paid listings on this board/);
  assert.match(html, /Claim #1 for/);
  assert.doesNotMatch(html, /data-rank="1"/);
});
