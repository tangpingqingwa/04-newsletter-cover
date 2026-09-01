import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppDb, Listing } from "../src/db.js";
import { renderBoardHtml } from "../src/http/routes/board.js";
import {
  renderAboutHtml,
  renderCheckoutCompleteHtml,
  renderRulesHtml,
} from "../src/http/routes/pages.js";
import { buildApp } from "../src/server.js";
import { FOLIO_CSS, ISSUE_CSS, spokenIssueDate } from "../src/views/skin.js";

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

function formMarkup(html: string): string {
  const start = html.indexOf('<form id="bid-form"');
  const end = html.indexOf("</form>", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return html.slice(start, end + "</form>".length);
}

function bodyMarkup(html: string): string {
  const styleEnd = html.indexOf("</style>");
  assert.notEqual(styleEnd, -1);
  return html.slice(styleEnd + "</style>".length);
}

const EXACT_REFERENCE_ROWS = [
  ["lst_visual_one", "The Morning Ledger — A calm briefing on money, work, and the week ahead", 17_000, "https://morning-ledger.example/"],
  ["lst_visual_two", "Field Notes Weekly — Practical field notes for people building in public", 16_000, "https://field-notes-weekly.example/"],
  ["lst_visual_three", "The Signal Sheet — Policy, platforms, and power in plain English", 14_028, "https://signal-sheet.example/"],
  ["lst_visual_four", "Northstar Dispatch — Product lessons from people shipping the work", 13_005, "https://northstar-dispatch.example/"],
  ["lst_visual_five", "Common Thread — Climate progress reported without the theater", 12_080, "https://common-thread.example/"],
  ["lst_visual_six", "The Local Index — One useful local story before your first meeting", 11_004, "https://local-index.example/"],
] as const;

test("spoken issue date stays publication copy", () => {
  assert.equal(spokenIssueDate("2026-08-24"), "Monday, August 24, 2026");
  assert.equal(spokenIssueDate("not-a-date"), "not-a-date");
});

test("ordinary renderer never short-circuits into the shared reference fixture and no fake newsletter metrics", () => {
  const previousMode = process.env.WAFFO_MODE;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    process.env.WAFFO_MODE = "fixture";
    process.env.NODE_ENV = "test";
    const html = renderBoardHtml({
      issueDate: "2026-08-31",
      status: "open",
      listings: EXACT_REFERENCE_ROWS.map(([id, blurb, bidUsd, sponsorUrl], index) => ({
        rank: index + 1,
        id,
        sponsorUrl,
        blurb,
        bidUsd,
        clicks: [148, 92, 64, 48, 27, 12][index] ?? 0,
        createdAt: `2026-08-28T0${7 + index}:00:00.000Z`,
      })),
    });
    assert.match(html, /class="sheet"/);
    assert.match(html, /class="nameplate"/);
    assert.match(html, /data-folio-section="cover"/);
    assert.doesNotMatch(html, /outbid-reference-root|data-reference-fixture|href="\/r\//);
    assert.doesNotMatch(html, /data-today-ranking|data-latest-activity|category-picker|118 online|1,404,927/);
  } finally {
    if (previousMode === undefined) delete process.env.WAFFO_MODE;
    else process.env.WAFFO_MODE = previousMode;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("masthead navigation keeps the three exact destinations and the three-part folio nameplate", () => {
  const html = renderBoardHtml({ issueDate: ISSUE, status: "open", listings: [] });
  const sheetAt = html.indexOf('<div class="sheet">');
  const headerAt = html.indexOf('<header class="site-header"');
  assert.ok(sheetAt < headerAt, "the masthead belongs to the printed sheet");
  assert.match(html, /<a class="mark" href="\/"[^>]*>The Cover<\/a>/);
  assert.match(html, /<a href="\/" aria-current="page">Leaderboard<\/a>/);
  assert.match(html, /<a href="\/about">About<\/a>/);
  assert.match(html, /<a href="\/rules">Rules<\/a>/);
  assert.match(html, /class="folio"[\s\S]*data-issue-date="2099-01-05"[\s\S]*data-issue-status="open"/);
  assert.match(html, />OPEN</);
  assert.match(html, /class="nameplate"[\s\S]*Vol\. I · One prize[\s\S]*<h1>The Cover<\/h1>[\s\S]*(?:Last 7 days|Weekly) · UTC/);
  assert.match(FOLIO_CSS, /--stone: #1c1d21/);
  assert.match(FOLIO_CSS, /width: min\(calc\(100% - 1\.25rem\), 48rem\)/);
  assert.match(FOLIO_CSS, /border-bottom: 4px double var\(--rule\)/);
});

test("all public folio pages render one exact maker contact footer", () => {
  const pages = [
    renderBoardHtml({ issueDate: ISSUE, status: "open", listings: [] }),
    renderAboutHtml(),
    renderRulesHtml(),
    renderCheckoutCompleteHtml("malformed", null),
  ];
  const expected = '<footer class="maker-contact" data-maker-contact>Built by <a href="mailto:tangpingqingwa@gmail.com">tangpingqingwa@gmail.com</a></footer>';

  for (const html of pages) {
    const footers = html.match(/<footer class="maker-contact" data-maker-contact>[\s\S]*?<\/footer>/g) ?? [];
    assert.equal(footers.length, 1);
    assert.equal(footers[0], expected);
    assert.equal((html.match(/data-maker-contact/g) ?? []).length, 1);
    assert.equal((html.match(/mailto:tangpingqingwa@gmail\.com/g) ?? []).length, 1);
    assert.equal((html.match(/tangpingqingwa@gmail\.com/g) ?? []).length, 2);
  }

  assert.match(FOLIO_CSS, /\.sheet \.maker-contact \{[\s\S]*border-top: 1px solid var\(--hair\)/);
  assert.match(FOLIO_CSS, /\.sheet \.maker-contact a:hover,[\s\S]*a:focus-visible \{[\s\S]*color: var\(--ink\)/);
  assert.match(FOLIO_CSS, /\.sheet \.maker-contact a \{[\s\S]*overflow-wrap: anywhere/);
});

test("open empty cover is a print masthead with an honest cover stand and one Claim Desk", () => {
  const html = renderBoardHtml({ issueDate: ISSUE, status: "open", listings: [] });
  const form = formMarkup(html);
  assert.match(html, /class="empty-stand"[^>]*id="cover"/);
  assert.match(html, /data-read-stand="true"/);
  assert.match(html, /No cover sold/);
  assert.match(html, /Live rank is rolling last 7 days from paid placement/);
  assert.match(html, /data-fair-window="true"/);
  assert.match(html, /Claim #1 for/);
  assert.match(html, /\.sheet \.amount-field \{[\s\S]*text-decoration: none/);
  assert.match(html, /data-bid-step="-1"/);
  assert.match(html, /data-bid-step="1"/);
  assert.match(html, />−</);
  assert.match(html, />\+</);
  assert.match(form, /name="sponsorUrl"/);
  assert.match(form, /name="blurb"/);
  assert.match(form, />Outbid<\/button>/);
  assert.ok(form.indexOf('name="sponsorUrl"') < form.indexOf('name="blurb"'));
  assert.ok(form.indexOf('name="blurb"') < form.indexOf(">Outbid</button>"));
  assert.equal((form.match(/class="outbid"/g) ?? []).length, 1);
  assert.equal((html.match(/data-folio-index="true"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-rank="1"|Cover · #1|data-sold-cover="true"/);
  assert.doesNotMatch(html, /data-today-ranking|data-latest-activity|category-picker|\/category\//);
  assert.doesNotMatch(bodyMarkup(html), /Claim rank/);
});

test("occupied open cover leads with one Cover prize, later paid ranks stay quiet, and a claim follows", () => {
  const html = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [
      { rank: 1, id: "lst_cover", sponsorUrl: "https://sponsor.example/pitch", blurb: "Widgets for the next issue", bidUsd: 12, clicks: 3, createdAt: "2026-08-01T00:00:00.000Z" },
      { rank: 2, id: "lst_two", sponsorUrl: "https://two.example/", blurb: "Second pitch", bidUsd: 9, clicks: 1, createdAt: "2026-08-02T00:00:00.000Z" },
      { rank: 3, id: "lst_three", sponsorUrl: "https://three.example/", blurb: "Third pitch", bidUsd: 7, clicks: 0, createdAt: "2026-08-03T00:00:00.000Z" },
      { rank: 4, id: "lst_four", sponsorUrl: "https://four.example/", blurb: "Fourth pitch", bidUsd: 6, clicks: 4, createdAt: "2026-08-04T00:00:00.000Z" },
    ],
  });
  const coverAt = html.indexOf('data-folio-section="cover"');
  const claimAt = html.indexOf('data-claim-cover="true"');
  assert.notEqual(coverAt, -1);
  assert.notEqual(claimAt, -1);
  assert.ok(coverAt < claimAt);
  assert.equal((html.match(/data-cover-prize-line="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-paid-name="true"/g) ?? []).length, 1);
  assert.match(html, /data-cover-first="true"/);
  assert.match(html, /data-folio-section="stack"[\s\S]*data-later-board-rows="true"/);
  assert.match(html, /data-folio-section="ledger"[\s\S]*Bid ledger/);
  assert.match(html, /Widgets for the next issue/);
  assert.match(html, /sponsor\.example\/pitch/);
  assert.match(html, /\$12/);
  assert.match(html, /3 clicks/);
  assert.match(html, /data-cover-time="true"/);
  assert.match(html, /Claim the next cover/);
  assert.match(html, /You pay only the difference/);
  assert.equal((html.match(/data-claim-cover="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-claim-after-listing="true"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-today-ranking|data-latest-activity|category-picker|\/category\/|118 online|visitor/i);
  assert.match(ISSUE_CSS, /border-radius: 0/);
});

test("empty archive is a frozen empty folio with no invented cover", () => {
  const html = renderBoardHtml({ issueDate: ISSUE, status: "closed", listings: [] });
  assert.match(html, /data-issue-status="closed"/);
  assert.match(html, />CLOSED</);
  assert.match(html, /class="empty-issue"[^>]*id="archive"/);
  assert.match(html, /data-empty-flag="true"/);
  assert.match(html, /No last-7-days cover/);
  assert.match(html, /data-empty-freeze="true"/);
  assert.match(html, /data-open-cover="true"/);
  assert.doesNotMatch(html, /id="claim"|class="outbid"|name="sponsorUrl"|data-rank="1"/);
  assert.doesNotMatch(html, /data-read-cover|data-claim-cover|data-today-ranking|data-latest-activity/);
});

test("live and frozen mastheads keep rolling-window chrome scoped to their state", () => {
  const empty = renderBoardHtml({ issueDate: ISSUE, status: "open", listings: [] });
  const occupied = renderBoardHtml({
    issueDate: ISSUE,
    status: "open",
    listings: [{ rank: 1, id: "lst_live", sponsorUrl: "https://live.example/", blurb: "Live", bidUsd: 8, clicks: 0 }],
  });
  const frozen = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [{ rank: 1, id: "lst_frozen", sponsorUrl: "https://frozen.example/", blurb: "Frozen", bidUsd: 8, clicks: 0 }],
  });
  const emptyBody = bodyMarkup(empty);
  const occupiedBody = bodyMarkup(occupied);
  const frozenBody = bodyMarkup(frozen);
  assert.match(emptyBody, /data-empty-ear="true"/);
  assert.match(emptyBody, /data-fair-window="true"/);
  assert.doesNotMatch(emptyBody, /data-occupied-ear|data-frozen-ear|data-rolling-week/);
  assert.match(occupiedBody, /data-occupied-ear="true"/);
  assert.match(occupiedBody, /data-rolling-week="true"/);
  assert.doesNotMatch(occupiedBody, /data-empty-ear|data-frozen-ear|data-fair-window/);
  assert.match(frozenBody, /data-frozen-ear="true"/);
  assert.match(frozenBody, /data-frozen-board="true"/);
  assert.match(frozenBody, /data-frozen-cover="true"/);
  assert.match(frozenBody, /data-frozen-flag="true"/);
  assert.match(frozenBody, /data-frozen-hint="true"/);
  assert.doesNotMatch(frozenBody, /data-occupied-ear|data-rolling-week|data-sold-cover/);
});

test("closed occupied archive is frozen and keeps the Cover read-only", () => {
  const html = renderBoardHtml({
    issueDate: ISSUE,
    status: "closed",
    listings: [{ rank: 1, id: "lst_archive", sponsorUrl: "https://archive.example/", blurb: "Archive", bidUsd: 11, clicks: 2, createdAt: "2026-08-01T00:00:00.000Z" }],
  });
  assert.match(html, /data-frozen-board="true"/);
  assert.match(html, /data-frozen-cover="true"/);
  assert.match(html, /data-frozen-flag="true"/);
  assert.match(html, /data-frozen-hint="true"/);
  assert.match(html, /data-folio-section="archive"/);
  assert.match(html, /archive\.example/);
  assert.match(html, /Archive/);
  assert.match(html, /\$11/);
  assert.match(html, /2 clicks/);
  assert.doesNotMatch(html, /id="claim"|class="outbid"|name="sponsorUrl"|data-read-cover|data-claim-cover/);
});

test("claim form gives identity fields names and a visible bid focus cue", () => {
  const html = renderBoardHtml({ issueDate: ISSUE, status: "open", listings: [] });
  const form = formMarkup(html);
  assert.match(form, /<label class="sr-only" for="sponsor-url">Sponsor URL<\/label>/);
  assert.match(form, /<input id="sponsor-url" name="sponsorUrl"/);
  assert.match(form, /<label class="sr-only" for="cover-pitch">One-line cover pitch<\/label>/);
  assert.match(form, /<input id="cover-pitch" class="blurb-field" name="blurb"/);
  assert.ok(form.indexOf('for="sponsor-url"') < form.indexOf('id="sponsor-url"'));
  assert.ok(form.indexOf('for="cover-pitch"') < form.indexOf('id="cover-pitch"'));
  assert.match(html, /\.amount-field input:focus-visible\s*\{/);
  assert.match(html, /outline: 2px solid var\(--flag\)/);
});

test("form POST /listings starts one fixture checkout and does not select Polar", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, ISSUE, "open");

  const response = await app.inject({
    method: "POST",
    url: "/listings",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" },
    payload: "sponsorUrl=https%3A%2F%2Fform.example%2Fcover&blurb=Cover%20pitch&bidUsd=5",
  });
  assert.equal(response.statusCode, 303);
  assert.match(response.headers.location ?? "", /checkoutId=fix_/);
  assert.doesNotMatch(response.headers.location ?? "", /api\.waffo|polar/i);
});

test("public sponsor link redirects and increments only clicks", async (t) => {
  const app = await buildApp({ now: new Date("2026-08-06T12:00:00.000Z") });
  t.after(() => app.close());
  insertIssue(app.db, ISSUE, "open");
  insertListing(app.db, {
    id: "lst_click",
    issueDate: ISSUE,
    sponsorUrl: "https://sponsor.example/pitch",
    blurb: "Click the sponsor",
    bidUsd: 12,
    createdAt: "2026-08-01T00:00:00.000Z",
  });

  const board = await app.inject({ method: "GET", url: "/" });
  assert.match(board.body, /href="\/l\/lst_click"/);
  const first = await app.inject({ method: "GET", url: "/l/lst_click?utm_campaign=reader" });
  assert.equal(first.statusCode, 302);
  assert.equal(first.headers.location, "https://sponsor.example/pitch");
  const clickRow = app.db.prepare("SELECT clicks FROM listings WHERE id = ?").get("lst_click") as { clicks: number } | undefined;
  assert.equal(clickRow?.clicks, 1);
  assert.match(board.body, /12/);
  assert.match(board.body, /0 clicks/);
});

test("print CSS preserves the owned composition at desktop and mobile anchors", () => {
  assert.match(FOLIO_CSS, /Newsletter identity: the board is a printed folio/);
  assert.match(FOLIO_CSS, /background:[\s\S]*var\(--stone\)/);
  assert.match(FOLIO_CSS, /\.sheet \{[\s\S]*48rem[\s\S]*box-shadow/);
  assert.match(FOLIO_CSS, /\.sheet \.nameplate \{[\s\S]*grid-template-columns: 1fr auto 1fr/);
  assert.match(FOLIO_CSS, /\.sheet \.cover-line,[\s\S]*border-radius: 0/);
  assert.match(FOLIO_CSS, /\.sheet \.outbid \{[\s\S]*text-transform: uppercase/);
  assert.match(FOLIO_CSS, /@media \(max-width: 719px\)/);
  assert.match(FOLIO_CSS, /grid-template-columns: 2\.5rem minmax\(0, 1fr\)/);
  assert.match(FOLIO_CSS, /height: 2\.4rem/);
  assert.match(FOLIO_CSS, /#bid-form \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(ISSUE_CSS, /position: static;[\s\S]*inset: auto;[\s\S]*grid-template-columns: minmax\(0, 1fr\) max-content/);
  assert.match(ISSUE_CSS, /\.card-action \{[\s\S]*grid-column: 1 \/ -1/);
  assert.match(ISSUE_CSS, /\.card-time \{[\s\S]*grid-column: 2[\s\S]*white-space: nowrap/);
  assert.match(ISSUE_CSS, /\.cover-line \.money[\s\S]*grid-row: 2[\s\S]*min-width: 0/);
});
