import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import test from "node:test";
import { seedVisualFixture } from "../scripts/visual-fixture.js";
import {
  OUTBID_REFERENCE_FIXTURE_ROWS,
  OUTBID_REFERENCE_ISSUE,
  adaptReferenceDocument,
  isOutbidReferenceFixture,
  renderNewsletterReferencePage,
  type NewsletterReferenceBoard,
} from "../src/views/outbid-reference-page.js";
import { renderBoardPage } from "../src/views/outbid-reference-board.js";
import { renderBoardHtml } from "../src/views/skin.js";

function referenceBoard(): NewsletterReferenceBoard {
  return {
    issueDate: OUTBID_REFERENCE_ISSUE,
    status: "open",
    listings: OUTBID_REFERENCE_FIXTURE_ROWS.map(
      ([id, blurb, bidUsd, sponsorUrl], index) => ({
        rank: index + 1,
        id,
        sponsorUrl,
        blurb,
        bidUsd,
        clicks: [148, 92, 64, 48, 27, 12][index] ?? 0,
        createdAt: `2026-08-28T0${7 + index}:00:00.000Z`,
      }),
    ),
  };
}

test("exact six-row fixture is isolated to local Waffo fixture mode", () => {
  const previousMode = process.env.WAFFO_MODE;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    process.env.WAFFO_MODE = "fixture";
    process.env.NODE_ENV = "test";
    const board = referenceBoard();
    assert.equal(isOutbidReferenceFixture(board), true);
    assert.equal(
      isOutbidReferenceFixture({
        ...board,
        listings: board.listings.map((row, index) =>
          index === 0 ? { ...row, bidUsd: row.bidUsd - 1 } : row,
        ),
      }),
      false,
    );
    process.env.NODE_ENV = "production";
    assert.equal(isOutbidReferenceFixture(board), false);
  } finally {
    if (previousMode === undefined) delete process.env.WAFFO_MODE;
    else process.env.WAFFO_MODE = previousMode;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("ordinary board rendering quarantines the exact reference-shaped fixture", () => {
  const previousMode = process.env.WAFFO_MODE;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    process.env.WAFFO_MODE = "fixture";
    process.env.NODE_ENV = "test";
    const html = renderBoardHtml(referenceBoard());
    const body = html.slice(html.indexOf("</style>") + "</style>".length);
    assert.match(body, /class="sheet"/);
    assert.match(body, /data-folio-section="cover"/);
    assert.doesNotMatch(body, /outbid-reference-root|data-reference-fixture|href="\/r\//);
    assert.doesNotMatch(body, /data-today-ranking|data-latest-activity|category-picker|118 online|1,404,927/);
  } finally {
    if (previousMode === undefined) delete process.env.WAFFO_MODE;
    else process.env.WAFFO_MODE = previousMode;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("reference page preserves Newsletter Cover's real listing contract", () => {
  const previousMode = process.env.WAFFO_MODE;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    process.env.WAFFO_MODE = "fixture";
    process.env.NODE_ENV = "test";
    const html = renderNewsletterReferencePage(referenceBoard());
    assert.ok(html);
    assert.match(html, /class="outbid-reference-root"/);
    assert.doesNotMatch(html, /data-reference-fixture=""/);
    assert.match(html, /action="\/listings"/);
    for (const field of ["sponsorUrl", "blurb", "bidUsd"]) {
      assert.match(html, new RegExp(`name="${field}"`));
    }
    assert.doesNotMatch(
      html,
      /name="(?:productUrl|whyTestThisToday|venueName|category|kind)"/,
    );
    assert.match(html, /href="\/l\/lst_visual_one"/);
    assert.match(html, /data-target="\/l\/lst_visual_one"/);
    assert.match(html, /The Morning Ledger/);
    assert.match(html, /morning-ledger\.example/);
    assert.doesNotMatch(html, /href="\/r\/|data-target="\/r\//);
    assert.doesNotMatch(html, /Polar/i);
  } finally {
    if (previousMode === undefined) delete process.env.WAFFO_MODE;
    else process.env.WAFFO_MODE = previousMode;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("document adapter keeps the Outbid surface while changing only the newsletter contract", () => {
  const listings = referenceBoard().listings.slice(0, 3).map((listing) => ({
    id: listing.id,
    rank: listing.rank,
    day: "2026-08-29",
    productUrl: listing.sponsorUrl,
    whyTestThisToday: listing.blurb,
    bidUsd: listing.bidUsd,
    paidUsd: listing.bidUsd,
    clicks: listing.clicks,
    createdAt: listing.createdAt ?? "2026-08-28T12:00:00.000Z",
    updatedAt: listing.createdAt ?? "2026-08-28T12:00:00.000Z",
  }));
  const html = adaptReferenceDocument(
    renderBoardPage({
      day: "2026-08-29",
      tz: "UTC",
      listings,
      last24h: listings,
      defaultBidUsd: 17_001,
      now: new Date("2026-08-29T12:00:00.000Z"),
      fixtureMode: true,
    }),
  );
  assert.match(html, /outbid-reference-root/);
  assert.match(html, /Sponsor URL/);
  assert.match(html, /One-line cover pitch/);
  assert.match(html, /name="sponsorUrl"/);
  assert.match(html, /name="blurb"/);
  assert.match(html, /name="bidUsd"/);
});

test("visual fixture is repeatable and refuses non-disposable databases", () => {
  const tempRoot = mkdtempSync("/private/tmp/newsletter-cover-visual-");
  const databasePath = `${tempRoot}/fixture.sqlite`;
  try {
    const first = seedVisualFixture(databasePath);
    const second = seedVisualFixture(databasePath);
    const shape = (rows: typeof first) =>
      rows.map(({ id, issueDate, sponsorUrl, blurb, bidUsd, clicks, status }) => ({
        id,
        issueDate,
        sponsorUrl,
        blurb,
        bidUsd,
        clicks,
        status,
      }));
    assert.deepEqual(shape(first), shape(second));
    assert.deepEqual(
      first.map((row) => row.bidUsd),
      [17_000, 16_000, 14_028, 13_005, 12_080, 11_004],
    );
    assert.deepEqual(
      first.map((row) => row.blurb),
      OUTBID_REFERENCE_FIXTURE_ROWS.map(([, blurb]) => blurb),
    );
    assert.deepEqual(
      first.map((row) => row.sponsorUrl),
      OUTBID_REFERENCE_FIXTURE_ROWS.map(([, , , sponsorUrl]) => sponsorUrl),
    );
    assert.ok(first.every((row) => row.issueDate === OUTBID_REFERENCE_ISSUE));
    assert.throws(
      () => seedVisualFixture("./data/newsletter-cover.sqlite"),
      /disposable \/private\/tmp database/,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("reference assets stay real files and the shared fixture owns its font", () => {
  const assetsSource = readFileSync(
    new URL("../src/http/routes/assets.ts", import.meta.url),
    "utf8",
  );
  const stylesSource = readFileSync(
    new URL("../src/views/outbid-reference-styles.ts", import.meta.url),
    "utf8",
  );
  assert.match(assetsSource, /readFileSync\(resolve\(iconDirectory, name\)\)/);
  assert.match(assetsSource, /"brand-mark\.png"/);
  assert.match(stylesSource, /data:font\/woff2;base64,/);
});
