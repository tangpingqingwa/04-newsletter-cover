import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/server.js";

test("GET /about returns 200 HTML and states the product", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/about" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/html/);
  const body = response.body;
  assert.match(body, /<!DOCTYPE html>/i);
  assert.match(body, /lang="en"/);
  assert.match(body, /public auction/i);
  assert.match(body, /Rank is the bid/);
  assert.match(body, /\$5/);
  assert.match(body, /weekly issue/i);
  assert.match(body, /rolling last 7 days/i);
  assert.match(body, /Monday 00:00 UTC/);
  assert.match(body, /cover/);
  assert.match(body, /#1/);
  assert.match(body, /no ads/i);
  assert.match(body, /no on-site chat/i);
  assert.match(body, /global English/i);
  assert.match(body, /outbid\.lol/);
  assert.match(body, /Newsletter Cover/);
  assert.match(body, /veto is off/i);
  assert.doesNotMatch(body, /POLAR_LIVE/);
  assert.doesNotMatch(body, /api\.polar\.sh/);
});

test("GET /rules returns 200 and states min $5, rank=bid, older wins, raise=difference, veto off", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/rules" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/html/);
  const body = response.body;
  assert.match(body, /<!DOCTYPE html>/i);
  assert.match(body, /lang="en"/);
  assert.match(body, /\$5/);
  assert.match(body, /\$10,000/);
  assert.match(body, /Whole USD/);
  assert.match(body, /Rank is the bid/);
  assert.match(body, /older listing wins/);
  assert.match(body, /difference/);
  assert.match(body, /stripped/);
  assert.match(body, /Chat-app links and NSFW/);
  assert.match(body, /veto is off/i);
  assert.match(body, /EDITOR_VETO/);
  assert.match(body, /rolling last 7 days/i);
  assert.match(body, /Monday 00:00 UTC/);
  assert.doesNotMatch(body, /POLAR_LIVE/);
  assert.doesNotMatch(body, /api\.polar\.sh/);
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
