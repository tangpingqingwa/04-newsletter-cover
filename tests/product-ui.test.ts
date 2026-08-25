import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppDb, Listing } from "../src/db.js";
import { renderBoardHtml } from "../src/http/routes/board.js";
import { buildApp } from "../src/server.js";
import { FOLIO_CSS, OCCUPIED_CSS, spokenIssueDate } from "../src/views/skin.js";

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
  assert.doesNotMatch(body, /data-open-cover="true"/);
  assert.doesNotMatch(body, /data-claim-cover="true"/);
  assert.doesNotMatch(body, /data-sold-cover="true"/);
  assert.doesNotMatch(body, /This issue’s cover is sold/);
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
  assert.match(body, /class="empty-stand"/);
  assert.match(body, /data-read-stand="true"/);
  assert.match(body, /data-claim-after-stand="true"/);
  assert.match(body, /href="#claim"/);
  assert.match(body, /Claim this issue’s cover/);
  assert.match(body, /class="claim-note" data-empty-issue="true"/);
  assert.match(body, /data-cover-prize="true"/);
  assert.match(body, /no cover sold/i);
  assert.match(body, /No paid listings on this board/);
  assert.match(body, /This issue’s cover is still open/);
  assert.match(body, /data-fair-window="true"/);
  assert.match(body, /Live rank is rolling last 7 days from paid placement/);
  assert.match(body, /Not Monday 00:00 UTC/);
  assert.match(body, /data-empty-ear="true"/);
  assert.match(body, /Last 7 days · UTC/);
  assert.doesNotMatch(body.slice(body.indexOf("</style>")), /Weekly · UTC/);
  assert.doesNotMatch(body, /data-rolling-week=/);
  assert.doesNotMatch(body, /class="week-window"/);
  assert.match(body, /\$5 takes #1/);
  assert.match(body, /this issue’s cover/);
  assert.ok(body.indexOf('data-read-stand="true"') < body.indexOf('data-claim-after-stand="true"'));
  assert.ok(body.indexOf('data-claim-after-stand="true"') < body.indexOf('id="claim"'));
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
  assert.match(html.body, /data-closed-empty-issue="true"/);
  assert.doesNotMatch(html.body, /goes to whoever pays the most/);
  assert.doesNotMatch(html.body, /id="claim"/);
  assert.doesNotMatch(html.body, /Claim #1 for/);
  assert.doesNotMatch(html.body, /data-claim-cover="true"/);
  assert.doesNotMatch(html.body, /data-cover-prize="true"/);
  assert.doesNotMatch(html.body, /data-read-stand/);
  assert.doesNotMatch(html.body, /data-claim-after-stand/);
  assert.doesNotMatch(html.body, /data-sold-cover="true"/);
  assert.doesNotMatch(html.body, /class="empty-stand"/);
  assert.doesNotMatch(html.body, /data-rank="1"/);
  assert.doesNotMatch(html.body, /class="cover-line"/);
  assert.doesNotMatch(html.body, /data-sponsor-url=/);
});

test("paid listing is a cover pitch: blurb, sponsor hop, $bid, clicks", async (t) => {
  const app = await buildApp({ now: new Date("2026-08-06T12:00:00.000Z") });
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
  assert.match(html.body, /data-cover-prize-line="true"/);
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
  assert.match(html.body, /data-sold-cover="true"/);
  assert.match(html.body, /This issue’s cover is sold/);
  assert.match(html.body, /data-claim-cover="true"/);
  assert.match(html.body, /href="#claim"/);
  assert.match(html.body, /Claim the next cover/);
  assert.ok(html.body.indexOf('data-sold-cover="true"') < html.body.indexOf('data-claim-cover="true"'));
  assert.ok(html.body.indexOf('data-read-cover="true"') < html.body.indexOf('data-claim-cover="true"'));
  assert.doesNotMatch(html.body, /goes to whoever pays the most/);
  assert.doesNotMatch(html.body, /no cover sold/i);
  assert.doesNotMatch(html.body, /class="claim-note" data-empty-issue="true"/);
  assert.doesNotMatch(html.body, /data-cover-prize="true"/);
  assert.doesNotMatch(html.body, /\$5 takes #1/);
  assert.doesNotMatch(html.body, /data-read-stand/);
  assert.doesNotMatch(html.body, /data-claim-after-stand/);
  assert.doesNotMatch(html.body, /class="empty-stand"/);
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
  assert.match(html, /this issue’s cover/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, /class="claim-note" data-empty-issue="true"/);
  assert.match(html, /data-cover-prize="true"/);
  assert.match(html, /class="empty-stand"/);
  assert.match(html, /data-read-stand="true"/);
  assert.match(html, /data-claim-after-stand="true"/);
  assert.ok(html.indexOf('data-read-stand="true"') < html.indexOf('data-claim-after-stand="true"'));
  assert.ok(html.indexOf('data-claim-after-stand="true"') < html.indexOf('id="claim"'));
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
  assert.match(openEmpty, /data-cover-prize="true"/);
  assert.match(openEmpty, /class="empty-stand"/);
  assert.match(openEmpty, /data-read-stand="true"/);
  assert.match(openEmpty, /data-claim-after-stand="true"/);
  assert.match(openEmpty, /No cover sold/);
  assert.match(openEmpty, /No paid listings on this board/);
  assert.match(openEmpty, /This issue’s cover is still open/);
  assert.match(openEmpty, /\$5 takes #1/);
  assert.match(openEmpty, /this issue’s cover/);
  assert.match(openEmpty, /Claim #1 for/);
  assert.match(openEmpty, /class="outbid"/);
  assert.ok(openEmpty.indexOf('data-read-stand="true"') < openEmpty.indexOf('data-claim-after-stand="true"'));
  assert.ok(openEmpty.indexOf('data-claim-after-stand="true"') < claimAt);
  assert.doesNotMatch(openEmpty, /Already on this issue/);
  assert.doesNotMatch(openEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(openEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(openEmpty, /data-rank="1"/);

  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });
  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-empty-issue="true"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.match(closedEmpty, /This issue is frozen\. No cover sold/);
  assert.match(closedEmpty, /No paid listings on this board/);
  assert.match(closedEmpty, /This issue is closed/);
  assert.match(closedEmpty, /not the next issue/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.match(closedEmpty, /The open cover is on the stand/);
  assert.doesNotMatch(closedEmpty, /goes to whoever pays the most/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /class="outbid"/);
  assert.doesNotMatch(closedEmpty, /data-cover-prize="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-stand/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /class="empty-stand"/);
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
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.match(closedEmpty, /No paid listings on this board/);
  assert.doesNotMatch(closedEmpty, /goes to whoever pays the most/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /data-rank="1"/);

  assert.match(openEmpty, /The next issue’s cover goes to whoever pays the most/);
  assert.match(openEmpty, /Claim #1 for/);
  assert.match(openEmpty, /class="outbid"/);
  assert.match(openEmpty, /\$5 takes #1 — this issue’s cover/);
  assert.match(openEmpty, /data-read-stand="true"/);
  assert.match(openEmpty, /This issue’s cover is still open/);
  assert.doesNotMatch(openEmpty, /data-open-cover="true"/);
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
  assert.match(occupiedOpen, /data-sold-cover="true"/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.match(occupiedOpen, /Paying less than #1 still lists/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);

  const emptyClaim = emptyOpen.indexOf('id="claim"');
  assert.notEqual(emptyClaim, -1);
  assert.equal(emptyOpen.indexOf('class="cover-rack"'), -1);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /data-cover-prize="true"/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.ok(emptyOpen.indexOf('data-read-stand="true"') < emptyOpen.indexOf('data-claim-after-stand="true"'));
  assert.ok(emptyOpen.indexOf('data-claim-after-stand="true"') < emptyClaim);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);

  const closedHint = closedOccupied.indexOf("This issue is frozen");
  const closedCover = closedOccupied.indexOf('class="cover-line cover"');
  assert.notEqual(closedHint, -1);
  assert.notEqual(closedCover, -1);
  assert.ok(closedCover < closedHint);
  assert.match(closedOccupied, /class="cover-line cover"/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-stand/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-stand/);
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
  assert.ok(rackAt < hopAt);
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
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /href="#claim"/);

  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-stand/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /href="#claim"/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);
});

test("Cover · #1 is one prize line", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  assert.match(occupiedOpen, /data-cover-prize-line="true"/);
  assert.match(occupiedOpen, /class="rank" data-cover-prize-line="true">Cover · #1</);
  assert.equal((occupiedOpen.match(/data-cover-prize-line="true"/g) ?? []).length, 1);
  assert.match(occupiedOpen, /white-space: nowrap/);
  assert.match(occupiedOpen, /\.week-open-sold \.rank\[data-cover-prize-line\]/);
  assert.match(occupiedOpen, /grid-template-columns: max-content 1fr auto/);
  assert.match(occupiedOpen, /data-read-cover="true"/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /data-sold-cover="true"/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.ok(occupiedOpen.indexOf('data-sold-cover="true"') < occupiedOpen.indexOf('data-claim-cover="true"'));
  assert.ok(occupiedOpen.indexOf('data-read-cover="true"') < occupiedOpen.indexOf('data-claim-cover="true"'));
  assert.ok(occupiedOpen.indexOf('data-read-cover="true"') < occupiedOpen.indexOf('id="claim"'));
  assert.ok(occupiedOpen.indexOf('data-cover-prize-line="true"') < occupiedOpen.indexOf('id="claim"'));
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /#2/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.doesNotMatch(emptyOpen, /data-cover-prize-line="true"/);
  assert.doesNotMatch(emptyOpen, /Cover · #1/);

  assert.doesNotMatch(closedOccupied, /data-cover-prize-line="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-stand/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.doesNotMatch(closedEmpty, /data-cover-prize-line="true"/);
  assert.doesNotMatch(closedEmpty, /Cover · #1/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("empty open / names this issue’s cover as the $5 prize", () => {
  const emptyOpen = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [],
  });
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  assert.match(emptyOpen, /class="claim-note" data-empty-issue="true" data-cover-prize="true"/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /No cover sold/);
  assert.match(emptyOpen, /No paid listings on this board/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /class="outbid"/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-cover-prize-line="true"/);
  assert.doesNotMatch(emptyOpen, /subscriber/i);
  assert.doesNotMatch(emptyOpen, /article list/i);

  assert.match(occupiedOpen, /data-read-cover="true"/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /data-sold-cover="true"/);
  assert.match(occupiedOpen, /data-cover-prize-line="true"/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /\$5 takes #1 — this issue’s cover/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.doesNotMatch(closedEmpty, /data-cover-prize="true"/);
  assert.doesNotMatch(closedEmpty, /\$5 takes #1/);
  assert.doesNotMatch(closedEmpty, /data-read-stand/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /class="empty-stand"/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("empty open / lets a first-time reader hit the stand before Claim #1", () => {
  const emptyOpen = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [],
  });
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const standAt = emptyOpen.indexOf('data-read-stand="true"');
  const hopAt = emptyOpen.indexOf('data-claim-after-stand="true"');
  const claimAt = emptyOpen.indexOf('id="claim"');
  assert.notEqual(standAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(standAt < hopAt);
  assert.ok(hopAt < claimAt);
  assert.equal((emptyOpen.match(/data-read-stand="true"/g) ?? []).length, 1);
  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /class="empty-kicker">This issue’s cover</);
  assert.match(emptyOpen, /class="hed">No cover sold</);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /No cover sold/);
  assert.match(emptyOpen, /No paid listings on this board/);
  assert.match(emptyOpen, /class="claim-note" data-empty-issue="true" data-cover-prize="true">No cover sold. No paid listings on this board. \$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /class="outbid"/);
  assert.match(emptyOpen, /text-decoration: underline dashed/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);
  assert.doesNotMatch(emptyOpen, /Nobody bought the cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-cover-prize-line="true"/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /subscriber/i);
  assert.doesNotMatch(emptyOpen, /article list/i);

  assert.match(occupiedOpen, /data-read-cover="true"/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /data-sold-cover="true"/);
  assert.match(occupiedOpen, /data-cover-prize-line="true"/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /class="empty-stand"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.match(closedEmpty, /Nobody bought the cover/);
  assert.doesNotMatch(closedEmpty, /data-read-stand/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /class="empty-stand"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is still open/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("empty open / names one hop to claim after the stand", () => {
  const emptyOpen = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [],
  });
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const standAt = emptyOpen.indexOf('data-read-stand="true"');
  const hopAt = emptyOpen.indexOf('data-claim-after-stand="true"');
  const claimAt = emptyOpen.indexOf('id="claim"');
  assert.notEqual(standAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(standAt < hopAt);
  assert.ok(hopAt < claimAt);
  assert.equal((emptyOpen.match(/data-claim-after-stand="true"/g) ?? []).length, 1);
  assert.equal((emptyOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(emptyOpen, /class="claim-after-stand"/);
  assert.match(emptyOpen, /href="#claim"/);
  assert.match(emptyOpen, /Claim this issue’s cover/);
  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /class="outbid"/);
  assert.match(emptyOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);
  assert.doesNotMatch(emptyOpen, /data-cover-prize-line="true"/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /subscriber/i);
  assert.doesNotMatch(emptyOpen, /article list/i);

  assert.match(occupiedOpen, /data-read-cover="true"/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /data-sold-cover="true"/);
  assert.match(occupiedOpen, /data-cover-prize-line="true"/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /Claim this issue’s cover/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /href="#claim"/);
  assert.doesNotMatch(closedEmpty, /Claim this issue’s cover/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / names the sold cover before Claim the next cover", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(occupiedOpen, /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / concentrates Claim the next cover after the sold cover", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const afterSoldAt = occupiedOpen.indexOf('data-claim-after-sold="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(afterSoldAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(soldAt < afterSoldAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < afterSoldAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover\.</,
  );
  assert.match(occupiedOpen, /a\[data-claim-after-sold\]/);
  assert.match(occupiedOpen, /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / concentrates the sold-cover read after Claim the next cover", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const readAfterAt = occupiedOpen.indexOf('data-read-after-claim-sold="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const afterSoldAt = occupiedOpen.indexOf('data-claim-after-sold="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(readAfterAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(afterSoldAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(readAfterAt < hopAt);
  assert.ok(soldAt < afterSoldAt);
  assert.ok(readAfterAt < afterSoldAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < afterSoldAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</,
  );
  assert.match(
    occupiedOpen,
    /data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover\.</,
  );
  assert.match(occupiedOpen, /\[data-read-after-claim-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-sold\]/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / concentrates Claim the next cover after the sold-cover read", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const readAfterAt = occupiedOpen.indexOf('data-read-after-claim-sold="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const afterSoldAt = occupiedOpen.indexOf('data-claim-after-sold="true"');
  const afterReadAt = occupiedOpen.indexOf('data-claim-after-read-sold="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(readAfterAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(afterSoldAt, -1);
  assert.notEqual(afterReadAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(readAfterAt < hopAt);
  assert.ok(soldAt < afterSoldAt);
  assert.ok(readAfterAt < afterSoldAt);
  assert.ok(soldAt < afterReadAt);
  assert.ok(readAfterAt < afterReadAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < afterSoldAt);
  assert.ok(rackAt < afterReadAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</,
  );
  assert.match(
    occupiedOpen,
    /data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover\.</,
  );
  assert.match(occupiedOpen, /\[data-read-after-claim-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-sold\]/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / concentrates the sold-cover read after Claim is re-concentrated", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const readAfterAt = occupiedOpen.indexOf('data-read-after-claim-sold="true"');
  const readTwoAt = occupiedOpen.indexOf('data-read-after-claim-two="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const afterSoldAt = occupiedOpen.indexOf('data-claim-after-sold="true"');
  const afterReadAt = occupiedOpen.indexOf('data-claim-after-read-sold="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(readAfterAt, -1);
  assert.notEqual(readTwoAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(afterSoldAt, -1);
  assert.notEqual(afterReadAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(readAfterAt < hopAt);
  assert.ok(readTwoAt < hopAt);
  assert.ok(soldAt < afterSoldAt);
  assert.ok(readAfterAt < afterSoldAt);
  assert.ok(readTwoAt < afterSoldAt);
  assert.ok(soldAt < afterReadAt);
  assert.ok(readAfterAt < afterReadAt);
  assert.ok(readTwoAt < afterReadAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < afterSoldAt);
  assert.ok(rackAt < afterReadAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</,
  );
  assert.match(
    occupiedOpen,
    /data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover\.</,
  );
  assert.match(occupiedOpen, /\[data-read-after-claim-sold\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-two\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-sold\]/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / concentrates Claim the next cover after the sold-cover read is re-concentrated", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const readAfterAt = occupiedOpen.indexOf('data-read-after-claim-sold="true"');
  const readTwoAt = occupiedOpen.indexOf('data-read-after-claim-two="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const afterSoldAt = occupiedOpen.indexOf('data-claim-after-sold="true"');
  const afterReadAt = occupiedOpen.indexOf('data-claim-after-read-sold="true"');
  const afterReadTwoAt = occupiedOpen.indexOf('data-claim-after-read-two="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(readAfterAt, -1);
  assert.notEqual(readTwoAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(afterSoldAt, -1);
  assert.notEqual(afterReadAt, -1);
  assert.notEqual(afterReadTwoAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(readAfterAt < hopAt);
  assert.ok(readTwoAt < hopAt);
  assert.ok(soldAt < afterSoldAt);
  assert.ok(readAfterAt < afterSoldAt);
  assert.ok(readTwoAt < afterSoldAt);
  assert.ok(soldAt < afterReadAt);
  assert.ok(readAfterAt < afterReadAt);
  assert.ok(readTwoAt < afterReadAt);
  assert.ok(soldAt < afterReadTwoAt);
  assert.ok(readAfterAt < afterReadTwoAt);
  assert.ok(readTwoAt < afterReadTwoAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < afterSoldAt);
  assert.ok(rackAt < afterReadAt);
  assert.ok(rackAt < afterReadTwoAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</,
  );
  assert.match(
    occupiedOpen,
    /data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover\.</,
  );
  assert.match(occupiedOpen, /\[data-read-after-claim-sold\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-two\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-two\]/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / concentrates the sold-cover read after Claim is re-concentrated again", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const readAfterAt = occupiedOpen.indexOf('data-read-after-claim-sold="true"');
  const readTwoAt = occupiedOpen.indexOf('data-read-after-claim-two="true"');
  const readThreeAt = occupiedOpen.indexOf('data-read-after-claim-three="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const afterSoldAt = occupiedOpen.indexOf('data-claim-after-sold="true"');
  const afterReadAt = occupiedOpen.indexOf('data-claim-after-read-sold="true"');
  const afterReadTwoAt = occupiedOpen.indexOf('data-claim-after-read-two="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(readAfterAt, -1);
  assert.notEqual(readTwoAt, -1);
  assert.notEqual(readThreeAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(afterSoldAt, -1);
  assert.notEqual(afterReadAt, -1);
  assert.notEqual(afterReadTwoAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(readAfterAt < hopAt);
  assert.ok(readTwoAt < hopAt);
  assert.ok(readThreeAt < hopAt);
  assert.ok(soldAt < afterSoldAt);
  assert.ok(readAfterAt < afterSoldAt);
  assert.ok(readTwoAt < afterSoldAt);
  assert.ok(readThreeAt < afterSoldAt);
  assert.ok(soldAt < afterReadAt);
  assert.ok(readAfterAt < afterReadAt);
  assert.ok(readTwoAt < afterReadAt);
  assert.ok(readThreeAt < afterReadAt);
  assert.ok(soldAt < afterReadTwoAt);
  assert.ok(readAfterAt < afterReadTwoAt);
  assert.ok(readTwoAt < afterReadTwoAt);
  assert.ok(readThreeAt < afterReadTwoAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < afterSoldAt);
  assert.ok(rackAt < afterReadAt);
  assert.ok(rackAt < afterReadTwoAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</,
  );
  assert.match(
    occupiedOpen,
    /data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover\.</,
  );
  assert.match(occupiedOpen, /\[data-read-after-claim-sold\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-two\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-three\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-two\]/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / concentrates Claim the next cover after the sold-cover read is re-concentrated again", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const readAfterAt = occupiedOpen.indexOf('data-read-after-claim-sold="true"');
  const readTwoAt = occupiedOpen.indexOf('data-read-after-claim-two="true"');
  const readThreeAt = occupiedOpen.indexOf('data-read-after-claim-three="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const afterSoldAt = occupiedOpen.indexOf('data-claim-after-sold="true"');
  const afterReadAt = occupiedOpen.indexOf('data-claim-after-read-sold="true"');
  const afterReadTwoAt = occupiedOpen.indexOf('data-claim-after-read-two="true"');
  const afterReadThreeAt = occupiedOpen.indexOf('data-claim-after-read-three="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(readAfterAt, -1);
  assert.notEqual(readTwoAt, -1);
  assert.notEqual(readThreeAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(afterSoldAt, -1);
  assert.notEqual(afterReadAt, -1);
  assert.notEqual(afterReadTwoAt, -1);
  assert.notEqual(afterReadThreeAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(readAfterAt < hopAt);
  assert.ok(readTwoAt < hopAt);
  assert.ok(readThreeAt < hopAt);
  assert.ok(soldAt < afterSoldAt);
  assert.ok(readAfterAt < afterSoldAt);
  assert.ok(readTwoAt < afterSoldAt);
  assert.ok(readThreeAt < afterSoldAt);
  assert.ok(soldAt < afterReadAt);
  assert.ok(readAfterAt < afterReadAt);
  assert.ok(readTwoAt < afterReadAt);
  assert.ok(readThreeAt < afterReadAt);
  assert.ok(soldAt < afterReadTwoAt);
  assert.ok(readAfterAt < afterReadTwoAt);
  assert.ok(readTwoAt < afterReadTwoAt);
  assert.ok(readThreeAt < afterReadTwoAt);
  assert.ok(soldAt < afterReadThreeAt);
  assert.ok(readAfterAt < afterReadThreeAt);
  assert.ok(readTwoAt < afterReadThreeAt);
  assert.ok(readThreeAt < afterReadThreeAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < afterSoldAt);
  assert.ok(rackAt < afterReadAt);
  assert.ok(rackAt < afterReadTwoAt);
  assert.ok(rackAt < afterReadThreeAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</,
  );
  assert.match(
    occupiedOpen,
    /data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover\.</,
  );
  assert.match(occupiedOpen, /\[data-read-after-claim-sold\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-two\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-three\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-two\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-three\]/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / concentrates the sold-cover read after Claim is re-concentrated a fourth time", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const readAfterAt = occupiedOpen.indexOf('data-read-after-claim-sold="true"');
  const readTwoAt = occupiedOpen.indexOf('data-read-after-claim-two="true"');
  const readThreeAt = occupiedOpen.indexOf('data-read-after-claim-three="true"');
  const readFourAt = occupiedOpen.indexOf('data-read-after-claim-four="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const afterSoldAt = occupiedOpen.indexOf('data-claim-after-sold="true"');
  const afterReadAt = occupiedOpen.indexOf('data-claim-after-read-sold="true"');
  const afterReadTwoAt = occupiedOpen.indexOf('data-claim-after-read-two="true"');
  const afterReadThreeAt = occupiedOpen.indexOf('data-claim-after-read-three="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(readAfterAt, -1);
  assert.notEqual(readTwoAt, -1);
  assert.notEqual(readThreeAt, -1);
  assert.notEqual(readFourAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(afterSoldAt, -1);
  assert.notEqual(afterReadAt, -1);
  assert.notEqual(afterReadTwoAt, -1);
  assert.notEqual(afterReadThreeAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(readAfterAt < hopAt);
  assert.ok(readTwoAt < hopAt);
  assert.ok(readThreeAt < hopAt);
  assert.ok(readFourAt < hopAt);
  assert.ok(soldAt < afterSoldAt);
  assert.ok(readAfterAt < afterSoldAt);
  assert.ok(readTwoAt < afterSoldAt);
  assert.ok(readThreeAt < afterSoldAt);
  assert.ok(readFourAt < afterSoldAt);
  assert.ok(soldAt < afterReadAt);
  assert.ok(readAfterAt < afterReadAt);
  assert.ok(readTwoAt < afterReadAt);
  assert.ok(readThreeAt < afterReadAt);
  assert.ok(readFourAt < afterReadAt);
  assert.ok(soldAt < afterReadTwoAt);
  assert.ok(readAfterAt < afterReadTwoAt);
  assert.ok(readTwoAt < afterReadTwoAt);
  assert.ok(readThreeAt < afterReadTwoAt);
  assert.ok(readFourAt < afterReadTwoAt);
  assert.ok(soldAt < afterReadThreeAt);
  assert.ok(readAfterAt < afterReadThreeAt);
  assert.ok(readTwoAt < afterReadThreeAt);
  assert.ok(readThreeAt < afterReadThreeAt);
  assert.ok(readFourAt < afterReadThreeAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < afterSoldAt);
  assert.ok(rackAt < afterReadAt);
  assert.ok(rackAt < afterReadTwoAt);
  assert.ok(rackAt < afterReadThreeAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-four="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</,
  );
  assert.match(
    occupiedOpen,
    /data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover\.</,
  );
  assert.match(occupiedOpen, /\[data-read-after-claim-sold\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-two\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-three\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-four\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-two\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-three\]/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / concentrates Claim the next cover after the sold-cover read is re-concentrated a fourth time", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const readAfterAt = occupiedOpen.indexOf('data-read-after-claim-sold="true"');
  const readTwoAt = occupiedOpen.indexOf('data-read-after-claim-two="true"');
  const readThreeAt = occupiedOpen.indexOf('data-read-after-claim-three="true"');
  const readFourAt = occupiedOpen.indexOf('data-read-after-claim-four="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const afterSoldAt = occupiedOpen.indexOf('data-claim-after-sold="true"');
  const afterReadAt = occupiedOpen.indexOf('data-claim-after-read-sold="true"');
  const afterReadTwoAt = occupiedOpen.indexOf('data-claim-after-read-two="true"');
  const afterReadThreeAt = occupiedOpen.indexOf('data-claim-after-read-three="true"');
  const afterReadFourAt = occupiedOpen.indexOf('data-claim-after-read-four="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(readAfterAt, -1);
  assert.notEqual(readTwoAt, -1);
  assert.notEqual(readThreeAt, -1);
  assert.notEqual(readFourAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(afterSoldAt, -1);
  assert.notEqual(afterReadAt, -1);
  assert.notEqual(afterReadTwoAt, -1);
  assert.notEqual(afterReadThreeAt, -1);
  assert.notEqual(afterReadFourAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(readAfterAt < hopAt);
  assert.ok(readTwoAt < hopAt);
  assert.ok(readThreeAt < hopAt);
  assert.ok(readFourAt < hopAt);
  assert.ok(soldAt < afterSoldAt);
  assert.ok(readAfterAt < afterSoldAt);
  assert.ok(readTwoAt < afterSoldAt);
  assert.ok(readThreeAt < afterSoldAt);
  assert.ok(readFourAt < afterSoldAt);
  assert.ok(soldAt < afterReadAt);
  assert.ok(readAfterAt < afterReadAt);
  assert.ok(readTwoAt < afterReadAt);
  assert.ok(readThreeAt < afterReadAt);
  assert.ok(readFourAt < afterReadAt);
  assert.ok(soldAt < afterReadTwoAt);
  assert.ok(readAfterAt < afterReadTwoAt);
  assert.ok(readTwoAt < afterReadTwoAt);
  assert.ok(readThreeAt < afterReadTwoAt);
  assert.ok(readFourAt < afterReadTwoAt);
  assert.ok(soldAt < afterReadThreeAt);
  assert.ok(readAfterAt < afterReadThreeAt);
  assert.ok(readTwoAt < afterReadThreeAt);
  assert.ok(readThreeAt < afterReadThreeAt);
  assert.ok(readFourAt < afterReadThreeAt);
  assert.ok(soldAt < afterReadFourAt);
  assert.ok(readAfterAt < afterReadFourAt);
  assert.ok(readTwoAt < afterReadFourAt);
  assert.ok(readThreeAt < afterReadFourAt);
  assert.ok(readFourAt < afterReadFourAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < afterSoldAt);
  assert.ok(rackAt < afterReadAt);
  assert.ok(rackAt < afterReadTwoAt);
  assert.ok(rackAt < afterReadThreeAt);
  assert.ok(rackAt < afterReadFourAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-four="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-four="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</,
  );
  assert.match(
    occupiedOpen,
    /data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover\.</,
  );
  assert.match(occupiedOpen, /\[data-read-after-claim-sold\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-two\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-three\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-four\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-two\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-three\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-four\]/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / concentrates the sold-cover read after Claim is re-concentrated a fifth time", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const readAfterAt = occupiedOpen.indexOf('data-read-after-claim-sold="true"');
  const readTwoAt = occupiedOpen.indexOf('data-read-after-claim-two="true"');
  const readThreeAt = occupiedOpen.indexOf('data-read-after-claim-three="true"');
  const readFourAt = occupiedOpen.indexOf('data-read-after-claim-four="true"');
  const readFiveAt = occupiedOpen.indexOf('data-read-after-claim-five="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const afterSoldAt = occupiedOpen.indexOf('data-claim-after-sold="true"');
  const afterReadAt = occupiedOpen.indexOf('data-claim-after-read-sold="true"');
  const afterReadTwoAt = occupiedOpen.indexOf('data-claim-after-read-two="true"');
  const afterReadThreeAt = occupiedOpen.indexOf('data-claim-after-read-three="true"');
  const afterReadFourAt = occupiedOpen.indexOf('data-claim-after-read-four="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(readAfterAt, -1);
  assert.notEqual(readTwoAt, -1);
  assert.notEqual(readThreeAt, -1);
  assert.notEqual(readFourAt, -1);
  assert.notEqual(readFiveAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(afterSoldAt, -1);
  assert.notEqual(afterReadAt, -1);
  assert.notEqual(afterReadTwoAt, -1);
  assert.notEqual(afterReadThreeAt, -1);
  assert.notEqual(afterReadFourAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(readAfterAt < hopAt);
  assert.ok(readTwoAt < hopAt);
  assert.ok(readThreeAt < hopAt);
  assert.ok(readFourAt < hopAt);
  assert.ok(readFiveAt < hopAt);
  assert.ok(soldAt < afterSoldAt);
  assert.ok(readAfterAt < afterSoldAt);
  assert.ok(readTwoAt < afterSoldAt);
  assert.ok(readThreeAt < afterSoldAt);
  assert.ok(readFourAt < afterSoldAt);
  assert.ok(readFiveAt < afterSoldAt);
  assert.ok(soldAt < afterReadAt);
  assert.ok(readAfterAt < afterReadAt);
  assert.ok(readTwoAt < afterReadAt);
  assert.ok(readThreeAt < afterReadAt);
  assert.ok(readFourAt < afterReadAt);
  assert.ok(readFiveAt < afterReadAt);
  assert.ok(soldAt < afterReadTwoAt);
  assert.ok(readAfterAt < afterReadTwoAt);
  assert.ok(readTwoAt < afterReadTwoAt);
  assert.ok(readThreeAt < afterReadTwoAt);
  assert.ok(readFourAt < afterReadTwoAt);
  assert.ok(readFiveAt < afterReadTwoAt);
  assert.ok(soldAt < afterReadThreeAt);
  assert.ok(readAfterAt < afterReadThreeAt);
  assert.ok(readTwoAt < afterReadThreeAt);
  assert.ok(readThreeAt < afterReadThreeAt);
  assert.ok(readFourAt < afterReadThreeAt);
  assert.ok(readFiveAt < afterReadThreeAt);
  assert.ok(soldAt < afterReadFourAt);
  assert.ok(readAfterAt < afterReadFourAt);
  assert.ok(readTwoAt < afterReadFourAt);
  assert.ok(readThreeAt < afterReadFourAt);
  assert.ok(readFourAt < afterReadFourAt);
  assert.ok(readFiveAt < afterReadFourAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < afterSoldAt);
  assert.ok(rackAt < afterReadAt);
  assert.ok(rackAt < afterReadTwoAt);
  assert.ok(rackAt < afterReadThreeAt);
  assert.ok(rackAt < afterReadFourAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-four="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-five="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-four="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</,
  );
  assert.match(
    occupiedOpen,
    /data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover\.</,
  );
  assert.match(occupiedOpen, /\[data-read-after-claim-sold\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-two\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-three\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-four\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-five\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-two\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-three\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-four\]/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / concentrates Claim the next cover after the sold-cover read is re-concentrated a fifth time", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const readAfterAt = occupiedOpen.indexOf('data-read-after-claim-sold="true"');
  const readTwoAt = occupiedOpen.indexOf('data-read-after-claim-two="true"');
  const readThreeAt = occupiedOpen.indexOf('data-read-after-claim-three="true"');
  const readFourAt = occupiedOpen.indexOf('data-read-after-claim-four="true"');
  const readFiveAt = occupiedOpen.indexOf('data-read-after-claim-five="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const afterSoldAt = occupiedOpen.indexOf('data-claim-after-sold="true"');
  const afterReadAt = occupiedOpen.indexOf('data-claim-after-read-sold="true"');
  const afterReadTwoAt = occupiedOpen.indexOf('data-claim-after-read-two="true"');
  const afterReadThreeAt = occupiedOpen.indexOf('data-claim-after-read-three="true"');
  const afterReadFourAt = occupiedOpen.indexOf('data-claim-after-read-four="true"');
  const afterReadFiveAt = occupiedOpen.indexOf('data-claim-after-read-five="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(readAfterAt, -1);
  assert.notEqual(readTwoAt, -1);
  assert.notEqual(readThreeAt, -1);
  assert.notEqual(readFourAt, -1);
  assert.notEqual(readFiveAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(afterSoldAt, -1);
  assert.notEqual(afterReadAt, -1);
  assert.notEqual(afterReadTwoAt, -1);
  assert.notEqual(afterReadThreeAt, -1);
  assert.notEqual(afterReadFourAt, -1);
  assert.notEqual(afterReadFiveAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(readAfterAt < hopAt);
  assert.ok(readTwoAt < hopAt);
  assert.ok(readThreeAt < hopAt);
  assert.ok(readFourAt < hopAt);
  assert.ok(readFiveAt < hopAt);
  assert.ok(soldAt < afterSoldAt);
  assert.ok(readAfterAt < afterSoldAt);
  assert.ok(readTwoAt < afterSoldAt);
  assert.ok(readThreeAt < afterSoldAt);
  assert.ok(readFourAt < afterSoldAt);
  assert.ok(readFiveAt < afterSoldAt);
  assert.ok(soldAt < afterReadAt);
  assert.ok(readAfterAt < afterReadAt);
  assert.ok(readTwoAt < afterReadAt);
  assert.ok(readThreeAt < afterReadAt);
  assert.ok(readFourAt < afterReadAt);
  assert.ok(readFiveAt < afterReadAt);
  assert.ok(soldAt < afterReadTwoAt);
  assert.ok(readAfterAt < afterReadTwoAt);
  assert.ok(readTwoAt < afterReadTwoAt);
  assert.ok(readThreeAt < afterReadTwoAt);
  assert.ok(readFourAt < afterReadTwoAt);
  assert.ok(readFiveAt < afterReadTwoAt);
  assert.ok(soldAt < afterReadThreeAt);
  assert.ok(readAfterAt < afterReadThreeAt);
  assert.ok(readTwoAt < afterReadThreeAt);
  assert.ok(readThreeAt < afterReadThreeAt);
  assert.ok(readFourAt < afterReadThreeAt);
  assert.ok(readFiveAt < afterReadThreeAt);
  assert.ok(soldAt < afterReadFourAt);
  assert.ok(readAfterAt < afterReadFourAt);
  assert.ok(readTwoAt < afterReadFourAt);
  assert.ok(readThreeAt < afterReadFourAt);
  assert.ok(readFourAt < afterReadFourAt);
  assert.ok(readFiveAt < afterReadFourAt);
  assert.ok(soldAt < afterReadFiveAt);
  assert.ok(readAfterAt < afterReadFiveAt);
  assert.ok(readTwoAt < afterReadFiveAt);
  assert.ok(readThreeAt < afterReadFiveAt);
  assert.ok(readFourAt < afterReadFiveAt);
  assert.ok(readFiveAt < afterReadFiveAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < afterSoldAt);
  assert.ok(rackAt < afterReadAt);
  assert.ok(rackAt < afterReadTwoAt);
  assert.ok(rackAt < afterReadThreeAt);
  assert.ok(rackAt < afterReadFourAt);
  assert.ok(rackAt < afterReadFiveAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-four="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-five="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-four="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-five="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</,
  );
  assert.match(
    occupiedOpen,
    /data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover\.</,
  );
  assert.match(occupiedOpen, /\[data-read-after-claim-sold\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-two\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-three\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-four\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-five\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-two\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-three\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-four\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-five\]/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-five="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-five="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-five="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / concentrates the sold-cover read after Claim is re-concentrated a sixth time", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const readAfterAt = occupiedOpen.indexOf('data-read-after-claim-sold="true"');
  const readTwoAt = occupiedOpen.indexOf('data-read-after-claim-two="true"');
  const readThreeAt = occupiedOpen.indexOf('data-read-after-claim-three="true"');
  const readFourAt = occupiedOpen.indexOf('data-read-after-claim-four="true"');
  const readFiveAt = occupiedOpen.indexOf('data-read-after-claim-five="true"');
  const readSixAt = occupiedOpen.indexOf('data-read-after-claim-six="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const afterSoldAt = occupiedOpen.indexOf('data-claim-after-sold="true"');
  const afterReadAt = occupiedOpen.indexOf('data-claim-after-read-sold="true"');
  const afterReadTwoAt = occupiedOpen.indexOf('data-claim-after-read-two="true"');
  const afterReadThreeAt = occupiedOpen.indexOf('data-claim-after-read-three="true"');
  const afterReadFourAt = occupiedOpen.indexOf('data-claim-after-read-four="true"');
  const afterReadFiveAt = occupiedOpen.indexOf('data-claim-after-read-five="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(readAfterAt, -1);
  assert.notEqual(readTwoAt, -1);
  assert.notEqual(readThreeAt, -1);
  assert.notEqual(readFourAt, -1);
  assert.notEqual(readFiveAt, -1);
  assert.notEqual(readSixAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(afterSoldAt, -1);
  assert.notEqual(afterReadAt, -1);
  assert.notEqual(afterReadTwoAt, -1);
  assert.notEqual(afterReadThreeAt, -1);
  assert.notEqual(afterReadFourAt, -1);
  assert.notEqual(afterReadFiveAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(readAfterAt < hopAt);
  assert.ok(readTwoAt < hopAt);
  assert.ok(readThreeAt < hopAt);
  assert.ok(readFourAt < hopAt);
  assert.ok(readFiveAt < hopAt);
  assert.ok(readSixAt < hopAt);
  assert.ok(soldAt < afterSoldAt);
  assert.ok(readAfterAt < afterSoldAt);
  assert.ok(readTwoAt < afterSoldAt);
  assert.ok(readThreeAt < afterSoldAt);
  assert.ok(readFourAt < afterSoldAt);
  assert.ok(readFiveAt < afterSoldAt);
  assert.ok(readSixAt < afterSoldAt);
  assert.ok(soldAt < afterReadAt);
  assert.ok(readAfterAt < afterReadAt);
  assert.ok(readTwoAt < afterReadAt);
  assert.ok(readThreeAt < afterReadAt);
  assert.ok(readFourAt < afterReadAt);
  assert.ok(readFiveAt < afterReadAt);
  assert.ok(readSixAt < afterReadAt);
  assert.ok(soldAt < afterReadTwoAt);
  assert.ok(readAfterAt < afterReadTwoAt);
  assert.ok(readTwoAt < afterReadTwoAt);
  assert.ok(readThreeAt < afterReadTwoAt);
  assert.ok(readFourAt < afterReadTwoAt);
  assert.ok(readFiveAt < afterReadTwoAt);
  assert.ok(readSixAt < afterReadTwoAt);
  assert.ok(soldAt < afterReadThreeAt);
  assert.ok(readAfterAt < afterReadThreeAt);
  assert.ok(readTwoAt < afterReadThreeAt);
  assert.ok(readThreeAt < afterReadThreeAt);
  assert.ok(readFourAt < afterReadThreeAt);
  assert.ok(readFiveAt < afterReadThreeAt);
  assert.ok(readSixAt < afterReadThreeAt);
  assert.ok(soldAt < afterReadFourAt);
  assert.ok(readAfterAt < afterReadFourAt);
  assert.ok(readTwoAt < afterReadFourAt);
  assert.ok(readThreeAt < afterReadFourAt);
  assert.ok(readFourAt < afterReadFourAt);
  assert.ok(readFiveAt < afterReadFourAt);
  assert.ok(readSixAt < afterReadFourAt);
  assert.ok(soldAt < afterReadFiveAt);
  assert.ok(readAfterAt < afterReadFiveAt);
  assert.ok(readTwoAt < afterReadFiveAt);
  assert.ok(readThreeAt < afterReadFiveAt);
  assert.ok(readFourAt < afterReadFiveAt);
  assert.ok(readFiveAt < afterReadFiveAt);
  assert.ok(readSixAt < afterReadFiveAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < afterSoldAt);
  assert.ok(rackAt < afterReadAt);
  assert.ok(rackAt < afterReadTwoAt);
  assert.ok(rackAt < afterReadThreeAt);
  assert.ok(rackAt < afterReadFourAt);
  assert.ok(rackAt < afterReadFiveAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-four="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-five="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-six="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-four="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-five="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</,
  );
  assert.match(
    occupiedOpen,
    /data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover\.</,
  );
  assert.match(occupiedOpen, /\[data-read-after-claim-sold\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-two\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-three\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-four\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-five\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-six\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-two\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-three\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-four\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-five\]/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-six="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-five="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-six="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-five="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-six="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-five="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / concentrates Claim the next cover after the sold-cover read is re-concentrated a sixth time", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const soldAt = occupiedOpen.indexOf('data-sold-cover="true"');
  const readAfterAt = occupiedOpen.indexOf('data-read-after-claim-sold="true"');
  const readTwoAt = occupiedOpen.indexOf('data-read-after-claim-two="true"');
  const readThreeAt = occupiedOpen.indexOf('data-read-after-claim-three="true"');
  const readFourAt = occupiedOpen.indexOf('data-read-after-claim-four="true"');
  const readFiveAt = occupiedOpen.indexOf('data-read-after-claim-five="true"');
  const readSixAt = occupiedOpen.indexOf('data-read-after-claim-six="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const afterSoldAt = occupiedOpen.indexOf('data-claim-after-sold="true"');
  const afterReadAt = occupiedOpen.indexOf('data-claim-after-read-sold="true"');
  const afterReadTwoAt = occupiedOpen.indexOf('data-claim-after-read-two="true"');
  const afterReadThreeAt = occupiedOpen.indexOf('data-claim-after-read-three="true"');
  const afterReadFourAt = occupiedOpen.indexOf('data-claim-after-read-four="true"');
  const afterReadFiveAt = occupiedOpen.indexOf('data-claim-after-read-five="true"');
  const afterReadSixAt = occupiedOpen.indexOf('data-claim-after-read-six="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const prizeAt = occupiedOpen.indexOf('data-cover-prize-line="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(soldAt, -1);
  assert.notEqual(readAfterAt, -1);
  assert.notEqual(readTwoAt, -1);
  assert.notEqual(readThreeAt, -1);
  assert.notEqual(readFourAt, -1);
  assert.notEqual(readFiveAt, -1);
  assert.notEqual(readSixAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(afterSoldAt, -1);
  assert.notEqual(afterReadAt, -1);
  assert.notEqual(afterReadTwoAt, -1);
  assert.notEqual(afterReadThreeAt, -1);
  assert.notEqual(afterReadFourAt, -1);
  assert.notEqual(afterReadFiveAt, -1);
  assert.notEqual(afterReadSixAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(soldAt < hopAt);
  assert.ok(readAfterAt < hopAt);
  assert.ok(readTwoAt < hopAt);
  assert.ok(readThreeAt < hopAt);
  assert.ok(readFourAt < hopAt);
  assert.ok(readFiveAt < hopAt);
  assert.ok(readSixAt < hopAt);
  assert.ok(soldAt < afterSoldAt);
  assert.ok(readAfterAt < afterSoldAt);
  assert.ok(readTwoAt < afterSoldAt);
  assert.ok(readThreeAt < afterSoldAt);
  assert.ok(readFourAt < afterSoldAt);
  assert.ok(readFiveAt < afterSoldAt);
  assert.ok(readSixAt < afterSoldAt);
  assert.ok(soldAt < afterReadAt);
  assert.ok(readAfterAt < afterReadAt);
  assert.ok(readTwoAt < afterReadAt);
  assert.ok(readThreeAt < afterReadAt);
  assert.ok(readFourAt < afterReadAt);
  assert.ok(readFiveAt < afterReadAt);
  assert.ok(readSixAt < afterReadAt);
  assert.ok(soldAt < afterReadTwoAt);
  assert.ok(readAfterAt < afterReadTwoAt);
  assert.ok(readTwoAt < afterReadTwoAt);
  assert.ok(readThreeAt < afterReadTwoAt);
  assert.ok(readFourAt < afterReadTwoAt);
  assert.ok(readFiveAt < afterReadTwoAt);
  assert.ok(readSixAt < afterReadTwoAt);
  assert.ok(soldAt < afterReadThreeAt);
  assert.ok(readAfterAt < afterReadThreeAt);
  assert.ok(readTwoAt < afterReadThreeAt);
  assert.ok(readThreeAt < afterReadThreeAt);
  assert.ok(readFourAt < afterReadThreeAt);
  assert.ok(readFiveAt < afterReadThreeAt);
  assert.ok(readSixAt < afterReadThreeAt);
  assert.ok(soldAt < afterReadFourAt);
  assert.ok(readAfterAt < afterReadFourAt);
  assert.ok(readTwoAt < afterReadFourAt);
  assert.ok(readThreeAt < afterReadFourAt);
  assert.ok(readFourAt < afterReadFourAt);
  assert.ok(readFiveAt < afterReadFourAt);
  assert.ok(readSixAt < afterReadFourAt);
  assert.ok(soldAt < afterReadFiveAt);
  assert.ok(readAfterAt < afterReadFiveAt);
  assert.ok(readTwoAt < afterReadFiveAt);
  assert.ok(readThreeAt < afterReadFiveAt);
  assert.ok(readFourAt < afterReadFiveAt);
  assert.ok(readFiveAt < afterReadFiveAt);
  assert.ok(readSixAt < afterReadFiveAt);
  assert.ok(soldAt < afterReadSixAt);
  assert.ok(readAfterAt < afterReadSixAt);
  assert.ok(readTwoAt < afterReadSixAt);
  assert.ok(readThreeAt < afterReadSixAt);
  assert.ok(readFourAt < afterReadSixAt);
  assert.ok(readFiveAt < afterReadSixAt);
  assert.ok(readSixAt < afterReadSixAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < afterSoldAt);
  assert.ok(rackAt < afterReadAt);
  assert.ok(rackAt < afterReadTwoAt);
  assert.ok(rackAt < afterReadThreeAt);
  assert.ok(rackAt < afterReadFourAt);
  assert.ok(rackAt < afterReadFiveAt);
  assert.ok(rackAt < afterReadSixAt);
  assert.ok(rackAt < claimAt);
  assert.ok(soldAt < prizeAt);
  assert.equal((occupiedOpen.match(/data-sold-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-four="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-five="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-read-after-claim-six="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-sold="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-two="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-three="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-four="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-five="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-after-read-six="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /data-sold-cover="true" data-read-after-claim-sold="true" data-read-after-claim-two="true" data-read-after-claim-three="true" data-read-after-claim-four="true" data-read-after-claim-five="true" data-read-after-claim-six="true">This issue’s cover is sold\.</,
  );
  assert.match(
    occupiedOpen,
    /data-claim-cover="true" data-claim-after-sold="true" data-claim-after-read-sold="true" data-claim-after-read-two="true" data-claim-after-read-three="true" data-claim-after-read-four="true" data-claim-after-read-five="true" data-claim-after-read-six="true">Claim the next cover\.</,
  );
  assert.match(occupiedOpen, /\[data-read-after-claim-sold\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-two\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-three\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-four\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-five\]/);
  assert.match(occupiedOpen, /\[data-read-after-claim-six\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-sold\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-two\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-three\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-four\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-five\]/);
  assert.match(occupiedOpen, /a\[data-claim-after-read-six\]/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /You pay only the difference/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);
  assert.doesNotMatch(occupiedOpen, /data-read-stand/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-stand/);
  assert.doesNotMatch(occupiedOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-six="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-five="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-six="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-six="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-five="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-six="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-six="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-five="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-six="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("occupied open / lets Cover · #1 read before $bid", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const prizeAt = occupiedOpen.indexOf('data-prize-before-price="true"');
  const coverKickerAt = occupiedOpen.indexOf("Cover · #1");
  const bidAt = occupiedOpen.indexOf('class="bid"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  assert.notEqual(prizeAt, -1);
  assert.notEqual(coverKickerAt, -1);
  assert.notEqual(bidAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(prizeAt < bidAt);
  assert.ok(coverKickerAt < bidAt);
  assert.ok(prizeAt < claimAt);
  assert.equal((occupiedOpen.match(/data-prize-before-price="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /class="cover-line cover" data-prize-before-price="true" data-rank="1"/,
  );
  assert.match(occupiedOpen, /class="rank" data-cover-prize-line="true">Cover · #1</);
  assert.match(occupiedOpen, /\.week-open-sold \.cover-line\[data-prize-before-price\] \.rank/);
  assert.match(occupiedOpen, /font-size: 1\.85rem/);
  assert.match(occupiedOpen, /\.week-open-sold \.cover-line\[data-prize-before-price\] \.bid/);
  assert.match(occupiedOpen, /font-size: 0\.92rem/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /class="bid"/);
  assert.match(occupiedOpen, /\$12/);
  assert.match(occupiedOpen, /3 clicks/);
  assert.match(occupiedOpen, /data-read-cover="true"/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /data-cover-prize-line="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /#2/);
  assert.ok(occupiedOpen.indexOf('data-sold-cover="true"') < hopAt);
  assert.ok(occupiedOpen.indexOf('data-read-cover="true"') < hopAt);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-read-seven/);
  assert.doesNotMatch(occupiedOpen, /data-read-after-claim-seven/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /No cover sold/);
  assert.match(emptyOpen, /No paid listings on this board/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-prize-before-price="true"/);
  assert.doesNotMatch(emptyOpen, /Cover · #1/);
  assert.doesNotMatch(emptyOpen, /class="cover-line"/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);

  assert.doesNotMatch(closedOccupied, /data-prize-before-price="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-cover-prize-line="true"/);
  assert.ok(closedOccupied.indexOf("Cover · #1") < closedOccupied.indexOf('class="bid"'));
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /No paid listings on this board/);
  assert.doesNotMatch(closedEmpty, /data-prize-before-price="true"/);
  assert.doesNotMatch(closedEmpty, /Cover · #1/);
  assert.doesNotMatch(closedEmpty, /class="cover-line"/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);
});

test("occupied open / keeps later ranks quieter than Cover · #1", () => {
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
      {
        rank: 3,
        id: "lst_three",
        sponsorUrl: "https://third.example/slot",
        blurb: "Third slot",
        bidUsd: 5,
        clicks: 1,
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
      {
        rank: 2,
        id: "lst_also",
        sponsorUrl: "https://also.example/listed",
        blurb: "Also frozen",
        bidUsd: 8,
        clicks: 0,
      },
    ],
  });
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const prizeAt = occupiedOpen.indexOf('data-prize-before-price="true"');
  const laterAt = occupiedOpen.indexOf('data-later-rank="true"');
  const coverKickerAt = occupiedOpen.indexOf("Cover · #1");
  const twoAt = occupiedOpen.indexOf('data-rank="2"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  assert.notEqual(prizeAt, -1);
  assert.notEqual(laterAt, -1);
  assert.notEqual(coverKickerAt, -1);
  assert.notEqual(twoAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(prizeAt < laterAt);
  assert.ok(coverKickerAt < laterAt);
  assert.ok(laterAt < claimAt);
  assert.equal((occupiedOpen.match(/data-later-rank="true"/g) ?? []).length, 2);
  assert.equal((occupiedOpen.match(/data-prize-before-price="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /class="cover-line cover" data-prize-before-price="true" data-rank="1"/,
  );
  assert.match(
    occupiedOpen,
    /class="cover-line" data-later-rank="true" data-rank="2"/,
  );
  assert.match(
    occupiedOpen,
    /class="cover-line" data-later-rank="true" data-rank="3"/,
  );
  assert.doesNotMatch(
    occupiedOpen,
    /class="cover-line cover"[^>]*data-later-rank/,
  );
  assert.match(occupiedOpen, /class="rank" data-cover-prize-line="true">Cover · #1</);
  assert.match(occupiedOpen, /\.week-open-sold \.cover-line\[data-prize-before-price\] \.rank/);
  assert.match(occupiedOpen, /font-size: 1\.85rem/);
  assert.match(occupiedOpen, /\.week-open-sold \.cover-line\[data-later-rank\] \.rank/);
  assert.match(occupiedOpen, /\.week-open-sold \.cover-line\[data-later-rank\] \.slot \{\s*margin: 0\.18rem 0 0;/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /#2/);
  assert.match(occupiedOpen, /Also listed/);
  assert.match(occupiedOpen, /Third slot/);
  assert.match(occupiedOpen, /data-read-cover="true"/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /data-cover-prize-line="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.ok(occupiedOpen.indexOf('data-sold-cover="true"') < hopAt);
  assert.ok(occupiedOpen.indexOf('data-read-cover="true"') < hopAt);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-read-seven/);
  assert.doesNotMatch(occupiedOpen, /data-read-after-claim-seven/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /No cover sold/);
  assert.match(emptyOpen, /No paid listings on this board/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-later-rank="true"/);
  assert.doesNotMatch(emptyOpen, /data-prize-before-price="true"/);
  assert.doesNotMatch(emptyOpen, /Cover · #1/);
  assert.doesNotMatch(emptyOpen, /class="cover-line"/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);

  assert.doesNotMatch(closedOccupied, /data-prize-before-price="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-later-rank="true"/);
  assert.match(closedOccupied, /data-rank="2"/);
  assert.match(closedOccupied, /Also frozen/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /No paid listings on this board/);
  assert.doesNotMatch(closedEmpty, /data-later-rank="true"/);
  assert.doesNotMatch(closedEmpty, /data-prize-before-price="true"/);
  assert.doesNotMatch(closedEmpty, /Cover · #1/);
  assert.doesNotMatch(closedEmpty, /class="cover-line"/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);
});

test("closed archive stays empty-issue — the open cover is on the stand", () => {
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
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
      {
        rank: 2,
        id: "lst_also",
        sponsorUrl: "https://also.example/listed",
        blurb: "Also frozen",
        bidUsd: 8,
        clicks: 0,
      },
    ],
  });
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

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-empty-issue="true"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.match(closedEmpty, /This issue is closed\. It is not the next issue/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.match(closedEmpty, /href="\/"/);
  assert.match(closedEmpty, /The open cover is on the stand/);
  assert.match(closedEmpty, /No paid listings on this board/);
  assert.match(closedEmpty, /Nobody bought the cover/);
  assert.equal((closedEmpty.match(/data-open-cover="true"/g) ?? []).length, 1);
  assert.equal((closedEmpty.match(/href="\/" data-open-cover="true"/g) ?? []).length, 1);
  assert.match(closedEmpty, /\.week-closed-empty \.flag a\[data-open-cover\]/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /Claim the next cover/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-cover-prize="true"/);
  assert.doesNotMatch(closedEmpty, /data-cover-prize-line="true"/);
  assert.doesNotMatch(closedEmpty, /data-prize-before-price="true"/);
  assert.doesNotMatch(closedEmpty, /data-later-rank="true"/);
  assert.doesNotMatch(closedEmpty, /href="#claim"/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-read-seven/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-seven/);
  assert.doesNotMatch(closedEmpty, /subscriber/i);
  assert.doesNotMatch(closedEmpty, /article list/i);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /The open cover is on the stand/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /Frozen winner/);
  assert.match(closedOccupied, /data-rank="1"/);
  assert.match(closedOccupied, /data-rank="2"/);
  assert.equal((closedOccupied.match(/data-open-cover="true"/g) ?? []).length, 1);
  assert.equal((closedOccupied.match(/href="#claim"/g) ?? []).length, 0);
  assert.doesNotMatch(closedOccupied, /class="empty-issue"/);
  assert.doesNotMatch(closedOccupied, /data-closed-empty-issue/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-cover-prize="true"/);
  assert.doesNotMatch(closedOccupied, /data-cover-prize-line="true"/);
  assert.doesNotMatch(closedOccupied, /data-prize-before-price="true"/);
  assert.doesNotMatch(closedOccupied, /data-later-rank="true"/);
  assert.match(closedOccupied, /class="cover-line cover"/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);

  assert.match(occupiedOpen, /data-sold-cover="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /data-cover-prize-line="true"/);
  assert.match(occupiedOpen, /data-prize-before-price="true"/);
  assert.match(occupiedOpen, /data-later-rank="true"/);
  assert.match(occupiedOpen, /class="cover-line cover"/);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.doesNotMatch(occupiedOpen, /data-open-cover="true"/);
  assert.doesNotMatch(occupiedOpen, /data-closed-empty-issue/);
  assert.doesNotMatch(occupiedOpen, /class="empty-issue"/);

  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /data-cover-prize="true"/);
  assert.doesNotMatch(emptyOpen, /data-open-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-closed-empty-issue/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);
});

test("occupied open / names Cover · #1 from the listing blurb, not the host path", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const namedAt = occupiedOpen.indexOf('data-named-prize="true"');
  const hedAt = occupiedOpen.indexOf('class="hed"><a href="/l/lst_cover" data-cover-first="true">Widgets for the next issue<');
  const dekAt = occupiedOpen.indexOf('class="dek"><a href="/l/lst_cover">sponsor.example/pitch');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(namedAt, -1);
  assert.notEqual(hedAt, -1);
  assert.notEqual(dekAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(hedAt < dekAt);
  assert.ok(namedAt < claimAt);
  assert.equal((occupiedOpen.match(/data-named-prize="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /class="cover-line cover" data-prize-before-price="true" data-rank="1"[^>]*data-named-prize="true"/,
  );
  assert.match(occupiedOpen, /class="rank" data-cover-prize-line="true">Cover · #1</);
  assert.match(occupiedOpen, /class="hed"><a href="\/l\/lst_cover" data-cover-first="true">Widgets for the next issue</);
  assert.match(occupiedOpen, /class="dek"><a href="\/l\/lst_cover">sponsor\.example\/pitch</);
  assert.match(occupiedOpen, /\.week-open-sold \.cover-line\[data-named-prize\] \.hed/);
  assert.match(occupiedOpen, /\.week-open-sold \.cover-line\[data-named-prize\] \.dek \{\s*font-size: 0\.78rem/);
  assert.match(occupiedOpen, /data-prize-before-price="true"/);
  assert.match(occupiedOpen, /data-later-rank="true"/);
  assert.match(occupiedOpen, /data-cover-prize-line="true"/);
  assert.match(occupiedOpen, /data-read-cover="true"/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /#2/);
  assert.match(occupiedOpen, /Also listed/);
  assert.doesNotMatch(
    occupiedOpen,
    /class="cover-line"[^>]*data-named-prize/,
  );
  assert.doesNotMatch(occupiedOpen, /data-claim-after-read-seven/);
  assert.doesNotMatch(occupiedOpen, /data-read-after-claim-seven/);
  assert.doesNotMatch(occupiedOpen, /og:title/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /No cover sold/);
  assert.match(emptyOpen, /No paid listings on this board/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /data-named-prize="true"/);
  assert.doesNotMatch(emptyOpen, /Cover · #1/);
  assert.doesNotMatch(emptyOpen, /class="cover-line"/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);

  assert.doesNotMatch(closedOccupied, /data-named-prize="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /Frozen winner/);
  assert.match(closedOccupied, /won\.example\/cover/);
  assert.doesNotMatch(closedOccupied, /data-cover-prize-line="true"/);
  assert.doesNotMatch(closedOccupied, /data-prize-before-price="true"/);
  assert.doesNotMatch(closedOccupied, /data-later-rank="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.match(closedEmpty, /No paid listings on this board/);
  assert.doesNotMatch(closedEmpty, /data-named-prize="true"/);
  assert.doesNotMatch(closedEmpty, /Cover · #1/);
  assert.doesNotMatch(closedEmpty, /class="cover-line"/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);
});

test("empty open / stays the empty stand — no sold-cover, Claim the next cover, or named prize", () => {
  const emptyOpen = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [],
  });
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
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

  const weekAt = emptyOpen.indexOf('class="week week-open-empty" data-empty-open-stand="true"');
  const standAt = emptyOpen.indexOf('data-empty-open-stand="true"');
  const readStandAt = emptyOpen.indexOf('data-read-stand="true"');
  const hopAt = emptyOpen.indexOf('data-claim-after-stand="true"');
  const claimAt = emptyOpen.indexOf('id="claim"');
  assert.notEqual(weekAt, -1);
  assert.notEqual(standAt, -1);
  assert.notEqual(readStandAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(weekAt < readStandAt);
  assert.ok(standAt < claimAt);
  assert.ok(readStandAt < hopAt);
  assert.ok(hopAt < claimAt);
  assert.match(
    emptyOpen,
    /class="week week-open-empty" data-empty-open-stand="true"[\s\S]*id="claim"/,
  );
  assert.equal((emptyOpen.match(/data-empty-open-stand="true"/g) ?? []).length, 3);
  assert.equal((emptyOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(emptyOpen, /class="week week-open-empty" data-empty-open-stand="true"/);
  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(
    emptyOpen,
    /class="empty-stand" aria-label="This issue’s cover" data-read-stand="true" data-empty-open-stand="true"/,
  );
  assert.match(emptyOpen, /class="flag" data-empty-open-stand="true"/);
  assert.match(emptyOpen, /class="claim-note" data-empty-issue="true" data-cover-prize="true"/);
  assert.match(emptyOpen, /The next issue’s cover goes to whoever pays the most/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /data-fair-window="true"/);
  assert.match(emptyOpen, /Live rank is rolling last 7 days from paid placement/);
  assert.doesNotMatch(emptyOpen.slice(emptyOpen.indexOf("</style>")), /data-rolling-week=/);
  assert.doesNotMatch(emptyOpen.slice(emptyOpen.indexOf("</style>")), /class="week-window"/);
  assert.match(emptyOpen, /No cover sold/);
  assert.match(emptyOpen, /No paid listings on this board/);
  assert.match(emptyOpen, /class="claim-note" data-empty-issue="true" data-cover-prize="true"/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /class="outbid"/);
  assert.match(emptyOpen, /Claim this issue’s cover/);
  assert.doesNotMatch(emptyOpen, /\.week-open-sold \.flag \[data-read-after-claim-sold\]/);
  assert.doesNotMatch(emptyOpen, /\.week-open-sold \.cover-line\[data-named-prize\] \.hed/);
  assert.doesNotMatch(emptyOpen, /\.week-open-empty\[data-empty-open-stand\] \[data-sold-cover\]/);
  assert.doesNotMatch(emptyOpen, /\.week-open-empty\[data-empty-open-stand\] \[data-claim-cover\]/);
  assert.doesNotMatch(emptyOpen, /\.week-open-empty\[data-empty-open-stand\] \[data-named-prize\]/);
  assert.doesNotMatch(emptyOpen, /\.week-open-empty \.cover-rack/);
  assert.match(emptyOpen, /\.week-closed-empty \.empty-stand/);
  assert.doesNotMatch(emptyOpen, /class="week week-open-sold"/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-named-prize="true"/);
  assert.doesNotMatch(emptyOpen, /Cover · #1/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);
  assert.doesNotMatch(emptyOpen, /data-cover-prize-line="true"/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);
  assert.doesNotMatch(emptyOpen, /data-closed-empty-issue/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-seven/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-seven/);
  assert.doesNotMatch(emptyOpen, /subscriber/i);
  assert.doesNotMatch(emptyOpen, /article list/i);

  assert.match(occupiedOpen, /class="week week-open-sold"/);
  assert.match(occupiedOpen, /data-sold-cover="true"/);
  assert.match(occupiedOpen, /This issue’s cover is sold/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /data-named-prize="true"/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /class="hed"><a href="\/l\/lst_cover" data-cover-first="true">Widgets for the next issue</);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.doesNotMatch(occupiedOpen, /data-empty-open-stand="true"/);
  assert.doesNotMatch(occupiedOpen, /class="week week-open-empty"/);
  assert.doesNotMatch(occupiedOpen, /class="empty-stand"/);
  assert.doesNotMatch(occupiedOpen.slice(occupiedOpen.indexOf("</style>")), /data-fair-window=/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);

  assert.match(closedEmpty, /class="week week-closed-empty"/);
  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.match(closedEmpty, /No paid listings on this board/);
  assert.doesNotMatch(closedEmpty, /data-empty-open-stand="true"/);
  assert.doesNotMatch(closedEmpty, /class="empty-stand"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover="true"/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /Claim the next cover/);
  assert.doesNotMatch(closedEmpty, /data-named-prize="true"/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);

  assert.match(closedOccupied, /class="week week-closed-occupied"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /Frozen winner/);
  assert.doesNotMatch(closedOccupied, /data-empty-open-stand="true"/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-named-prize="true"/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);
});

test("occupied open / keeps Cover · #1 prize before $bid — host path is a later fact", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const namedAt = occupiedOpen.indexOf('data-named-prize="true"');
  const prizeAt = occupiedOpen.indexOf('data-prize-before-price="true"');
  const coverKickerAt = occupiedOpen.indexOf("Cover · #1");
  const hedAt = occupiedOpen.indexOf('class="hed"><a href="/l/lst_cover" data-cover-first="true">Widgets for the next issue<');
  const laterFactAt = occupiedOpen.indexOf('data-later-fact="true"');
  const dekAt = occupiedOpen.indexOf('class="dek"><a href="/l/lst_cover">sponsor.example/pitch');
  const bidAt = occupiedOpen.indexOf('class="bid">$12<');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(namedAt, -1);
  assert.notEqual(prizeAt, -1);
  assert.notEqual(coverKickerAt, -1);
  assert.notEqual(hedAt, -1);
  assert.notEqual(laterFactAt, -1);
  assert.notEqual(dekAt, -1);
  assert.notEqual(bidAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(coverKickerAt < hedAt);
  assert.ok(hedAt < laterFactAt);
  assert.ok(laterFactAt < dekAt);
  assert.ok(dekAt < bidAt);
  assert.ok(hedAt < bidAt);
  assert.ok(prizeAt < bidAt);
  assert.ok(namedAt < claimAt);
  assert.equal((occupiedOpen.match(/data-later-fact="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-named-prize="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-prize-before-price="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /class="cover-line cover" data-prize-before-price="true" data-rank="1"[^>]*data-named-prize="true"/,
  );
  assert.match(occupiedOpen, /class="rank" data-cover-prize-line="true">Cover · #1</);
  assert.match(occupiedOpen, /class="hed"><a href="\/l\/lst_cover" data-cover-first="true">Widgets for the next issue</);
  assert.match(
    occupiedOpen,
    /class="later-fact" data-later-fact="true"[\s\S]*class="dek"><a href="\/l\/lst_cover">sponsor\.example\/pitch[\s\S]*class="bid">\$12</,
  );
  assert.match(occupiedOpen, /3 clicks/);
  assert.match(
    occupiedOpen,
    /\.week-open-sold \.cover-line\.cover\[data-prize-before-price\] \{\s*grid-template-columns: max-content 1fr;/,
  );
  assert.match(
    occupiedOpen,
    /\.week-open-sold \.cover-line\[data-prize-before-price\]\[data-named-prize\] \.later-fact\[data-later-fact\]/,
  );
  assert.match(occupiedOpen, /data-read-cover="true"/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /data-cover-prize-line="true"/);
  assert.match(occupiedOpen, /data-later-rank="true"/);
  assert.match(occupiedOpen, /#2/);
  assert.match(occupiedOpen, /Also listed/);
  assert.doesNotMatch(
    occupiedOpen,
    /class="cover-line cover"[\s\S]{0,400}class="money"/,
  );
  assert.doesNotMatch(
    occupiedOpen,
    /class="cover-line"[^>]*data-later-fact/,
  );
  assert.ok(occupiedOpen.indexOf('data-sold-cover="true"') < hopAt);
  assert.ok(occupiedOpen.indexOf('data-read-cover="true"') < hopAt);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-read-seven/);
  assert.doesNotMatch(occupiedOpen, /data-read-after-claim-seven/);
  assert.doesNotMatch(occupiedOpen, /og:title/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  const twoStart = occupiedOpen.indexOf('data-rank="2"');
  const twoSlice = occupiedOpen.slice(twoStart);
  assert.match(twoSlice, /class="money"/);
  assert.doesNotMatch(twoSlice.slice(0, 600), /data-later-fact/);

  assert.match(emptyOpen, /class="week week-open-empty"/);
  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /No cover sold/);
  assert.match(emptyOpen, /No paid listings on this board/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.doesNotMatch(emptyOpen, /\.week-open-empty\[data-empty-open-stand\] \[data-later-fact\]/);
  assert.doesNotMatch(emptyOpen, /later-fact/);
  assert.doesNotMatch(emptyOpen, /data-later-fact="true"/);
  assert.doesNotMatch(emptyOpen, /data-named-prize="true"/);
  assert.doesNotMatch(emptyOpen, /Cover · #1/);
  assert.doesNotMatch(emptyOpen, /class="cover-line"/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);

  assert.doesNotMatch(closedOccupied, /data-later-fact="true"/);
  assert.doesNotMatch(closedOccupied, /data-named-prize="true"/);
  assert.doesNotMatch(closedOccupied, /data-prize-before-price="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /Frozen winner/);
  assert.match(closedOccupied, /won\.example\/cover/);
  assert.match(closedOccupied, /class="money"/);
  assert.ok(closedOccupied.indexOf("Cover · #1") < closedOccupied.indexOf('class="bid"'));
  assert.doesNotMatch(closedOccupied, /data-cover-prize-line="true"/);
  assert.doesNotMatch(closedOccupied, /data-later-rank="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.match(closedEmpty, /No paid listings on this board/);
  assert.doesNotMatch(closedEmpty, /data-later-fact="true"/);
  assert.doesNotMatch(closedEmpty, /data-named-prize="true"/);
  assert.doesNotMatch(closedEmpty, /Cover · #1/);
  assert.doesNotMatch(closedEmpty, /class="cover-line"/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);
});

test("empty open / stays Claim #1 — later-fact / named-prize cannot leak", () => {
  const emptyOpen = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [],
  });
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
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
  const unsetEmpty = renderBoardHtml({
    issueDate: null,
    status: null,
    listings: [],
  });

  const emptyCss = emptyOpen.slice(emptyOpen.indexOf("<style>"), emptyOpen.indexOf("</style>"));
  const occupiedCss = occupiedOpen.slice(
    occupiedOpen.indexOf("<style>"),
    occupiedOpen.indexOf("</style>"),
  );
  const closedEmptyCss = closedEmpty.slice(
    closedEmpty.indexOf("<style>"),
    closedEmpty.indexOf("</style>"),
  );
  const closedOccupiedCss = closedOccupied.slice(
    closedOccupied.indexOf("<style>"),
    closedOccupied.indexOf("</style>"),
  );
  assert.equal(emptyCss, `<style>${FOLIO_CSS}`);
  assert.ok(occupiedCss.includes(OCCUPIED_CSS));
  assert.ok(!emptyCss.includes(OCCUPIED_CSS));
  assert.equal(closedEmptyCss, `<style>${FOLIO_CSS}`);
  assert.equal(closedOccupiedCss, `<style>${FOLIO_CSS}`);

  const weekAt = emptyOpen.indexOf('class="week week-open-empty" data-empty-open-stand="true"');
  const standAt = emptyOpen.indexOf('class="empty-stand"');
  const claimAt = emptyOpen.indexOf('id="claim"');
  assert.notEqual(weekAt, -1);
  assert.notEqual(standAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(weekAt < standAt);
  assert.ok(standAt < claimAt);
  assert.equal((emptyOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(emptyOpen, /class="week week-open-empty"/);
  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /class="outbid"/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /No cover sold/);
  assert.match(emptyOpen, /No paid listings on this board/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /text-decoration: underline dashed/);
  assert.doesNotMatch(emptyCss, /later-fact/);
  assert.doesNotMatch(emptyCss, /data-later-fact/);
  assert.doesNotMatch(emptyCss, /data-named-prize/);
  assert.doesNotMatch(emptyCss, /\[data-named-prize\]/);
  assert.doesNotMatch(emptyCss, /\[data-later-fact\]/);
  assert.doesNotMatch(emptyCss, /data-prize-before-price/);
  assert.doesNotMatch(emptyCss, /data-sold-cover/);
  assert.doesNotMatch(emptyCss, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /data-later-fact="true"/);
  assert.doesNotMatch(emptyOpen, /data-named-prize="true"/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /Cover · #1/);
  assert.doesNotMatch(emptyOpen, /class="cover-line"/);
  assert.doesNotMatch(emptyOpen, /class="week week-open-sold"/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-seven/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-seven/);
  assert.doesNotMatch(emptyOpen, /subscriber/i);
  assert.doesNotMatch(emptyOpen, /article list/i);

  assert.match(occupiedOpen, /class="week week-open-sold"/);
  assert.match(occupiedOpen, /data-later-fact="true"/);
  assert.match(occupiedOpen, /data-named-prize="true"/);
  assert.match(occupiedOpen, /class="hed"><a href="\/l\/lst_cover" data-cover-first="true">Widgets for the next issue</);
  assert.match(
    occupiedOpen,
    /class="later-fact" data-later-fact="true"[\s\S]*class="dek"><a href="\/l\/lst_cover">sponsor\.example\/pitch[\s\S]*class="bid">\$12</,
  );
  assert.match(
    occupiedCss,
    /\.week-open-sold \.cover-line\[data-prize-before-price\]\[data-named-prize\] \.later-fact\[data-later-fact\]/,
  );
  assert.match(occupiedOpen, /data-read-cover="true"/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-later-fact="true"/g) ?? []).length, 1);
  assert.doesNotMatch(occupiedOpen, /data-empty-open-stand="true"/);
  assert.doesNotMatch(occupiedOpen, /class="week week-open-empty"/);
  assert.doesNotMatch(occupiedOpen, /class="empty-stand"/);

  assert.match(closedEmpty, /class="week week-closed-empty"/);
  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmptyCss, /later-fact/);
  assert.doesNotMatch(closedEmptyCss, /data-named-prize/);
  assert.doesNotMatch(closedEmpty, /data-later-fact="true"/);
  assert.doesNotMatch(closedEmpty, /data-named-prize="true"/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);

  assert.match(closedOccupied, /class="week week-closed-occupied"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /Frozen winner/);
  assert.match(closedOccupied, /class="money"/);
  assert.doesNotMatch(closedOccupiedCss, /later-fact/);
  assert.doesNotMatch(closedOccupiedCss, /data-named-prize/);
  assert.doesNotMatch(closedOccupied, /data-later-fact="true"/);
  assert.doesNotMatch(closedOccupied, /data-named-prize="true"/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(unsetEmpty, /class="empty-stand"/);
  assert.match(unsetEmpty, /Claim #1 for/);
  const unsetCss = unsetEmpty.slice(unsetEmpty.indexOf("<style>"), unsetEmpty.indexOf("</style>"));
  assert.doesNotMatch(unsetCss, /later-fact/);
  assert.doesNotMatch(unsetEmpty, /data-later-fact="true"/);
  assert.doesNotMatch(unsetEmpty, /data-named-prize="true"/);
});

test("occupied open / keeps Claim the next cover quieter than Cover · #1 — prize stays first", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const occupiedCss = occupiedOpen.slice(
    occupiedOpen.indexOf("<style>"),
    occupiedOpen.indexOf("</style>"),
  );
  const emptyCss = emptyOpen.slice(emptyOpen.indexOf("<style>"), emptyOpen.indexOf("</style>"));
  const closedEmptyCss = closedEmpty.slice(
    closedEmpty.indexOf("<style>"),
    closedEmpty.indexOf("</style>"),
  );
  const closedOccupiedCss = closedOccupied.slice(
    closedOccupied.indexOf("<style>"),
    closedOccupied.indexOf("</style>"),
  );

  const coverFirstAt = occupiedOpen.indexOf('data-cover-first="true"');
  const coverKickerAt = occupiedOpen.indexOf("Cover · #1");
  const hedAt = occupiedOpen.indexOf(
    'class="hed"><a href="/l/lst_cover" data-cover-first="true">Widgets for the next issue<',
  );
  const laterFactAt = occupiedOpen.indexOf('data-later-fact="true"');
  const dekAt = occupiedOpen.indexOf('class="dek"><a href="/l/lst_cover">sponsor.example/pitch');
  const bidAt = occupiedOpen.indexOf('class="bid">$12<');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(coverFirstAt, -1);
  assert.notEqual(coverKickerAt, -1);
  assert.notEqual(hedAt, -1);
  assert.notEqual(laterFactAt, -1);
  assert.notEqual(dekAt, -1);
  assert.notEqual(bidAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(coverKickerAt < hedAt);
  assert.ok(hedAt < laterFactAt);
  assert.ok(laterFactAt < dekAt);
  assert.ok(dekAt < bidAt);
  assert.ok(hedAt < bidAt);
  assert.ok(rackAt < hopAt);
  assert.ok(rackAt < claimAt);
  assert.ok(coverFirstAt < claimAt);
  assert.equal((occupiedOpen.match(/data-cover-first="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /class="hed"><a href="\/l\/lst_cover" data-cover-first="true">Widgets for the next issue</,
  );
  assert.match(occupiedOpen, /class="rank" data-cover-prize-line="true">Cover · #1</);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /data-read-cover="true"/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /data-cover-prize-line="true"/);
  assert.match(occupiedOpen, /data-prize-before-price="true"/);
  assert.match(occupiedOpen, /data-named-prize="true"/);
  assert.match(occupiedOpen, /data-later-fact="true"/);
  assert.match(occupiedOpen, /data-later-rank="true"/);
  assert.match(occupiedOpen, /#2/);
  assert.match(occupiedOpen, /Also listed/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(
    occupiedCss,
    /\.week-open-sold \.cover-line\[data-named-prize\] \.hed a\[data-cover-first\]/,
  );
  assert.match(occupiedCss, /\.week-open-sold \.claim-after-listing a\[data-claim-cover\] \{\s*display: inline;/);
  assert.match(occupiedCss, /\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{\s*font-size: 1\.55rem/);
  const prizeHed = occupiedCss.match(
    /\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{([^}]*)\}/,
  );
  const claimHop = occupiedCss.match(/\.week-open-sold \.claim-after-listing a\[data-claim-cover\] \{([^}]*)\}/);
  assert.ok(prizeHed);
  assert.ok(claimHop);
  const prizeSize = prizeHed[1].match(/font-size:\s*([\d.]+)rem/);
  const claimSize = claimHop[1].match(/font-size:\s*([\d.]+)rem/);
  assert.ok(prizeSize);
  assert.ok(claimSize);
  assert.ok(
    Number(claimSize[1]) < Number(prizeSize[1]),
    "Claim the next cover must stay quieter than Cover · #1",
  );
  assert.match(claimHop[1], /color:\s*var\(--mute\)/);
  assert.match(claimHop[1], /font-weight:\s*400/);
  assert.match(claimHop[1], /text-transform:\s*none/);
  assert.doesNotMatch(
    occupiedOpen,
    /class="cover-line"[^>]*data-cover-first/,
  );
  assert.doesNotMatch(occupiedOpen, /data-claim-after-read-seven/);
  assert.doesNotMatch(occupiedOpen, /data-read-after-claim-seven/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.equal(emptyCss, `<style>${FOLIO_CSS}`);
  assert.ok(occupiedCss.includes(OCCUPIED_CSS));
  assert.ok(!emptyCss.includes(OCCUPIED_CSS));
  assert.match(emptyOpen, /class="week week-open-empty"/);
  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.doesNotMatch(emptyOpen, /data-cover-first="true"/);
  assert.doesNotMatch(emptyCss, /data-cover-first/);
  assert.doesNotMatch(emptyCss, /a\[data-cover-first\]/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /Cover · #1/);
  assert.doesNotMatch(emptyOpen, /class="cover-line"/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);

  assert.equal(closedEmptyCss, `<style>${FOLIO_CSS}`);
  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.doesNotMatch(closedEmpty, /data-cover-first="true"/);
  assert.doesNotMatch(closedEmptyCss, /data-cover-first/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);

  assert.equal(closedOccupiedCss, `<style>${FOLIO_CSS}`);
  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /Frozen winner/);
  assert.match(closedOccupied, /class="money"/);
  assert.doesNotMatch(closedOccupied, /data-cover-first="true"/);
  assert.doesNotMatch(closedOccupiedCss, /data-cover-first/);
  assert.doesNotMatch(closedOccupied, /data-named-prize="true"/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);
});

test("empty open / keeps Claim #1 the first click — cover URL is a later write", () => {
  const emptyOpen = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [],
  });
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
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
  const unsetEmpty = renderBoardHtml({
    issueDate: null,
    status: null,
    listings: [],
  });

  const emptyCss = emptyOpen.slice(emptyOpen.indexOf("<style>"), emptyOpen.indexOf("</style>"));
  const occupiedCss = occupiedOpen.slice(
    occupiedOpen.indexOf("<style>"),
    occupiedOpen.indexOf("</style>"),
  );
  const closedEmptyCss = closedEmpty.slice(
    closedEmpty.indexOf("<style>"),
    closedEmpty.indexOf("</style>"),
  );
  const closedOccupiedCss = closedOccupied.slice(
    closedOccupied.indexOf("<style>"),
    closedOccupied.indexOf("</style>"),
  );

  const claimAt = emptyOpen.indexOf(
    'class="claim empty-claim-first" id="claim" data-empty-claim-first="true" aria-label="Claim #1"',
  );
  const emptyClaimAt = emptyOpen.indexOf('data-empty-claim-first="true"', claimAt);
  const firstClickAt = emptyOpen.indexOf('data-first-click="claim"', claimAt);
  const outbidAt = emptyOpen.indexOf(">Outbid<", claimAt);
  const laterWriteAt = emptyOpen.indexOf('data-later-write="true"', claimAt);
  const laterLabelAt = emptyOpen.indexOf("Then the cover URL", claimAt);
  const coverIdentityAt = emptyOpen.indexOf('data-cover-identity="true"', claimAt);
  const sponsorAt = emptyOpen.indexOf('name="sponsorUrl"', claimAt);
  const blurbAt = emptyOpen.indexOf('name="blurb"', claimAt);
  const standAt = emptyOpen.indexOf('data-read-stand="true"');
  const hopAt = emptyOpen.indexOf('data-claim-after-stand="true"');
  assert.notEqual(claimAt, -1);
  assert.notEqual(emptyClaimAt, -1);
  assert.notEqual(firstClickAt, -1);
  assert.notEqual(outbidAt, -1);
  assert.notEqual(laterWriteAt, -1);
  assert.notEqual(laterLabelAt, -1);
  assert.notEqual(coverIdentityAt, -1);
  assert.notEqual(sponsorAt, -1);
  assert.notEqual(blurbAt, -1);
  assert.notEqual(standAt, -1);
  assert.notEqual(hopAt, -1);
  assert.ok(standAt < hopAt);
  assert.ok(hopAt < claimAt);
  assert.ok(emptyClaimAt < firstClickAt);
  assert.ok(firstClickAt < outbidAt);
  assert.ok(outbidAt < laterWriteAt);
  assert.ok(laterWriteAt < laterLabelAt);
  assert.ok(laterLabelAt < sponsorAt);
  assert.ok(sponsorAt < blurbAt);
  assert.ok(coverIdentityAt < sponsorAt);
  assert.equal((emptyOpen.match(/data-first-click="claim"/g) ?? []).length, 2);
  assert.equal((emptyOpen.match(/class="claim-hed" data-first-click="claim"/g) ?? []).length, 1);
  assert.equal((emptyOpen.match(/data-empty-claim-first="true"/g) ?? []).length, 1);
  assert.equal((emptyOpen.match(/data-later-write="true"/g) ?? []).length, 1);
  assert.equal((emptyOpen.match(/data-cover-identity="true"/g) ?? []).length, 1);
  assert.equal((emptyOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    emptyOpen,
    /class="claim empty-claim-first" id="claim" data-empty-claim-first="true" aria-label="Claim #1"/,
  );
  assert.match(emptyOpen, /class="claim-hed" data-first-click="claim"/);
  assert.match(emptyOpen, /class="cover-identity" data-cover-identity="true" data-later-write="true"/);
  assert.match(emptyOpen, /class="later-write-label">Then the cover URL</);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /class="outbid"/);
  assert.match(emptyOpen, />Outbid</);
  assert.match(emptyOpen, /name="sponsorUrl"/);
  assert.match(emptyOpen, /name="blurb"/);
  assert.match(emptyOpen, /name="bidUsd"/);
  assert.match(emptyOpen, /class="amount-field"/);
  assert.match(emptyOpen, /text-decoration: underline dashed/);
  assert.match(emptyOpen, /data-bid-step="-1"/);
  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /No cover sold/);
  assert.match(emptyOpen, /No paid listings on this board/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(emptyOpen, /class="week week-open-empty"/);
  assert.doesNotMatch(emptyOpen, /class="bid-row"/);
  assert.match(
    emptyCss,
    /\.week-open-empty #claim\.empty-claim-first\[data-empty-claim-first\] \.cover-identity\[data-later-write\]/,
  );
  assert.match(
    emptyCss,
    /\.week-open-empty #claim\.empty-claim-first\[data-empty-claim-first\] \.later-write-label/,
  );
  assert.match(
    emptyCss,
    /\.week-open-empty #claim\.empty-claim-first\[data-empty-claim-first\] \.claim-hed\[data-first-click="claim"\]/,
  );
  assert.doesNotMatch(emptyOpen, /data-cover-first="true"/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /Cover · #1/);
  assert.doesNotMatch(emptyOpen, /class="cover-line"/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-seven/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-seven/);
  assert.doesNotMatch(emptyOpen, /subscriber/i);
  assert.doesNotMatch(emptyOpen, /article list/i);

  const occupiedClaimAt = occupiedOpen.indexOf('id="claim"');
  const occupiedOutbidAt = occupiedOpen.indexOf(">Outbid<");
  const occupiedBidRowAt = occupiedOpen.indexOf('class="bid-row"');
  const occupiedSponsorAt = occupiedOpen.indexOf('name="sponsorUrl"');
  const occupiedCoverFirstAt = occupiedOpen.indexOf('data-cover-first="true"');
  const occupiedHopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  assert.notEqual(occupiedClaimAt, -1);
  assert.notEqual(occupiedOutbidAt, -1);
  assert.notEqual(occupiedBidRowAt, -1);
  assert.notEqual(occupiedSponsorAt, -1);
  assert.notEqual(occupiedCoverFirstAt, -1);
  assert.notEqual(occupiedHopAt, -1);
  assert.ok(occupiedCoverFirstAt < occupiedClaimAt);
  assert.ok(occupiedHopAt < occupiedClaimAt);
  assert.ok(occupiedBidRowAt < occupiedOutbidAt);
  assert.ok(occupiedSponsorAt < occupiedOutbidAt);
  assert.equal((occupiedOpen.match(/data-cover-first="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(occupiedOpen, /class="claim" id="claim"/);
  assert.match(occupiedOpen, /class="bid-row"/);
  assert.match(occupiedOpen, /class="hed"><a href="\/l\/lst_cover" data-cover-first="true">Widgets for the next issue</);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /data-named-prize="true"/);
  assert.match(occupiedOpen, /data-later-fact="true"/);
  assert.match(occupiedCss, /\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{\s*font-size: 1\.55rem/);
  const prizeHed = occupiedCss.match(
    /\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{([^}]*)\}/,
  );
  const claimHop = occupiedCss.match(/\.week-open-sold \.claim-after-listing a\[data-claim-cover\] \{([^}]*)\}/);
  assert.ok(prizeHed);
  assert.ok(claimHop);
  const prizeSize = prizeHed[1].match(/font-size:\s*([\d.]+)rem/);
  const claimSize = claimHop[1].match(/font-size:\s*([\d.]+)rem/);
  assert.ok(prizeSize);
  assert.ok(claimSize);
  assert.ok(
    Number(claimSize[1]) < Number(prizeSize[1]),
    "Claim the next cover must stay quieter than Cover · #1",
  );
  assert.doesNotMatch(occupiedOpen, /data-empty-claim-first="true"/);
  assert.doesNotMatch(occupiedOpen, /class="claim empty-claim-first"/);
  assert.doesNotMatch(occupiedOpen, /class="claim-hed" data-first-click="claim"/);
  assert.doesNotMatch(occupiedOpen, /data-later-write="true"/);
  assert.doesNotMatch(occupiedOpen, /data-cover-identity="true"/);
  assert.doesNotMatch(occupiedOpen, /Then the cover URL/);
  assert.doesNotMatch(occupiedOpen, /class="week week-open-empty"/);
  assert.doesNotMatch(occupiedOpen, /class="empty-stand"/);

  assert.equal(closedEmptyCss, `<style>${FOLIO_CSS}`);
  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-later-write="true"/);
  assert.doesNotMatch(closedEmpty, /Then the cover URL/);
  assert.doesNotMatch(closedEmpty, /data-empty-claim-first="true"/);
  assert.doesNotMatch(closedEmpty, /class="claim-hed" data-first-click="claim"/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);
  assert.doesNotMatch(closedEmpty, /class="cover-identity"/);

  assert.equal(closedOccupiedCss, `<style>${FOLIO_CSS}`);
  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /Frozen winner/);
  assert.doesNotMatch(closedOccupied, /data-later-write="true"/);
  assert.doesNotMatch(closedOccupied, /Then the cover URL/);
  assert.doesNotMatch(closedOccupied, /data-empty-claim-first="true"/);
  assert.doesNotMatch(closedOccupied, /data-cover-first="true"/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(unsetEmpty, /class="empty-stand"/);
  assert.match(unsetEmpty, /Claim #1 for/);
  assert.match(unsetEmpty, /data-later-write="true"/);
  assert.match(unsetEmpty, /Then the cover URL/);
  assert.doesNotMatch(unsetEmpty, /class="bid-row"/);
});

test("occupied open / keeps Cover · #1 as the paid name — later ranks cannot wear it", () => {
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
      {
        rank: 3,
        id: "lst_three",
        sponsorUrl: "https://third.example/slot",
        blurb: "Third slot",
        bidUsd: 5,
        clicks: 1,
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
      {
        rank: 2,
        id: "lst_also",
        sponsorUrl: "https://also.example/listed",
        blurb: "Also frozen",
        bidUsd: 8,
        clicks: 0,
      },
    ],
  });
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const occupiedCss = occupiedOpen.slice(
    occupiedOpen.indexOf("<style>"),
    occupiedOpen.indexOf("</style>"),
  );
  const emptyCss = emptyOpen.slice(emptyOpen.indexOf("<style>"), emptyOpen.indexOf("</style>"));
  const closedEmptyCss = closedEmpty.slice(
    closedEmpty.indexOf("<style>"),
    closedEmpty.indexOf("</style>"),
  );
  const closedOccupiedCss = closedOccupied.slice(
    closedOccupied.indexOf("<style>"),
    closedOccupied.indexOf("</style>"),
  );

  const paidAt = occupiedOpen.indexOf('data-paid-name="true"');
  const coverFirstAt = occupiedOpen.indexOf('data-cover-first="true"');
  const hedAt = occupiedOpen.indexOf(
    'class="hed"><a href="/l/lst_cover" data-cover-first="true">Widgets for the next issue<',
  );
  const laterFactAt = occupiedOpen.indexOf('data-later-fact="true"');
  const dekAt = occupiedOpen.indexOf('class="dek"><a href="/l/lst_cover">sponsor.example/pitch');
  const laterAt = occupiedOpen.indexOf('data-later-rank="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const laterListingAt = occupiedOpen.indexOf('data-later-listing="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(paidAt, -1);
  assert.notEqual(coverFirstAt, -1);
  assert.notEqual(hedAt, -1);
  assert.notEqual(laterFactAt, -1);
  assert.notEqual(dekAt, -1);
  assert.notEqual(laterAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(laterListingAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(paidAt < laterAt);
  assert.ok(hedAt < laterFactAt);
  assert.ok(laterFactAt < dekAt);
  assert.ok(hedAt < laterAt);
  assert.ok(laterAt < claimAt);
  assert.ok(occupiedOpen.indexOf('data-read-cover="true"') < hopAt);
  assert.ok(laterListingAt > claimAt);
  assert.equal((occupiedOpen.match(/data-paid-name="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-cover-first="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-later-listing="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    occupiedOpen,
    /class="cover-line cover" data-prize-before-price="true" data-rank="1"[^>]*data-named-prize="true"[^>]*data-paid-name="true"/,
  );
  assert.match(occupiedOpen, /class="hed"><a href="\/l\/lst_cover" data-cover-first="true">Widgets for the next issue</);
  assert.match(occupiedOpen, /class="rank" data-cover-prize-line="true">Cover · #1</);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /Widgets for the next issue/);
  assert.match(occupiedOpen, /data-read-cover="true"/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /data-cover-prize-line="true"/);
  assert.match(occupiedOpen, /data-prize-before-price="true"/);
  assert.match(occupiedOpen, /data-named-prize="true"/);
  assert.match(occupiedOpen, /data-later-fact="true"/);
  assert.match(occupiedOpen, /data-later-rank="true"/);
  assert.match(occupiedOpen, /data-cover-first="true"/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /class="bid-row"/);
  assert.match(occupiedOpen, /class="later-listing" data-later-listing="true"/);
  assert.match(occupiedOpen, /placeholder="One-line listing"/);
  assert.doesNotMatch(occupiedOpen, /One-line cover pitch/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-read-seven/);
  assert.doesNotMatch(occupiedOpen, /data-read-after-claim-seven/);
  assert.doesNotMatch(occupiedOpen, /og:title/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  const twoStart = occupiedOpen.indexOf(
    'class="cover-line" data-later-rank="true" data-rank="2"',
  );
  const threeStart = occupiedOpen.indexOf(
    'class="cover-line" data-later-rank="true" data-rank="3"',
  );
  const twoSlice = occupiedOpen.slice(twoStart, threeStart === -1 ? undefined : threeStart);
  const threeSlice = occupiedOpen.slice(threeStart, claimAt);
  assert.notEqual(twoStart, -1);
  assert.notEqual(threeStart, -1);
  assert.match(twoSlice, /class="cover-line" data-later-rank="true" data-rank="2"/);
  assert.match(twoSlice, /class="dek"><a href="\/l\/lst_two">second\.example\/also/);
  assert.match(twoSlice, /class="slot">Also listed</);
  assert.match(twoSlice, /class="money"/);
  assert.doesNotMatch(twoSlice.slice(0, 800), /class="hed"/);
  assert.doesNotMatch(twoSlice.slice(0, 800), /data-paid-name/);
  assert.doesNotMatch(twoSlice.slice(0, 800), /data-cover-first/);
  assert.doesNotMatch(twoSlice.slice(0, 800), /Widgets for the next issue/);
  assert.match(threeSlice, /class="slot">Third slot</);
  assert.doesNotMatch(threeSlice.slice(0, 800), /class="hed"/);
  assert.doesNotMatch(threeSlice.slice(0, 800), /data-paid-name/);
  assert.doesNotMatch(
    occupiedOpen,
    /class="cover-line" data-later-rank[^>]*data-paid-name/,
  );

  assert.match(
    occupiedCss,
    /\.week-open-sold \.cover-line\[data-named-prize\]\[data-paid-name\] \.hed/,
  );
  assert.match(
    occupiedCss,
    /\.week-open-sold \.cover-line\[data-later-rank\] \.slot \{\s*margin: 0\.18rem 0 0;/,
  );
  assert.match(occupiedCss, /\.week-open-sold \.later-listing\[data-later-listing\]/);
  assert.match(occupiedCss, /\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{\s*font-size: 1\.55rem/);
  const prizeHed = occupiedCss.match(
    /\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{([^}]*)\}/,
  );
  const laterSlot = occupiedCss.match(
    /\.week-open-sold \.cover-line\[data-later-rank\] \.slot \{([^}]*)\}/,
  );
  const claimHop = occupiedCss.match(/\.week-open-sold \.claim-after-listing a\[data-claim-cover\] \{([^}]*)\}/);
  assert.ok(prizeHed);
  assert.ok(laterSlot);
  assert.ok(claimHop);
  const prizeSize = prizeHed[1].match(/font-size:\s*([\d.]+)rem/);
  const slotSize = laterSlot[1].match(/font-size:\s*([\d.]+)rem/);
  const claimSize = claimHop[1].match(/font-size:\s*([\d.]+)rem/);
  assert.ok(prizeSize);
  assert.ok(slotSize);
  assert.ok(claimSize);
  assert.ok(
    Number(slotSize[1]) < Number(prizeSize[1]),
    "later ranks must not wear Cover · #1 size",
  );
  assert.ok(
    Number(claimSize[1]) < Number(prizeSize[1]),
    "Claim the next cover must stay quieter than Cover · #1",
  );
  assert.match(laterSlot[1], /text-transform:\s*none/);
  assert.match(laterSlot[1], /color:\s*var\(--mute\)/);
  assert.match(laterSlot[1], /font-family:\s*var\(--serif\)/);

  assert.equal(emptyCss, `<style>${FOLIO_CSS}`);
  assert.ok(occupiedCss.includes(OCCUPIED_CSS));
  assert.ok(!emptyCss.includes(OCCUPIED_CSS));
  assert.match(emptyOpen, /class="week week-open-empty"/);
  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /data-later-write="true"/);
  assert.match(emptyOpen, /Then the cover URL/);
  assert.match(emptyOpen, /One-line cover pitch/);
  assert.doesNotMatch(emptyOpen, /data-paid-name="true"/);
  assert.doesNotMatch(emptyOpen, /data-later-listing="true"/);
  assert.doesNotMatch(emptyOpen, /One-line listing/);
  assert.doesNotMatch(emptyCss, /data-paid-name/);
  assert.doesNotMatch(emptyCss, /later-listing/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /Cover · #1/);
  assert.doesNotMatch(emptyOpen, /class="cover-line"/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);

  assert.equal(closedEmptyCss, `<style>${FOLIO_CSS}`);
  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.match(closedEmpty, /No paid listings on this board/);
  assert.doesNotMatch(closedEmpty, /data-paid-name="true"/);
  assert.doesNotMatch(closedEmptyCss, /data-paid-name/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);

  assert.equal(closedOccupiedCss, `<style>${FOLIO_CSS}`);
  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /Frozen winner/);
  assert.match(closedOccupied, /class="hed"><a href="\/l\/lst_won">Frozen winner</);
  assert.match(closedOccupied, /class="slot">Also frozen</);
  assert.match(closedOccupied, /class="money"/);
  assert.doesNotMatch(closedOccupied, /data-paid-name="true"/);
  assert.doesNotMatch(closedOccupiedCss, /data-paid-name/);
  assert.match(closedOccupied, /class="slot"/);
  assert.doesNotMatch(closedOccupied, /data-later-listing="true"/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);
});

test("closed occupied / keeps frozen Cover · #1 — live claim cannot steal the archive", async (t) => {
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
      {
        rank: 2,
        id: "lst_also",
        sponsorUrl: "https://also.example/listed",
        blurb: "Also frozen",
        bidUsd: 8,
        clicks: 0,
      },
    ],
  });
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const closedCss = closedOccupied.slice(
    closedOccupied.indexOf("<style>"),
    closedOccupied.indexOf("</style>"),
  );
  const emptyCss = emptyOpen.slice(emptyOpen.indexOf("<style>"), emptyOpen.indexOf("</style>"));
  const occupiedCss = occupiedOpen.slice(
    occupiedOpen.indexOf("<style>"),
    occupiedOpen.indexOf("</style>"),
  );
  const closedEmptyCss = closedEmpty.slice(
    closedEmpty.indexOf("<style>"),
    closedEmpty.indexOf("</style>"),
  );

  const coverAt = closedOccupied.indexOf('data-frozen-cover="true"');
  const paidAt = closedOccupied.indexOf('data-archive-name="true"');
  const hedAt = closedOccupied.indexOf('class="hed"><a href="/l/lst_won">Frozen winner<');
  const laterAt = closedOccupied.indexOf('data-rank="2"');
  const hopAt = closedOccupied.indexOf('data-open-cover="true"');
  const frozenAt = closedOccupied.indexOf('data-frozen-issue="true"');
  const claimAt = closedOccupied.indexOf('id="claim"');
  const checkoutAt = closedOccupied.indexOf('action="/listings"');
  const outbidAt = closedOccupied.indexOf(">Outbid<");
  assert.notEqual(coverAt, -1);
  assert.notEqual(paidAt, -1);
  assert.notEqual(hedAt, -1);
  assert.notEqual(laterAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(frozenAt, -1);
  assert.equal(claimAt, -1);
  assert.equal(checkoutAt, -1);
  assert.equal(outbidAt, -1);
  assert.ok(coverAt < laterAt);
  assert.ok(hedAt < laterAt);
  assert.ok(coverAt < hopAt);
  assert.ok(hedAt < hopAt);
  assert.ok(laterAt < hopAt);
  assert.ok(frozenAt < hopAt || hopAt < frozenAt);
  assert.ok(coverAt < frozenAt);
  assert.equal((closedOccupied.match(/data-frozen-cover="true"/g) ?? []).length, 1);
  assert.equal((closedOccupied.match(/data-archive-name="true"/g) ?? []).length, 1);
  assert.equal((closedOccupied.match(/data-open-cover="true"/g) ?? []).length, 1);
  assert.equal((closedOccupied.match(/data-frozen-board="true"/g) ?? []).length, 1);
  assert.equal((closedOccupied.match(/href="#claim"/g) ?? []).length, 0);
  assert.match(closedOccupied, /class="week week-closed-occupied"/);
  assert.match(closedOccupied, /class="cover-rack"[^>]*data-frozen-board="true"/);
  assert.match(
    closedOccupied,
    /class="cover-line cover" data-frozen-cover="true" data-archive-name="true" data-rank="1"/,
  );
  assert.match(closedOccupied, />Cover · #1</);
  assert.match(closedOccupied, /class="hed"><a href="\/l\/lst_won">Frozen winner</);
  assert.match(closedOccupied, /class="dek"><a href="\/l\/lst_won">won\.example\/cover/);
  assert.match(closedOccupied, /class="money"/);
  assert.match(closedOccupied, /class="bid">\$20</);
  const twoStart = closedOccupied.indexOf('data-rank="2"');
  const twoSlice = closedOccupied.slice(twoStart, frozenAt === -1 ? undefined : frozenAt);
  assert.match(twoSlice, /class="dek"><a href="\/l\/lst_also">also\.example\/listed/);
  assert.match(twoSlice, /class="slot">Also frozen</);
  assert.doesNotMatch(twoSlice.slice(0, 800), /class="hed"/);
  assert.doesNotMatch(twoSlice.slice(0, 800), /data-frozen-cover/);
  assert.doesNotMatch(twoSlice.slice(0, 800), /data-archive-name/);
  assert.match(closedOccupied, /This issue is frozen\. The cover is whoever paid the most before close/);
  assert.match(closedOccupied, /class="form-hint" data-frozen-issue="true"/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /The open cover is on the stand/);
  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /not the next issue/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover="true"/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);
  assert.doesNotMatch(closedOccupied, /Claim #1 for/);
  assert.doesNotMatch(closedOccupied, /class="outbid"/);
  assert.doesNotMatch(closedOccupied, /action="\/listings"/);
  assert.doesNotMatch(closedOccupied, /data-paid-name="true"/);
  assert.doesNotMatch(closedOccupied, /data-cover-first="true"/);
  assert.doesNotMatch(closedOccupied, /data-later-fact="true"/);
  assert.doesNotMatch(closedOccupied, /data-named-prize="true"/);
  assert.doesNotMatch(closedOccupied, /data-cover-prize-line="true"/);
  assert.doesNotMatch(closedOccupied, /data-prize-before-price="true"/);
  assert.doesNotMatch(closedOccupied, /data-later-rank="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /class="empty-issue"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-seven/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-seven/);
  assert.doesNotMatch(closedOccupied, /subscriber/i);
  assert.doesNotMatch(closedOccupied, /article list/i);

  assert.equal(closedCss, `<style>${FOLIO_CSS}`);
  assert.match(
    closedCss,
    /\.week-closed-occupied \.cover-line\.cover\[data-frozen-cover\]\[data-archive-name\]/,
  );
  assert.match(
    closedCss,
    /\.week-closed-occupied \.form-hint\[data-frozen-issue\] a\[data-open-cover\]/,
  );
  const frozenHed = closedCss.match(
    /\.week-closed-occupied \.cover-line\.cover\[data-frozen-cover\]\[data-archive-name\] \.hed \{([^}]*)\}/,
  );
  const laterSlot = closedCss.match(
    /\.week-closed-occupied \.cover-line:not\(\[data-frozen-cover\]\) \.slot \{([^}]*)\}/,
  );
  const liveHop = closedCss.match(
    /\.week-closed-occupied \.form-hint\[data-frozen-issue\] a\[data-open-cover\] \{([^}]*)\}/,
  );
  assert.ok(frozenHed);
  assert.ok(laterSlot);
  assert.ok(liveHop);
  const hedSize = frozenHed[1].match(/font-size:\s*([\d.]+)rem/);
  const slotSize = laterSlot[1].match(/font-size:\s*([\d.]+)rem/);
  assert.ok(hedSize);
  assert.ok(slotSize);
  assert.ok(
    Number(slotSize[1]) < Number(hedSize[1]),
    "later frozen ranks must stay quieter than Cover · #1",
  );
  assert.match(liveHop[1], /color:\s*var\(--mute\)/);
  assert.match(liveHop[1], /font-weight:\s*400/);
  assert.doesNotMatch(closedCss, /data-paid-name/);
  assert.doesNotMatch(closedCss, /data-cover-first/);
  assert.doesNotMatch(closedCss, /data-later-fact/);

  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, ISSUE, "closed");
  insertListing(app.db, {
    id: "lst_won",
    issueDate: ISSUE,
    sponsorUrl: "https://won.example/cover",
    blurb: "Frozen winner",
    bidUsd: 20,
    createdAt: "2026-08-01T00:00:00.000Z",
    clicks: 1,
  });
  const html = await app.inject({ method: "GET", url: `/issue/${ISSUE}` });
  assert.equal(html.statusCode, 200);
  assert.match(html.body, /data-frozen-cover="true"/);
  assert.match(html.body, /class="hed"><a href="\/l\/lst_won">Frozen winner</);
  assert.match(html.body, /data-open-cover="true"/);
  assert.doesNotMatch(html.body, /id="claim"/);
  assert.doesNotMatch(html.body, /Claim the next cover/);
  assert.doesNotMatch(html.body, /action="\/listings"/);
  assert.doesNotMatch(html.body, /class="outbid"/);
  const liveCheckout = await app.inject({
    method: "POST",
    url: "/listings",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html",
    },
    payload:
      "sponsorUrl=https%3A%2F%2Fsteal.example%2Fcover&blurb=Steal%20the%20archive&bidUsd=50",
  });
  assert.equal(liveCheckout.statusCode, 409);
  const afterSteal = await app.inject({ method: "GET", url: `/issue/${ISSUE}` });
  assert.match(afterSteal.body, /Frozen winner/);
  assert.doesNotMatch(afterSteal.body, /Steal the archive/);
  assert.doesNotMatch(afterSteal.body, /steal\.example/);

  assert.match(occupiedOpen, /data-cover-first="true"/);
  assert.match(occupiedOpen, /data-paid-name="true"/);
  assert.match(occupiedOpen, /data-claim-cover="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /id="claim"/);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.doesNotMatch(occupiedOpen, /data-frozen-cover="true"/);
  assert.doesNotMatch(occupiedOpen, /data-frozen-board="true"/);
  assert.doesNotMatch(occupiedOpen, /data-archive-name="true"/);
  assert.doesNotMatch(occupiedOpen, /data-frozen-issue="true"/);
  assert.ok(occupiedCss.includes(OCCUPIED_CSS));
  assert.doesNotMatch(OCCUPIED_CSS, /data-frozen-cover/);

  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /data-later-write="true"/);
  assert.doesNotMatch(emptyOpen, /data-frozen-cover="true"/);
  assert.doesNotMatch(emptyOpen, /data-frozen-board="true"/);
  assert.doesNotMatch(emptyOpen, /data-archive-name="true"/);
  assert.doesNotMatch(emptyOpen, /data-frozen-issue="true"/);

  assert.equal(closedEmptyCss, `<style>${FOLIO_CSS}`);
  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-frozen-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-frozen-board="true"/);
  assert.doesNotMatch(closedEmpty, /data-archive-name="true"/);
  assert.doesNotMatch(closedEmpty, /Cover · #1/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim the next cover/);
});

test("occupied open / keeps Cover · #1 the first click — Claim the next cover stays after the listing", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const occupiedCss = occupiedOpen.slice(
    occupiedOpen.indexOf("<style>"),
    occupiedOpen.indexOf("</style>"),
  );
  const emptyCss = emptyOpen.slice(emptyOpen.indexOf("<style>"), emptyOpen.indexOf("</style>"));
  const closedEmptyCss = closedEmpty.slice(
    closedEmpty.indexOf("<style>"),
    closedEmpty.indexOf("</style>"),
  );
  const closedOccupiedCss = closedOccupied.slice(
    closedOccupied.indexOf("<style>"),
    closedOccupied.indexOf("</style>"),
  );
  const mastheadEnd = occupiedOpen.indexOf("</header>");
  const flagSlice = occupiedOpen.slice(0, mastheadEnd);

  const coverKickerAt = occupiedOpen.indexOf(
    'class="rank" data-cover-prize-line="true">Cover · #1<',
  );
  const coverFirstAt = occupiedOpen.indexOf('data-cover-first="true"');
  const hedAt = occupiedOpen.indexOf(
    'class="hed"><a href="/l/lst_cover" data-cover-first="true">Widgets for the next issue<',
  );
  const rackAt = occupiedOpen.indexOf('data-read-cover="true"');
  const afterListingAt = occupiedOpen.indexOf('data-claim-after-listing="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(coverKickerAt, -1);
  assert.notEqual(coverFirstAt, -1);
  assert.notEqual(hedAt, -1);
  assert.notEqual(rackAt, -1);
  assert.notEqual(afterListingAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(mastheadEnd !== -1);
  assert.ok(coverKickerAt < hopAt);
  assert.ok(coverFirstAt < hopAt);
  assert.ok(hedAt < hopAt);
  assert.ok(rackAt < afterListingAt);
  assert.ok(afterListingAt < hopAt);
  assert.ok(hopAt < claimAt);
  assert.ok(coverFirstAt < claimAt);
  assert.ok(mastheadEnd < coverKickerAt);
  assert.ok(mastheadEnd < hopAt);
  assert.doesNotMatch(flagSlice, /data-claim-cover="true"/);
  assert.doesNotMatch(flagSlice, /href="#claim"/);
  assert.doesNotMatch(flagSlice, /Claim the next cover/);
  assert.equal((occupiedOpen.match(/data-claim-after-listing="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(occupiedOpen, /class="claim-after-listing" data-claim-after-listing="true"/);
  assert.match(
    occupiedOpen,
    /class="hed"><a href="\/l\/lst_cover" data-cover-first="true">Widgets for the next issue</,
  );
  assert.match(occupiedOpen, /class="rank" data-cover-prize-line="true">Cover · #1</);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  assert.match(occupiedOpen, /data-paid-name="true"/);
  assert.match(occupiedOpen, /data-named-prize="true"/);
  assert.match(occupiedOpen, /data-later-fact="true"/);
  assert.match(occupiedCss, /\.week-open-sold \.claim-after-listing\[data-claim-after-listing\]/);
  assert.match(
    occupiedCss,
    /\.week-open-sold \.claim-after-listing a\[data-claim-cover\] \{\s*display: inline;/,
  );
  const prizeHed = occupiedCss.match(
    /\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{([^}]*)\}/,
  );
  const claimHop = occupiedCss.match(
    /\.week-open-sold \.claim-after-listing a\[data-claim-cover\] \{([^}]*)\}/,
  );
  assert.ok(prizeHed);
  assert.ok(claimHop);
  const prizeSize = prizeHed[1].match(/font-size:\s*([\d.]+)rem/);
  const claimSize = claimHop[1].match(/font-size:\s*([\d.]+)rem/);
  assert.ok(prizeSize);
  assert.ok(claimSize);
  assert.ok(
    Number(claimSize[1]) < Number(prizeSize[1]),
    "Claim the next cover must stay quieter than Cover · #1",
  );
  assert.match(claimHop[1], /color:\s*var\(--mute\)/);
  assert.match(claimHop[1], /font-weight:\s*400/);
  assert.match(claimHop[1], /text-transform:\s*none/);
  assert.doesNotMatch(occupiedCss, /\.week-open-sold \.flag a\[data-claim-cover\]/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-read-seven/);
  assert.doesNotMatch(occupiedOpen, /data-read-after-claim-seven/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.equal(emptyCss, `<style>${FOLIO_CSS}`);
  assert.match(emptyOpen, /class="week week-open-empty"/);
  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /data-later-write="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-listing="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyCss, /data-claim-after-listing/);
  assert.doesNotMatch(emptyCss, /a\[data-claim-cover\]/);

  assert.equal(closedEmptyCss, `<style>${FOLIO_CSS}`);
  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-listing="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover="true"/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);

  assert.equal(closedOccupiedCss, `<style>${FOLIO_CSS}`);
  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /data-frozen-cover="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-listing="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);
});

test("occupied week window is rolling last-7-days — not Monday 00:00 UTC", () => {
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [],
  });

  const occupiedCss = occupiedOpen.slice(
    occupiedOpen.indexOf("<style>"),
    occupiedOpen.indexOf("</style>"),
  );
  const emptyCss = emptyOpen.slice(emptyOpen.indexOf("<style>"), emptyOpen.indexOf("</style>"));
  const closedOccupiedCss = closedOccupied.slice(
    closedOccupied.indexOf("<style>"),
    closedOccupied.indexOf("</style>"),
  );

  const coverFirstAt = occupiedOpen.indexOf('data-cover-first="true"');
  const windowCopyAt = occupiedOpen.indexOf(
    "Rolling last 7 days from paid placement. Not Monday 00:00 UTC.",
  );
  const afterListingAt = occupiedOpen.indexOf('data-claim-after-listing="true"');
  const hopAt = occupiedOpen.indexOf('data-claim-cover="true"');
  const claimAt = occupiedOpen.indexOf('id="claim"');
  assert.notEqual(coverFirstAt, -1);
  assert.notEqual(windowCopyAt, -1);
  assert.notEqual(afterListingAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(coverFirstAt < windowCopyAt);
  assert.ok(windowCopyAt < hopAt);
  assert.ok(afterListingAt < hopAt);
  assert.ok(hopAt < claimAt);
  assert.equal((occupiedOpen.match(/data-rolling-week="true"/g) ?? []).length, 2);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(occupiedOpen, /class="cover-rack"[^>]*data-rolling-week="true"/);
  assert.match(occupiedOpen, /class="week-window" data-rolling-week="true"/);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /data-cover-first="true"/);
  assert.match(occupiedOpen, /data-paid-name="true"/);
  assert.match(occupiedOpen, /data-later-fact="true"/);
  assert.match(occupiedOpen, /Claim the next cover/);
  assert.match(occupiedOpen, /Claim #1 for/);
  assert.match(occupiedOpen, /class="outbid"/);
  const occupiedMarkup = occupiedOpen.slice(occupiedOpen.indexOf("</style>"));
  assert.doesNotMatch(occupiedMarkup, /24h lock/);
  assert.doesNotMatch(occupiedOpen, /data-claim-after-read-seven/);
  assert.doesNotMatch(occupiedOpen, /subscriber/i);
  assert.doesNotMatch(occupiedOpen, /article list/i);

  assert.match(
    occupiedCss,
    /\.week-open-sold \.cover-rack\[data-rolling-week\] \+ \.week-window\[data-rolling-week\]/,
  );
  const windowRule = occupiedCss.match(
    /\.week-open-sold \.cover-rack\[data-rolling-week\] \+ \.week-window\[data-rolling-week\] \{([^}]*)\}/,
  );
  assert.ok(windowRule);
  const windowSize = windowRule[1].match(/font-size:\s*([\d.]+)rem/);
  const prizeHed = occupiedCss.match(
    /\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{([^}]*)\}/,
  );
  assert.ok(prizeHed);
  const prizeSize = prizeHed[1].match(/font-size:\s*([\d.]+)rem/);
  assert.ok(windowSize);
  assert.ok(prizeSize);
  assert.ok(
    Number(windowSize[1]) < Number(prizeSize[1]),
    "rolling week copy must stay quieter than Cover · #1",
  );
  assert.match(windowRule[1], /font-weight:\s*700/);
  assert.doesNotMatch(windowRule[1], /background:/);

  assert.equal(emptyCss, `<style>${FOLIO_CSS}`);
  assert.match(emptyOpen, /class="week week-open-empty"/);
  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyCss, /\[data-rolling-week\]/);
  assert.match(emptyCss, /\.week-open-empty \.empty-stand \.fair-window\[data-fair-window\]/);
  const emptyMarkup = emptyOpen.slice(emptyOpen.indexOf("</style>"));
  assert.doesNotMatch(emptyMarkup, /data-rolling-week=/);
  assert.doesNotMatch(emptyMarkup, /class="week-window"/);
  assert.match(emptyOpen, /data-fair-window="true"/);
  assert.match(emptyOpen, /Live rank is rolling last 7 days from paid placement/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-listing="true"/);
  assert.doesNotMatch(emptyCss, /\.week-open-sold \.cover-rack\[data-rolling-week\]/);

  const closedOccupiedMarkup = closedOccupied.slice(closedOccupied.indexOf("</style>"));
  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /data-frozen-cover="true"/);
  assert.doesNotMatch(closedOccupiedMarkup, /data-rolling-week=/);
  assert.doesNotMatch(closedOccupiedMarkup, /Rolling last 7 days/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupiedCss, /\.week-open-sold \.cover-rack\[data-rolling-week\]/);

  const closedEmptyMarkup = closedEmpty.slice(closedEmpty.indexOf("</style>"));
  assert.match(closedEmpty, /class="empty-issue"/);
  assert.doesNotMatch(closedEmptyMarkup, /data-rolling-week=/);
  assert.doesNotMatch(closedEmptyMarkup, /data-fair-window=/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
});

test("empty open stand names rolling last-7-days — not Monday issue close as live rank", () => {
  const emptyOpen = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [],
  });
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
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

  const emptyCss = emptyOpen.slice(emptyOpen.indexOf("<style>"), emptyOpen.indexOf("</style>"));
  const occupiedCss = occupiedOpen.slice(
    occupiedOpen.indexOf("<style>"),
    occupiedOpen.indexOf("</style>"),
  );
  const emptyMarkup = emptyOpen.slice(emptyOpen.indexOf("</style>"));
  const occupiedMarkup = occupiedOpen.slice(occupiedOpen.indexOf("</style>"));
  const closedEmptyMarkup = closedEmpty.slice(closedEmpty.indexOf("</style>"));
  const closedOccupiedMarkup = closedOccupied.slice(closedOccupied.indexOf("</style>"));

  const standAt = emptyOpen.indexOf('class="empty-stand"');
  const fairAt = emptyOpen.indexOf('data-fair-window="true"');
  const hopAt = emptyOpen.indexOf('data-claim-after-stand="true"');
  const claimAt = emptyOpen.indexOf('id="claim"');
  assert.notEqual(standAt, -1);
  assert.notEqual(fairAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(standAt < fairAt);
  assert.ok(fairAt < hopAt);
  assert.ok(hopAt < claimAt);
  assert.equal((emptyOpen.match(/data-fair-window="true"/g) ?? []).length, 1);
  assert.equal((emptyOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(emptyOpen, /data-empty-open-stand="true"/);
  assert.match(emptyOpen, /No cover sold/);
  assert.match(emptyOpen, /No paid listings on this board/);
  assert.match(emptyOpen, /This issue’s cover is still open/);
  assert.match(
    emptyOpen,
    /class="fair-window" data-fair-window="true">Live rank is rolling last 7 days from paid placement\. Not Monday 00:00 UTC\./,
  );
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /class="amount-field"/);
  assert.match(emptyOpen, /data-bid-step="-1"/);
  assert.match(emptyOpen, /class="outbid"/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.doesNotMatch(emptyMarkup, /data-rolling-week=/);
  assert.doesNotMatch(emptyMarkup, /class="week-window"/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-named-prize="true"/);
  assert.doesNotMatch(emptyOpen, /Cover · #1/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-listing="true"/);
  assert.doesNotMatch(emptyOpen, /24h lock/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-seven/);
  assert.doesNotMatch(emptyOpen, /subscriber/i);
  assert.doesNotMatch(emptyOpen, /article list/i);

  assert.equal(emptyCss, `<style>${FOLIO_CSS}`);
  assert.match(
    emptyCss,
    /\.week-open-empty \.empty-stand \.fair-window\[data-fair-window\]/,
  );
  const fairRule = emptyCss.match(
    /\.week-open-empty \.empty-stand \.fair-window\[data-fair-window\] \{([^}]*)\}/,
  );
  assert.ok(fairRule);
  const fairSize = fairRule[1].match(/font-size:\s*([\d.]+)rem/);
  const emptyHed = emptyCss.match(/\n\.hed \{([^}]*)\}/);
  assert.ok(fairSize);
  assert.ok(emptyHed);
  const hedSize = emptyHed[1].match(/font-size:\s*([\d.]+)rem/);
  assert.ok(hedSize);
  assert.ok(
    Number(fairSize[1]) < Number(hedSize[1]),
    "empty fair-window copy must stay quieter than No cover sold",
  );
  assert.match(fairRule[1], /color:\s*var\(--mute\)/);
  assert.doesNotMatch(fairRule[1], /background:/);
  assert.doesNotMatch(emptyCss, /\.week-open-sold \.cover-rack\[data-rolling-week\]/);

  const coverFirstAt = occupiedOpen.indexOf('data-cover-first="true"');
  const windowAt = occupiedOpen.indexOf('class="week-window" data-rolling-week="true"');
  const hopOccupiedAt = occupiedOpen.indexOf('data-claim-cover="true"');
  assert.notEqual(coverFirstAt, -1);
  assert.notEqual(windowAt, -1);
  assert.notEqual(hopOccupiedAt, -1);
  assert.ok(coverFirstAt < windowAt);
  assert.ok(windowAt < hopOccupiedAt);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /data-cover-first="true"/);
  assert.match(occupiedOpen, /data-rolling-week="true"/);
  assert.match(occupiedOpen, /class="week-window"/);
  assert.match(occupiedOpen, /Rolling last 7 days from paid placement\. Not Monday 00:00 UTC\./);
  assert.doesNotMatch(occupiedMarkup, /data-fair-window=/);
  assert.doesNotMatch(occupiedMarkup, /class="empty-stand"/);
  assert.match(occupiedCss, /\.week-open-sold \.fair-window/);
  assert.match(
    occupiedCss,
    /\.week-open-sold \.cover-rack\[data-rolling-week\] \+ \.week-window\[data-rolling-week\]/,
  );
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.doesNotMatch(closedEmptyMarkup, /data-fair-window=/);
  assert.doesNotMatch(closedEmptyMarkup, /data-rolling-week=/);
  assert.doesNotMatch(closedEmpty, /Live rank is rolling last 7 days/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);

  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /data-frozen-cover="true"/);
  assert.doesNotMatch(closedOccupiedMarkup, /data-fair-window=/);
  assert.doesNotMatch(closedOccupiedMarkup, /data-rolling-week=/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
});

test("empty open ear does not tax live rank as Weekly · UTC Monday", () => {
  const emptyOpen = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [],
  });
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
  const closedEmpty = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
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

  const emptyCss = emptyOpen.slice(emptyOpen.indexOf("<style>"), emptyOpen.indexOf("</style>"));
  const occupiedCss = occupiedOpen.slice(
    occupiedOpen.indexOf("<style>"),
    occupiedOpen.indexOf("</style>"),
  );
  const emptyMarkup = emptyOpen.slice(emptyOpen.indexOf("</style>"));
  const occupiedMarkup = occupiedOpen.slice(occupiedOpen.indexOf("</style>"));
  const closedEmptyMarkup = closedEmpty.slice(closedEmpty.indexOf("</style>"));
  const closedOccupiedMarkup = closedOccupied.slice(closedOccupied.indexOf("</style>"));

  const earAt = emptyOpen.indexOf('data-empty-ear="true"');
  const standAt = emptyOpen.indexOf('class="empty-stand"');
  const fairAt = emptyOpen.indexOf('data-fair-window="true"');
  const hopAt = emptyOpen.indexOf('data-claim-after-stand="true"');
  const claimAt = emptyOpen.indexOf('id="claim"');
  assert.notEqual(earAt, -1);
  assert.notEqual(standAt, -1);
  assert.notEqual(fairAt, -1);
  assert.notEqual(hopAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(earAt < standAt);
  assert.ok(standAt < fairAt);
  assert.ok(fairAt < hopAt);
  assert.ok(hopAt < claimAt);
  assert.equal((emptyOpen.match(/data-empty-ear="true"/g) ?? []).length, 1);
  assert.equal((emptyOpen.match(/data-fair-window="true"/g) ?? []).length, 1);
  assert.equal((emptyOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.match(
    emptyOpen,
    /class="ear ear-right" data-empty-ear="true">Last 7 days · UTC</,
  );
  assert.doesNotMatch(emptyMarkup, /Weekly · UTC/);
  assert.match(emptyOpen, /class="empty-stand"/);
  assert.match(emptyOpen, /data-read-stand="true"/);
  assert.match(
    emptyOpen,
    /class="fair-window" data-fair-window="true">Live rank is rolling last 7 days from paid placement\. Not Monday 00:00 UTC\./,
  );
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /class="amount-field"/);
  assert.match(emptyOpen, /data-bid-step="-1"/);
  assert.match(emptyOpen, /class="outbid"/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.doesNotMatch(emptyMarkup, /data-rolling-week=/);
  assert.doesNotMatch(emptyMarkup, /class="week-window"/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-named-prize="true"/);
  assert.doesNotMatch(emptyOpen, /Cover · #1/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-listing="true"/);
  assert.doesNotMatch(emptyOpen, /24h lock/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-seven/);
  assert.doesNotMatch(emptyOpen, /subscriber/i);
  assert.doesNotMatch(emptyOpen, /article list/i);

  assert.equal(emptyCss, `<style>${FOLIO_CSS}`);
  assert.match(
    emptyCss,
    /\.week-open-empty \.nameplate \.ear-right\[data-empty-ear\]/,
  );
  const earRule = emptyCss.match(
    /\.week-open-empty \.nameplate \.ear-right\[data-empty-ear\] \{([^}]*)\}/,
  );
  assert.ok(earRule);
  const earSize = earRule[1].match(/font-size:\s*([\d.]+)rem/);
  const nameplateHed = emptyCss.match(/\.nameplate h1 \{([^}]*)\}/);
  assert.ok(earSize);
  assert.ok(nameplateHed);
  assert.match(nameplateHed[1], /font-size:\s*clamp/);
  assert.ok(
    Number(earSize[1]) < 2.6,
    "empty ear must stay quieter than The Cover nameplate",
  );
  assert.match(earRule[1], /color:\s*var\(--mute\)/);
  assert.doesNotMatch(earRule[1], /background:/);
  assert.doesNotMatch(earRule[1], /href/);
  assert.match(emptyCss, /\.week-open-sold \[data-empty-ear\]/);
  assert.match(emptyCss, /\.week-closed-empty \[data-empty-ear\]/);
  assert.doesNotMatch(emptyCss, /\.week-open-sold \.cover-rack\[data-rolling-week\]/);

  const coverFirstAt = occupiedOpen.indexOf('data-cover-first="true"');
  const windowAt = occupiedOpen.indexOf('class="week-window" data-rolling-week="true"');
  const hopOccupiedAt = occupiedOpen.indexOf('data-claim-cover="true"');
  assert.notEqual(coverFirstAt, -1);
  assert.notEqual(windowAt, -1);
  assert.notEqual(hopOccupiedAt, -1);
  assert.ok(coverFirstAt < windowAt);
  assert.ok(windowAt < hopOccupiedAt);
  assert.match(occupiedOpen, /Cover · #1/);
  assert.match(occupiedOpen, /data-cover-first="true"/);
  assert.match(occupiedOpen, /class="ear ear-right">Weekly · UTC</);
  assert.doesNotMatch(occupiedMarkup, /data-empty-ear=/);
  assert.doesNotMatch(occupiedMarkup, /Last 7 days · UTC/);
  assert.match(occupiedOpen, /data-rolling-week="true"/);
  assert.match(occupiedOpen, /class="week-window"/);
  assert.doesNotMatch(occupiedMarkup, /data-fair-window=/);
  assert.doesNotMatch(occupiedMarkup, /class="empty-stand"/);
  assert.match(occupiedCss, /\.week-open-sold \[data-empty-ear\]/);
  assert.match(
    occupiedCss,
    /\.week-open-sold \.cover-rack\[data-rolling-week\] \+ \.week-window\[data-rolling-week\]/,
  );
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.match(closedEmpty, /class="ear ear-right">Weekly · UTC</);
  assert.doesNotMatch(closedEmptyMarkup, /data-empty-ear=/);
  assert.doesNotMatch(closedEmptyMarkup, /Last 7 days · UTC/);
  assert.doesNotMatch(closedEmptyMarkup, /data-fair-window=/);
  assert.doesNotMatch(closedEmptyMarkup, /data-rolling-week=/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);

  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /data-frozen-cover="true"/);
  assert.match(closedOccupied, /class="ear ear-right">Weekly · UTC</);
  assert.doesNotMatch(closedOccupiedMarkup, /data-empty-ear=/);
  assert.doesNotMatch(closedOccupiedMarkup, /data-fair-window=/);
  assert.doesNotMatch(closedOccupiedMarkup, /data-rolling-week=/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
});


