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
  assert.doesNotMatch(body, /data-open-cover="true"/);
  assert.doesNotMatch(body, /data-claim-cover/);
  assert.doesNotMatch(body, /data-sold-cover/);
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
  assert.doesNotMatch(html.body, /data-claim-cover/);
  assert.doesNotMatch(html.body, /data-cover-prize="true"/);
  assert.doesNotMatch(html.body, /data-read-stand/);
  assert.doesNotMatch(html.body, /data-claim-after-stand/);
  assert.doesNotMatch(html.body, /data-sold-cover/);
  assert.doesNotMatch(html.body, /class="empty-stand"/);
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
  assert.ok(html.body.indexOf('data-claim-cover="true"') < html.body.indexOf('data-read-cover="true"'));
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
  assert.doesNotMatch(openEmpty, /data-claim-cover/);
  assert.doesNotMatch(openEmpty, /data-sold-cover/);
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
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
  assert.doesNotMatch(closedEmpty, /class="outbid"/);
  assert.doesNotMatch(closedEmpty, /data-cover-prize="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
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
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);

  const closedHint = closedOccupied.indexOf("This issue is frozen");
  const closedCover = closedOccupied.indexOf('class="cover-line"');
  assert.notEqual(closedHint, -1);
  assert.notEqual(closedCover, -1);
  assert.ok(closedHint < closedCover);
  assert.doesNotMatch(closedOccupied, /class="cover-line cover"/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
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
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.match(emptyOpen, /data-claim-after-stand="true"/);
  assert.match(emptyOpen, /href="#claim"/);

  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-stand/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
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
  assert.ok(occupiedOpen.indexOf('data-claim-cover="true"') < occupiedOpen.indexOf('data-read-cover="true"'));
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
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-stand/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.doesNotMatch(closedEmpty, /data-cover-prize-line="true"/);
  assert.doesNotMatch(closedEmpty, /Cover · #1/);
  assert.doesNotMatch(closedEmpty, /data-claim-after-stand/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
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
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
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
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /data-cover-prize-line="true"/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
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
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);
  assert.doesNotMatch(emptyOpen, /data-cover-prize-line="true"/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
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
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
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
  assert.ok(hopAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < rackAt);
  assert.ok(afterSoldAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < rackAt);
  assert.ok(afterSoldAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < rackAt);
  assert.ok(afterSoldAt < rackAt);
  assert.ok(afterReadAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < rackAt);
  assert.ok(afterSoldAt < rackAt);
  assert.ok(afterReadAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < rackAt);
  assert.ok(afterSoldAt < rackAt);
  assert.ok(afterReadAt < rackAt);
  assert.ok(afterReadTwoAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < rackAt);
  assert.ok(afterSoldAt < rackAt);
  assert.ok(afterReadAt < rackAt);
  assert.ok(afterReadTwoAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < rackAt);
  assert.ok(afterSoldAt < rackAt);
  assert.ok(afterReadAt < rackAt);
  assert.ok(afterReadTwoAt < rackAt);
  assert.ok(afterReadThreeAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < rackAt);
  assert.ok(afterSoldAt < rackAt);
  assert.ok(afterReadAt < rackAt);
  assert.ok(afterReadTwoAt < rackAt);
  assert.ok(afterReadThreeAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(emptyOpen, /Claim the next cover/);
  assert.doesNotMatch(emptyOpen, /data-read-cover/);

  assert.match(closedOccupied, /This issue is closed/);
  assert.match(closedOccupied, /data-open-cover="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-after-read-three="true"/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-read-cover/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);

  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < rackAt);
  assert.ok(afterSoldAt < rackAt);
  assert.ok(afterReadAt < rackAt);
  assert.ok(afterReadTwoAt < rackAt);
  assert.ok(afterReadThreeAt < rackAt);
  assert.ok(afterReadFourAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
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
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
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
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < rackAt);
  assert.ok(afterSoldAt < rackAt);
  assert.ok(afterReadAt < rackAt);
  assert.ok(afterReadTwoAt < rackAt);
  assert.ok(afterReadThreeAt < rackAt);
  assert.ok(afterReadFourAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
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
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
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
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < rackAt);
  assert.ok(afterSoldAt < rackAt);
  assert.ok(afterReadAt < rackAt);
  assert.ok(afterReadTwoAt < rackAt);
  assert.ok(afterReadThreeAt < rackAt);
  assert.ok(afterReadFourAt < rackAt);
  assert.ok(afterReadFiveAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
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
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
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
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < rackAt);
  assert.ok(afterSoldAt < rackAt);
  assert.ok(afterReadAt < rackAt);
  assert.ok(afterReadTwoAt < rackAt);
  assert.ok(afterReadThreeAt < rackAt);
  assert.ok(afterReadFourAt < rackAt);
  assert.ok(afterReadFiveAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-six="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
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
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-six="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
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
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-six="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < rackAt);
  assert.ok(afterSoldAt < rackAt);
  assert.ok(afterReadAt < rackAt);
  assert.ok(afterReadTwoAt < rackAt);
  assert.ok(afterReadThreeAt < rackAt);
  assert.ok(afterReadFourAt < rackAt);
  assert.ok(afterReadFiveAt < rackAt);
  assert.ok(afterReadSixAt < rackAt);
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
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(emptyOpen, /data-read-after-claim-six="true"/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
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
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedOccupied, /data-read-after-claim-six="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
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
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-four="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-five="true"/);
  assert.doesNotMatch(closedEmpty, /data-read-after-claim-six="true"/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.ok(hopAt < occupiedOpen.indexOf('data-read-cover="true"'));
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
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);

  assert.doesNotMatch(closedOccupied, /data-prize-before-price="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-cover-prize-line="true"/);
  assert.ok(closedOccupied.indexOf("Cover · #1") < closedOccupied.indexOf('class="bid"'));
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
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
  assert.match(occupiedOpen, /\.week-open-sold \.cover-line\[data-later-rank\] \.hed \{\s*font-size: 0\.98rem/);
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
  assert.ok(hopAt < occupiedOpen.indexOf('data-read-cover="true"'));
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
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);

  assert.doesNotMatch(closedOccupied, /data-prize-before-price="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.doesNotMatch(closedOccupied, /data-later-rank="true"/);
  assert.match(closedOccupied, /data-rank="2"/);
  assert.match(closedOccupied, /Also frozen/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
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
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /Claim the next cover/);
  assert.doesNotMatch(closedEmpty, /data-claim-cover/);
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
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /This issue’s cover is sold/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
  assert.doesNotMatch(closedOccupied, /data-cover-prize="true"/);
  assert.doesNotMatch(closedOccupied, /data-cover-prize-line="true"/);
  assert.doesNotMatch(closedOccupied, /data-prize-before-price="true"/);
  assert.doesNotMatch(closedOccupied, /data-later-rank="true"/);
  assert.doesNotMatch(closedOccupied, /class="cover-line cover"/);
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
  const hedAt = occupiedOpen.indexOf('class="hed">Widgets for the next issue<');
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
  assert.match(occupiedOpen, /class="hed">Widgets for the next issue</);
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
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
  assert.doesNotMatch(emptyOpen, /class="empty-issue"/);

  assert.doesNotMatch(closedOccupied, /data-named-prize="true"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /Frozen winner/);
  assert.match(closedOccupied, /won\.example\/cover/);
  assert.doesNotMatch(closedOccupied, /data-cover-prize-line="true"/);
  assert.doesNotMatch(closedOccupied, /data-prize-before-price="true"/);
  assert.doesNotMatch(closedOccupied, /data-later-rank="true"/);
  assert.doesNotMatch(closedOccupied, /data-claim-cover/);
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
  assert.match(emptyOpen, /No cover sold/);
  assert.match(emptyOpen, /No paid listings on this board/);
  assert.match(emptyOpen, /class="claim-note" data-empty-issue="true" data-cover-prize="true"/);
  assert.match(emptyOpen, /\$5 takes #1 — this issue’s cover/);
  assert.match(emptyOpen, /Claim #1 for/);
  assert.match(emptyOpen, /class="outbid"/);
  assert.match(emptyOpen, /Claim this issue’s cover/);
  assert.match(emptyOpen, /\.week-open-sold \.flag \[data-read-after-claim-sold\]/);
  assert.match(emptyOpen, /\.week-open-sold \.cover-line\[data-named-prize\] \.hed/);
  assert.match(emptyOpen, /\.week-open-empty \.cover-rack/);
  assert.match(emptyOpen, /\.week-open-sold \.empty-stand/);
  assert.match(emptyOpen, /\.week-closed-empty \.empty-stand/);
  assert.doesNotMatch(emptyOpen, /class="week week-open-sold"/);
  assert.doesNotMatch(emptyOpen, /data-sold-cover/);
  assert.doesNotMatch(emptyOpen, /This issue’s cover is sold/);
  assert.doesNotMatch(emptyOpen, /data-claim-cover/);
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
  assert.match(occupiedOpen, /class="hed">Widgets for the next issue</);
  assert.equal((occupiedOpen.match(/href="#claim"/g) ?? []).length, 1);
  assert.doesNotMatch(occupiedOpen, /data-empty-open-stand="true"/);
  assert.doesNotMatch(occupiedOpen, /class="week week-open-empty"/);
  assert.doesNotMatch(occupiedOpen, /class="empty-stand"/);
  assert.doesNotMatch(occupiedOpen, /goes to whoever pays the most/);

  assert.match(closedEmpty, /class="week week-closed-empty"/);
  assert.match(closedEmpty, /class="empty-issue"/);
  assert.match(closedEmpty, /data-closed-empty-issue="true"/);
  assert.match(closedEmpty, /data-open-cover="true"/);
  assert.match(closedEmpty, /No paid listings on this board/);
  assert.doesNotMatch(closedEmpty, /data-empty-open-stand="true"/);
  assert.doesNotMatch(closedEmpty, /class="empty-stand"/);
  assert.doesNotMatch(closedEmpty, /data-sold-cover/);
  assert.doesNotMatch(closedEmpty, /This issue’s cover is sold/);
  assert.doesNotMatch(closedEmpty, /Claim the next cover/);
  assert.doesNotMatch(closedEmpty, /data-named-prize="true"/);
  assert.doesNotMatch(closedEmpty, /id="claim"/);
  assert.doesNotMatch(closedEmpty, /Claim #1 for/);

  assert.match(closedOccupied, /class="week week-closed-occupied"/);
  assert.match(closedOccupied, /Cover · #1/);
  assert.match(closedOccupied, /Frozen winner/);
  assert.doesNotMatch(closedOccupied, /data-empty-open-stand="true"/);
  assert.doesNotMatch(closedOccupied, /data-sold-cover/);
  assert.doesNotMatch(closedOccupied, /Claim the next cover/);
  assert.doesNotMatch(closedOccupied, /data-named-prize="true"/);
  assert.doesNotMatch(closedOccupied, /id="claim"/);
});

