import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyPaidCheckout,
  completeCheckout,
  createPolar,
  findCheckout,
  findListingById,
  MIN_BID_USD,
  paidCheckoutCount,
  polarLiveEnabled,
  startListingCheckout,
} from "../src/billing/create.js";
import { FixturePolar } from "../src/billing/fixture.js";
import { LivePolar, polarApiBase } from "../src/billing/polar.js";
import type { AppDb } from "../src/db.js";
import { ListingError } from "../src/listings.js";
import { buildApp } from "../src/server.js";

const OPEN_ISSUE = "2099-01-05";

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

function paidListingCount(db: AppDb): number {
  const row = db
    .prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM listings WHERE bid_usd > 0",
    )
    .get();
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
  return board.json().listings as Array<{ id: string; bidUsd: number; rank: number }>;
}

test("createPolar is fixture; POLAR_FIXTURE_ONLY=1 ignores POLAR_LIVE", () => {
  assert.equal(polarLiveEnabled({}), false);
  assert.equal(polarLiveEnabled({ POLAR_LIVE: "1" }), true);
  assert.equal(
    polarLiveEnabled({ POLAR_LIVE: "1", POLAR_FIXTURE_ONLY: "1" }),
    false,
  );
  assert.ok(createPolar({}) instanceof FixturePolar);
  assert.ok(
    createPolar({ POLAR_LIVE: "1", POLAR_FIXTURE_ONLY: "1" }) instanceof
      FixturePolar,
  );
  assert.throws(
    () => createPolar({ POLAR_LIVE: "1" }),
    /BLOCKED-SECRET: POLAR_ACCESS_TOKEN/,
  );
  assert.throws(
    () =>
      createPolar({
        POLAR_LIVE: "1",
        POLAR_ACCESS_TOKEN: "polar_tok_test",
      }),
    /BLOCKED-SECRET: POLAR_PRODUCT_ID/,
  );
  const live = createPolar({
    POLAR_LIVE: "1",
    POLAR_ACCESS_TOKEN: "polar_tok_test",
    POLAR_PRODUCT_ID: "prod_test",
    POLAR_API_BASE: "https://polar.example.test",
  });
  assert.ok(live instanceof LivePolar);
});

test("polarApiBase defaults to production host and honors POLAR_API_BASE", () => {
  assert.equal(polarApiBase({}), "https://api.polar.sh");
  assert.equal(
    polarApiBase({ POLAR_API_BASE: "https://sandbox-api.polar.sh/" }),
    "https://sandbox-api.polar.sh",
  );
});

test("LivePolar createCheckout posts to POLAR_API_BASE and never production by default in tests", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const polar = new LivePolar({
    env: {
      POLAR_LIVE: "1",
      POLAR_ACCESS_TOKEN: "polar_tok_test",
      POLAR_PRODUCT_ID: "prod_test",
      POLAR_API_BASE: "https://polar.example.test",
    },
    fetch: async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        body: JSON.parse(String(init?.body ?? "{}")) as unknown,
      });
      return new Response(
        JSON.stringify({
          id: "chk_live_1",
          url: "https://sandbox.polar.sh/checkout/chk_live_1",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    },
  });

  const created = await polar.createCheckout({
    amountUsd: 5,
    listingId: "lst_live",
    successUrl: "http://127.0.0.1:3000/",
    cancelUrl: "http://127.0.0.1:3000/",
  });
  assert.equal(created.checkoutId, "chk_live_1");
  assert.equal(created.url, "https://sandbox.polar.sh/checkout/chk_live_1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://polar.example.test/v1/checkouts/");
  assert.deepEqual(calls[0]?.body, {
    product_id: "prod_test",
    amount: 500,
    currency: "usd",
    success_url: "http://127.0.0.1:3000/",
    metadata: { listingId: "lst_live", amountUsd: "5" },
  });
});

test("unpaid checkout is hidden; $5 paid appears on the board", async (t) => {
  const polar = new FixturePolar();
  const app = await buildApp({ polar });
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://five.example/cover",
      blurb: "Five dollars for the cover",
      bidUsd: MIN_BID_USD,
    },
  });
  assert.equal(created.statusCode, 200);
  const body = created.json() as { url: string };
  assert.ok(typeof body.url === "string");
  assert.match(body.url, /checkoutId=/);
  assert.doesNotMatch(body.url, /polar\.sh/i);
  assert.equal((await boardListings(app)).length, 0);
  assert.equal(paidListingCount(app.db), 0);
  assert.equal(paidCheckoutCount(app.db), 0);

  const polarId = new URL(body.url, "http://localhost").searchParams.get(
    "checkoutId",
  );
  assert.ok(polarId);
  const pending = findCheckout(app.db, polarId);
  assert.ok(pending);
  assert.equal(pending.status, "pending");
  assert.equal(pending.amountUsd, 5);
  assert.equal(pending.targetBidUsd, 5);
  const unpaidListing = findListingById(app.db, pending.listingId);
  assert.ok(unpaidListing);
  assert.equal(unpaidListing.bidUsd, 0);

  const paid = await completeCheckout(app.db, polar, polarId);
  assert.equal(paid.status, "paid");

  const listings = await boardListings(app);
  assert.equal(listings.length, 1);
  assert.equal(listings[0]?.id, pending.listingId);
  assert.equal(listings[0]?.bidUsd, 5);
  assert.equal(listings[0]?.rank, 1);
  const listed = findListingById(app.db, pending.listingId);
  assert.ok(listed);
  assert.equal(listed.bidUsd, 5);
  assert.equal(paidCheckoutCount(app.db), 1);
});

test("$4 is rejected and never creates a paid row", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://four.example",
      blurb: "Four dollars is under the floor",
      bidUsd: 4,
    },
  });
  assert.equal(created.statusCode, 400);
  assert.deepEqual(created.json(), { error: "below_minimum" });
  assert.equal(listingCount(app.db), 0);
  assert.equal(paidCheckoutCount(app.db), 0);
  assert.deepEqual(await boardListings(app), []);
});

test("applyPaidCheckout refuses a $4 pending row and leaves the board empty", async (t) => {
  const polar = new FixturePolar();
  const app = await buildApp({ polar });
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const listingId = "lst_four";
  app.db
    .prepare(
      `INSERT INTO listings (id, issue_date, sponsor_url, blurb, bid_usd, created_at, clicks, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      listingId,
      OPEN_ISSUE,
      "https://sneaky-four.example",
      "Should not pay",
      0,
      "2026-08-01T00:00:00.000Z",
      0,
      "active",
    );
  app.db
    .prepare(
      `INSERT INTO checkouts (id, listing_id, amount_usd, target_bid_usd, polar_checkout_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("chk_four", listingId, 4, 4, "fix_four", "pending");

  assert.throws(
    () => applyPaidCheckout(app.db, "fix_four"),
    (err: unknown) => {
      assert.ok(err instanceof ListingError);
      assert.equal(err.code, "below_minimum");
      return true;
    },
  );
  const checkout = findCheckout(app.db, "fix_four");
  assert.ok(checkout);
  assert.equal(checkout.status, "pending");
  assert.equal(findListingById(app.db, listingId)?.bidUsd, 0);
  assert.equal(paidCheckoutCount(app.db), 0);
  assert.deepEqual(await boardListings(app), []);
});

test("webhook complete is idempotent; unknown id is 404 and board is unchanged", async (t) => {
  const polar = new FixturePolar();
  const app = await buildApp({ polar });
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const started = await startListingCheckout(app.db, polar, {
    sponsorUrl: "https://hook.example",
    blurb: "Pay via webhook",
    bidUsd: 5,
  });

  const missing = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    payload: { checkoutId: "does-not-exist" },
  });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.json(), { error: "unknown_checkout" });
  assert.deepEqual(await boardListings(app), []);

  const first = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    payload: { checkoutId: started.polarCheckoutId },
  });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json(), { ok: true, status: "paid" });
  const afterPay = await boardListings(app);
  assert.equal(afterPay.length, 1);
  assert.equal(afterPay[0]?.bidUsd, 5);

  const again = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    payload: { checkoutId: started.polarCheckoutId },
  });
  assert.equal(again.statusCode, 200);
  assert.deepEqual(again.json(), { ok: true, status: "paid" });
  assert.equal((await boardListings(app)).length, 1);
  assert.equal(paidCheckoutCount(app.db), 1);
});

test("fixture createCheckout does not perform Polar HTTP", async () => {
  const polar = new FixturePolar();
  const created = await polar.createCheckout({
    amountUsd: 5,
    listingId: "lst_offline",
    successUrl: "http://localhost:3000/",
    cancelUrl: "http://localhost:3000/",
  });
  assert.match(created.checkoutId, /^fix_/);
  assert.doesNotMatch(created.url, /https?:\/\/([^/]*\.)?polar\.sh/i);
  assert.equal(polar.getCheckout(created.checkoutId)?.status, "pending");
  const paid = await polar.complete(created.checkoutId);
  assert.equal(paid.status, "paid");
});
