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
  assert.match(body, /The next issue’s cover goes to whoever pays the most/);
  assert.doesNotMatch(body, /data-open-cover/);
  assert.doesNotMatch(body, /data-claim-cover/);
  assert.doesNotMatch(body, /This issue is closed/);
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
  assert.match(body, /class="claim-note" data-empty-issue="true"/);
  assert.match(body, /no cover sold/i);
  assert.match(body, /No paid listings on this board/);
  assert.match(body, /\$5 takes #1/);
  assert.doesNotMatch(body, /class="empty-issue"/);
  assert.doesNotMatch(body, /Nobody bought the cover/);
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
  assert.match(html.body, /This issue is closed/);
  assert.match(html.body, /not the next issue/);
  assert.match(html.body, /data-open-cover="true"/);
  assert.match(html.body, /href="\/"/);
  assert.match(html.body, /The open cover is on the stand/);
  assert.match(html.body, /no cover sold/i);
  assert.match(html.body, /No paid listings on this board/);
  assert.match(html.body, /class="empty-issue"/);
  assert.match(html.body, /data-empty-issue="true"/);
  assert.doesNotMatch(html.body, /goes to whoever pays the most/);
  assert.doesNotMatch(html.body, /id="claim"/);
  assert.doesNotMatch(html.body, /Claim #1 for/);
  assert.doesNotMatch(html.body, /data-claim-cover/);
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
  assert.match(html.body, /Paying less than #1 still lists/);
  assert.match(html.body, /You pay only the difference/);
  assert.match(html.body, /data-read-cover="true"/);
  assert.ok(html.body.indexOf('data-read-cover="true"') < html.body.indexOf('id="claim"'));
  assert.match(html.body, /data-claim-cover="true"/);
  assert.match(html.body, /href="#claim"/);
  assert.match(html.body, /Claim the next cover/);
  assert.ok(html.body.indexOf('data-claim-cover="true"') < html.body.indexOf('data-read-cover="true"'));
  assert.doesNotMatch(html.body, /no cover sold/i);
  assert.doesNotMatch(html.body, /class="claim-note" data-empty-issue="true"/);
  assert.doesNotMatch(html.body, /\$5 takes #1/);
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
  assert.match(html, /\$5 takes #1/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, /class="claim-note" data-empty-issue="true"/);
  assert.doesNotMatch(html, /class="empty-issue"/);
  assert.doesNotMatch(html, /data-rank="1"/);
});

test("empty open cover lets Claim #1 win the eye; empty archive stays a frozen folio", () => {
  const openEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [],
  });
  const claimAt = openEmpty.indexOf('id="claim"');
  const emptySlab = openEmpty.indexOf('class="empty-issue"');
  assert.notEqual(claimAt, -1);
  assert.equal(emptySlab, -1);
  assert.match(openEmpty, /class="claim-note" data-empty-issue="true"/);
  assert.match(openEmpty, /No cover sold/);
  assert.match(openEmpty, /No paid listings on this board/);
  assert.match(openEmpty, /\$5 takes #1/);
  assert.match(openEmpty, /Claim #1 for/);
  assert.match(openEmpty, /class="outbid"/);
  assert.doesNotMatch(openEmpty, /Already on this issue/);
  assert.doesNotMatch(openEmpty, /data-claim-cover/);
  assert.doesNotMatch(openEmpty, /data-rank="1"/);

  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });
  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-empty-issue="true"/);
  assert.match(closedEmpty, /This issue is frozen\. No cover sold/);
  assert.match(closedEmpty, /No paid listings on this board/);
  assert.match(closedEmpty, /This issue is closed/);
  assert.match(closedEmpty, /not the next issue/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.match(closedEmpty, /The open cover is on the stand/);
  assert.doesNotMatch(closedEmpty, /goes to whoever pays the most/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
  assert.doesNotMatch(closedEmpty, /class="outbid"/);
});

test("closed empty archive is not the next open cover", () => {
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });
  const openEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [],
  });

  assert.match(closedEmpty, /data-issue-status="closed"/);
  assert.match(closedEmpty, /This issue is closed\. It is not the next issue/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.match(closedEmpty, /href="\/"/);
  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /No paid listings on this board/);
  assert.doesNotMatch(closedEmpty, /goes to whoever pays the most/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
  assert.doesNotMatch(closedEmpty, /data-rank="1"/);

  assert.match(openEmpty, /The next issue’s cover goes to whoever pays the most/);
  assert.match(openEmpty, /Claim #1 for/);
  assert.match(openEmpty, /class="outbid"/);
  assert.doesNotMatch(openEmpty, /data-open-cover/);
  assert.doesNotMatch(openEmpty, /This issue is closed/);
});

test("occupied open / lets the sold cover win the eye", () => {
  const occupiedOpen = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [
      {
        rank: 1,
        id: "lst_cover",
        sponsorUrl: "https://sponsor.example/pitch",
        blurb: "Widgets for the next issue",
        bidUsd: 12,
        clicks: 3,
      },
      {
        rank: 2,
        id: "lst_two",
        sponsorUrl: "https://second.example/also",
        blurb: "Also listed",
        bidUsd: 6,
        clicks: 0,
      },
    ],
  });
  const emptyOpen = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [],
  });
  const closedOccupied = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [
      {
        rank: 1,
        id: "lst_won",
        sponsorUrl: "https://won.example/cover",
        blurb: "Frozen winner",
        bidUsd: 20,
        clicks: 1,
      },
    ],
  });

  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const coverAt = occupiedOpen.indexOf('class="cover-line cover"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(rackAt, -1);
  assert.notEqual(coverAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(coverAt < claimAt);
  assert.ok(rackAt < claimAt);
  assert.match(occupiedOpen, /data-read-cover="true"/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.match(occupiedOpen, /Paying less than #1 still lists/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  const emptyClaim = emptyOpen.indexOf('id="claim"');
  assert.notEqual(emptyClaim, -1);
  assert.equal(emptyOpen.indexOf('class="cover-rack"'), -1);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);

  const closedHint = closedOccupied.indexOf("This issue is frozen");
  const closedCover = closedOccupied.indexOf('class="cover-line cover"');
  assert.notEqual(closedHint, -1);
  assert.notEqual(closedCover, -1);
  assert.ok(closedHint < closedCover);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);
});

test("occupied open / names one hop to claim the next cover", () => {
  const occupiedOpen = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [
      {
        rank: 1,
        id: "lst_cover",
        sponsorUrl: "https://sponsor.example/pitch",
        blurb: "Widgets for the next issue",
        bidUsd: 12,
        clicks: 3,
      },
    ],
  });
  const emptyOpen = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [],
  });
  const closedOccupied = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [
      {
        rank: 1,
        id: "lst_won",
        sponsorUrl: "https://won.example/cover",
        blurb: "Frozen winner",
        bidUsd: 20,
        clicks: 1,
      },
    ],
  });

  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(hopAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(hopAt < rackAt);
  assert.ok(rackAt < claimAt);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(occupiedOpen, /href="#claim"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /href="#claim"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);

  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /href="#claim"/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);
});
