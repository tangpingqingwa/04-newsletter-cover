import assert from "node:assert/strict";
import { test } from "node:test";
import { startListingCheckout } from "../src/billing/create.js";
import type { WaffoPort } from "../src/billing/port.js";
import { buildApp } from "../src/server.js";

test("GET /about returns production-facing product copy", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/about" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/html/);
  const body = response.body;
  assert.match(body, /<!DOCTYPE html>/i);
  assert.match(body, /lang="en"/);
  const content = body.slice(body.indexOf("<main"));
  assert.match(body, /public auction/i);
  assert.match(body, /Rank is the bid/);
  assert.match(body, /\$5/);
  assert.match(body, /weekly issue/i);
  assert.match(body, /eligible for seven days/i);
  assert.match(body, /cover/);
  assert.match(body, /#1/);
  assert.match(body, /Newsletter Cover/);
  assert.match(body, /without an account/i);
  assert.match(body, /payment is confirmed/i);
  assert.doesNotMatch(content, /outbid\.lol|clone of|\bv1\b|fixture|Waffo|EDITOR_VETO|API keys|weekId|createdAt|paidAt|BLOCKED-/i);
});

test("GET /rules states the public ranking, payment, and link rules", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/rules" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/html/);
  const body = response.body;
  assert.match(body, /<!DOCTYPE html>/i);
  assert.match(body, /lang="en"/);
  const content = body.slice(body.indexOf("<main"));
  assert.match(body, /\$5/);
  assert.match(body, /\$10,000/);
  assert.match(body, /Whole USD/);
  assert.match(body, /Rank is the bid/);
  assert.match(body, /listing placed first keeps the higher rank/);
  assert.match(body, /difference/);
  assert.match(body, /parameters are removed/);
  assert.match(body, /chat invitations, adult content/);
  assert.match(body, /eligible for <strong>seven days/);
  assert.match(body, /does not reset for everyone at Monday midnight/);
  assert.match(body, /paid listings appear on the board immediately after confirmation/i);
  assert.match(body, /there is no editorial re-ranking/i);
  assert.doesNotMatch(content, /outbid\.lol|clone of|\bv1\b|fixture|Waffo|EDITOR_VETO|API keys|weekId|createdAt|paidAt|BLOCKED-/i);
});

test("GET /about and GET /rules need no account", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const about = await app.inject({ method: "GET", url: "/about" });
  const rules = await app.inject({ method: "GET", url: "/rules" });

  assert.equal(about.statusCode, 200);
  assert.equal(rules.statusCode, 200);
  assert.equal(about.headers.location, undefined);
  assert.equal(rules.headers.location, undefined);
});

test("checkout completion is a durable read-only page for every intent state", async (t) => {
  const now = new Date("2099-01-01T12:00:00.000Z");
  let providerCalls = 0;
  const provider: WaffoPort = {
    kind: "fixture",
    async createCheckout(input) {
      providerCalls += 1;
      return {
        checkoutId: "fix_page_state",
        url: "/checkout/complete?checkoutId=fix_page_state",
      };
    },
  };
  const app = await buildApp({ polar: provider, now });
  t.after(() => app.close());
  app.db
    .prepare("INSERT INTO issues (issue_date, status, closed_at) VALUES (?, 'open', NULL)")
    .run("2099-01-04");
  const started = await startListingCheckout(
    app.db,
    provider,
    {
      sponsorUrl: "https://page-state.example/cover",
      blurb: "Durable return state",
      bidUsd: 5,
    },
    now,
  );
  assert.equal(providerCalls, 1);
  const boardBefore = app.db
    .prepare<[string], { bid_usd: number; clicks: number }>(
      "SELECT bid_usd, clicks FROM listings WHERE id = ?",
    )
    .get(started.listingId);
  assert.deepEqual(boardBefore, { bid_usd: 0, clicks: 0 });

  const assertState = async (
    url: string,
    state: string,
  ): Promise<void> => {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 200, url);
    assert.match(response.headers["content-type"] ?? "", /text\/html/);
    assert.match(response.body, new RegExp(`data-checkout-state="${state}"`));
    assert.match(response.body, /class="site-nav"/);
    assert.equal(providerCalls, 1, "return page must not call the provider");
  };

  await assertState(
    `/checkout/complete?intent=${encodeURIComponent(started.checkoutId)}`,
    "pending",
  );
  await assertState(started.url, "pending");

  for (const state of ["open", "unknown", "paid", "needs_reconciliation", "rejected"]) {
    app.db
      .prepare("UPDATE checkouts SET status = ?, updated_at = ? WHERE id = ?")
      .run(state, now.toISOString(), started.checkoutId);
    await assertState(
      `/checkout/complete?intent=${encodeURIComponent(started.checkoutId)}`,
      state,
    );
  }
  await assertState("/checkout/complete?intent=does-not-exist", "unknown");
  await assertState("/checkout/complete", "malformed");
  await assertState("/checkout/complete?status=paid", "malformed");

  const boardAfter = app.db
    .prepare<[string], { bid_usd: number; clicks: number }>(
      "SELECT bid_usd, clicks FROM listings WHERE id = ?",
    )
    .get(started.listingId);
  assert.deepEqual(boardAfter, boardBefore);
});
