import assert from "node:assert/strict";
import { test } from "node:test";
import { findCheckout, startListingCheckout } from "../src/billing/create.js";
import { FixturePolar } from "../src/billing/fixture.js";
import type { AppDb } from "../src/db.js";
import { createListing, findListingByUrlAndIssue, ListingError } from "../src/listings.js";
import { buildApp } from "../src/server.js";
import {
  canonicalizeSponsorUrl,
  isNsfwBlurb,
  isTrackingQueryKey,
  redirectTarget,
} from "../src/url.js";

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

function mustCanonical(raw: string): string {
  const result = canonicalizeSponsorUrl(raw);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected canonical url");
  }
  return result.url;
}

test("canonicalizeSponsorUrl strips tracking keys, fragment, and default ports", () => {
  assert.equal(
    mustCanonical(
      "https://Sponsor.Example:443/cover?utm_source=x&fbclid=y&keep=yes#frag",
    ),
    "https://sponsor.example/cover?keep=yes",
  );
  assert.equal(
    mustCanonical("http://NEWS.EXAMPLE:80/slot?gclid=1&ref=tweet"),
    "http://news.example/slot",
  );
  assert.equal(
    mustCanonical(
      "https://helix.example/cover?gbraid=2&wbraid=3&msclkid=4&mc_eid=5&mc_cid=6&igshid=7&ref_=x&ref_src=tw&yclid=9&tbclid=a&_ga=1&_gl=2",
    ),
    "https://helix.example/cover",
  );
  assert.equal(isTrackingQueryKey("utm_campaign"), true);
  assert.equal(isTrackingQueryKey("ref_src"), true);
  assert.equal(isTrackingQueryKey("keep"), false);
});

test("bare sponsor domains are safely normalized to HTTPS", () => {
  assert.equal(
    mustCanonical("  Sponsor.Example/cover?utm_source=ad&keep=yes#frag  "),
    "https://sponsor.example/cover?keep=yes",
  );
  assert.equal(mustCanonical("sponsor.example:8443/cover"), "https://sponsor.example:8443/cover");
  assert.equal(mustCanonical("//Sponsor.Example/cover"), "https://sponsor.example/cover");
  assert.equal(mustCanonical("[2001:db8::1]/cover"), "https://[2001:db8::1]/cover");
  for (const raw of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "mailto:hi@example.com",
    "ftp://sponsor.example/cover",
    "sponsor.example:port/cover",
  ]) {
    assert.deepEqual(canonicalizeSponsorUrl(raw), {
      ok: false,
      error: "invalid_url",
    }, raw);
  }
});

test("redirect target is the stored canonical URL, never the raw paste", () => {
  const raw = "https://Deck.Example/cover?utm_source=x&fbclid=1#top";
  const canonical = mustCanonical(raw);
  assert.equal(canonical, "https://deck.example/cover");
  assert.equal(redirectTarget(canonical), canonical);
  assert.notEqual(redirectTarget(canonical), raw);
  assert.doesNotMatch(redirectTarget(canonical), /utm_/);
  assert.doesNotMatch(redirectTarget(canonical), /fbclid/);
});

test("paste with utm_source and fbclid is stored without those keys", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://Sponsor.Example/cover?utm_source=x&fbclid=y&keep=yes#frag",
      blurb: "Tracking must not survive on the cover",
      bidUsd: 5,
    },
  });
  assert.equal(created.statusCode, 200);
  const stored = findListingByUrlAndIssue(
    app.db,
    "https://sponsor.example/cover?keep=yes",
    OPEN_ISSUE,
  );
  assert.ok(stored);
  assert.equal(stored.sponsorUrl, "https://sponsor.example/cover?keep=yes");
  assert.doesNotMatch(stored.sponsorUrl, /utm_/);
  assert.doesNotMatch(stored.sponsorUrl, /fbclid/);
  assert.doesNotMatch(stored.sponsorUrl, /#/);
  assert.equal(redirectTarget(stored.sponsorUrl), stored.sponsorUrl);
});

test("same URL with and without tracking is one listing identity", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const first = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://same.example/path?utm_source=ad",
      blurb: "Original blurb",
      bidUsd: 5,
    },
  });
  const second = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://SAME.example/path?fbclid=zzz",
      blurb: "Must not fork a row",
      bidUsd: 8,
    },
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(listingCount(app.db), 1);
  const stored = findListingByUrlAndIssue(
    app.db,
    "https://same.example/path",
    OPEN_ISSUE,
  );
  assert.ok(stored);
  assert.equal(stored.sponsorUrl, "https://same.example/path");
  assert.equal(stored.blurb, "Original blurb");
});

test("javascript, data, and mailto URLs are invalid_url", () => {
  for (const raw of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "mailto:hi@example.com",
    "not a url",
    "",
  ]) {
    assert.deepEqual(canonicalizeSponsorUrl(raw), {
      ok: false,
      error: "invalid_url",
    });
  }
});

test("Telegram, WhatsApp, and Discord invite URLs are rejected_content with no row", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  for (const sponsorUrl of [
    "https://t.me/foo",
    "https://telegram.me/joinchat/abc",
    "https://wa.me/15555550100",
    "https://api.whatsapp.com/send?phone=15555550100",
    "https://chat.whatsapp.com/invite",
    "https://discord.gg/abc",
    "https://discord.com/invite/abc",
    "https://line.me/R/ti/p/@cover",
    "https://m.me/cover",
  ]) {
    const created = await app.inject({
      method: "POST",
      url: "/listings",
      payload: { sponsorUrl, blurb: "Please message us", bidUsd: 5 },
    });
    assert.equal(created.statusCode, 400, sponsorUrl);
    assert.deepEqual(created.json(), { error: "rejected_content" });
  }

  assert.equal(listingCount(app.db), 0);
  assert.deepEqual(canonicalizeSponsorUrl("https://t.me/foo"), {
    ok: false,
    error: "rejected_content",
  });
  assert.equal(canonicalizeSponsorUrl("https://discord.com/channels/1/2").ok, true);
});

test("NSFW URL or blurb is rejected_content with no row", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const adultHost = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://pornhub.com/view",
      blurb: "Adult video site",
      bidUsd: 5,
    },
  });
  assert.equal(adultHost.statusCode, 400);
  assert.deepEqual(adultHost.json(), { error: "rejected_content" });

  const adultPath = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://media.example/porn/clip",
      blurb: "A clean looking blurb",
      bidUsd: 5,
    },
  });
  assert.equal(adultPath.statusCode, 400);
  assert.deepEqual(adultPath.json(), { error: "rejected_content" });

  const nsfwBlurb = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://clean.example/cover",
      blurb: "Live cam girls on the next issue",
      bidUsd: 5,
    },
  });
  assert.equal(nsfwBlurb.statusCode, 400);
  assert.deepEqual(nsfwBlurb.json(), { error: "rejected_content" });

  assert.equal(listingCount(app.db), 0);
  assert.deepEqual(canonicalizeSponsorUrl("https://onlyfans.com/creator"), {
    ok: false,
    error: "rejected_content",
  });
  assert.equal(isNsfwBlurb("Live cam girls on the next issue"), true);
  assert.equal(isNsfwBlurb("We make widgets for newsletters"), false);
});

test("a raise cannot bypass chat or NSFW policy", async (t) => {
  const polar = new FixturePolar();
  const app = await buildApp({ polar });
  t.after(() => app.close());
  insertIssue(app.db, OPEN_ISSUE, "open");

  const first = await startListingCheckout(app.db, polar, {
    sponsorUrl: "https://raise.example/cover",
    blurb: "Five dollars for the cover",
    bidUsd: 5,
  });
  assert.equal(listingCount(app.db), 1);
  assert.ok(findCheckout(app.db, first.polarCheckoutId));

  const chatRaise = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://t.me/raise",
      blurb: "Raise on telegram",
      bidUsd: 8,
    },
  });
  assert.equal(chatRaise.statusCode, 400);
  assert.deepEqual(chatRaise.json(), { error: "rejected_content" });

  const nsfwRaise = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://raise.example/cover",
      blurb: "Now with porn on the cover",
      bidUsd: 8,
    },
  });
  assert.equal(nsfwRaise.statusCode, 400);
  assert.deepEqual(nsfwRaise.json(), { error: "rejected_content" });

  assert.equal(listingCount(app.db), 1);
  const stored = findListingByUrlAndIssue(
    app.db,
    "https://raise.example/cover",
    OPEN_ISSUE,
  );
  assert.ok(stored);
  assert.equal(stored.blurb, "Five dollars for the cover");
});

test("createListing throws rejected_content for chat and NSFW", () => {
  assert.throws(
    () =>
      createListing({} as AppDb, {
        sponsorUrl: "https://wa.me/15555550100",
        blurb: "Chat us",
      }),
    (err: unknown) => {
      assert.ok(err instanceof ListingError);
      assert.equal(err.code, "rejected_content");
      return true;
    },
  );
  assert.throws(
    () =>
      createListing({} as AppDb, {
        sponsorUrl: "https://ok.example",
        blurb: "xxx cam",
      }),
    (err: unknown) => {
      assert.ok(err instanceof ListingError);
      assert.equal(err.code, "rejected_content");
      return true;
    },
  );
});
