import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import {
  applyPaidCheckout,
  applyVerifiedWaffoOrder,
  assertWaffoRuntimeConfig,
  completeCheckout,
  createWaffo,
  findCheckout,
  findListingById,
  intentFingerprintForMetadata,
  MIN_BID_USD,
  paidCheckoutCount,
  startListingCheckout,
  type VerifiedWaffoOrder,
} from "../src/billing/create.js";
import { FixturePolar } from "../src/billing/fixture.js";
import {
  LiveWaffo,
  WaffoCheckoutAmbiguousError,
  WaffoProviderRejectedError,
  validateWaffoApiOrigin,
  validateWaffoCheckoutUrl,
  validateWaffoExpiry,
  validateWaffoPublicOrigin,
  isEphemeralDatabasePath,
} from "../src/billing/waffo.js";
import { MAX_WAFFO_WEBHOOK_BODY_BYTES } from "../src/http/routes/polar-webhook.js";
import type { AppDb } from "../src/db.js";
import { ListingError } from "../src/listings.js";
import { buildApp } from "../src/server.js";

const OPEN_ISSUE = "2099-01-04";
const FIXED_NOW = new Date("2099-01-01T12:00:00.000Z");
const MERCHANT_ID = `MER_${"M".repeat(22)}`;
const STORE_ID = `STO_${"S".repeat(22)}`;
const PRODUCT_ONE = `PROD_${"P".repeat(22)}`;
const PRODUCT_TWO = `PROD_${"Q".repeat(22)}`;
const { privateKey: signingPrivateKey, publicKey: signingPublicKey } =
  generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_KEY = signingPrivateKey.export({ type: "pkcs8", format: "pem" }).toString();
const PUBLIC_KEY = signingPublicKey.export({ type: "spki", format: "pem" }).toString();

function setEnv(values: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function setWaffoTestEnv(): () => void {
  return setEnv({
    WAFFO_MODE: "waffo-test",
    WAFFO_MERCHANT_ID: MERCHANT_ID,
    WAFFO_STORE_ID: STORE_ID,
    WAFFO_PRODUCT_ID: PRODUCT_ONE,
    WAFFO_WEBHOOK_TEST_PUBLIC_KEY: PUBLIC_KEY,
    PUBLIC_BASE_URL: "http://127.0.0.1:3000",
    DATABASE_PATH: join(tmpdir(), "newsletter-cover-test.sqlite"),
    WAFFO_LIVE: "1",
    POLAR_LIVE: "1",
  });
}

function insertIssue(db: AppDb, issueDate = OPEN_ISSUE): void {
  db.prepare(
    "INSERT INTO issues (issue_date, status, closed_at) VALUES (?, 'open', NULL)",
  ).run(issueDate);
}

function metadataFor(app: Awaited<ReturnType<typeof buildApp>>, intentId: string): Record<string, string> {
  const row = app.db
    .prepare<[string], { metadata_json: string }>(
      "SELECT metadata_json FROM checkouts WHERE id = ?",
    )
    .get(intentId);
  assert.ok(row);
  return JSON.parse(row.metadata_json) as Record<string, string>;
}

function signedWaffoHeaders(body: string, timestamp = Date.now()):
  Record<string, string> {
  const signature = createSign("RSA-SHA256")
    .update(`${timestamp}.${body}`)
    .sign(PRIVATE_KEY, "base64");
  return {
    "x-waffo-signature": `t=${timestamp},v1=${signature}`,
    "content-type": "application/json",
  };
}

function completedBody(options: {
  deliveryId: string;
  businessEventId?: string;
  orderId?: string;
  paymentId?: string;
  intentId: string;
  metadata: Record<string, string>;
  timestamp?: string;
  eventType?: string;
  mode?: string;
  storeId?: string;
  orderStatus?: string;
  paymentStatus?: string;
  currency?: string;
  productId?: string | null;
  amount?: string;
  taxAmount?: string;
  subtotal?: string | null;
  total?: string | null;
}): string {
  const timestamp = options.timestamp ?? "2099-01-01T10:00:00.000Z";
  return JSON.stringify({
    id: options.deliveryId,
    timestamp,
    eventType: options.eventType ?? "order.completed",
    eventId: options.businessEventId ?? "PAY_payment_1",
    storeId: options.storeId ?? STORE_ID,
    storeName: "Newsletter Cover",
    mode: options.mode ?? "test",
    data: {
      orderId: options.orderId ?? "ORD_order_1",
      orderStatus: options.orderStatus ?? "completed",
      buyerEmail: "buyer@example.test",
      currency: options.currency ?? "USD",
      amount: options.amount ?? "5.00",
      taxAmount: options.taxAmount ?? "0.00",
      ...(options.productId === null
        ? {}
        : { productMetadata: { productId: options.productId ?? PRODUCT_ONE } }),
      ...(options.subtotal === null
        ? {}
        : { subtotal: options.subtotal ?? "5.00" }),
      ...(options.total === null ? {} : { total: options.total ?? "5.00" }),
      productName: "Rank",
      paymentId: options.paymentId ?? "PAY_payment_1",
      paymentStatus: options.paymentStatus ?? "succeeded",
      orderMerchantExternalId: options.intentId,
      orderMetadata: options.metadata,
    },
  });
}

async function postEvent(
  app: Awaited<ReturnType<typeof buildApp>>,
  body: string,
): Promise<{ statusCode: number; json: () => unknown }> {
  const response = await app.inject({
    method: "POST",
    url: "/webhooks/waffo",
    headers: signedWaffoHeaders(body),
    payload: body,
  });
  return { statusCode: response.statusCode, json: () => response.json() };
}

test("createWaffo requires an explicit mode; Polar and WAFFO_LIVE flags are inert", () => {
  assert.throws(() => createWaffo({}), /BLOCKED-CONFIG: WAFFO_MODE/);
  assert.throws(
    () => createWaffo({ WAFFO_LIVE: "1" }),
    /BLOCKED-CONFIG: WAFFO_MODE/,
  );
  assert.ok(createWaffo({ WAFFO_MODE: "fixture" }) instanceof FixturePolar);
  assert.throws(
    () => createWaffo({ NODE_ENV: "production", WAFFO_MODE: "fixture" }),
    /waffo-prod required in production/,
  );
});

test("production Waffo configuration fails closed before checkout/network", () => {
  assert.throws(
    () => createWaffo({ NODE_ENV: "production", WAFFO_MODE: "waffo-prod" }),
    /BLOCKED-CONFIG: WAFFO_MERCHANT_ID/,
  );
  assert.throws(
    () =>
      createWaffo({
        NODE_ENV: "production",
        WAFFO_MODE: "waffo-prod",
        WAFFO_MERCHANT_ID: MERCHANT_ID,
        WAFFO_PRIVATE_KEY: "not-a-key",
        WAFFO_STORE_ID: STORE_ID,
        WAFFO_PRODUCT_ID: PRODUCT_ONE,
        WAFFO_WEBHOOK_PROD_PUBLIC_KEY: PUBLIC_KEY,
        PUBLIC_BASE_URL: "https://newsletter-cover.com",
        DATABASE_PATH: "/tmp/cover.sqlite",
      }),
    /Private key/,
  );
  assert.throws(
    () =>
      createWaffo({
        NODE_ENV: "production",
        WAFFO_MODE: "waffo-prod",
        WAFFO_MERCHANT_ID: MERCHANT_ID,
        WAFFO_PRIVATE_KEY: PRIVATE_KEY,
        WAFFO_STORE_ID: STORE_ID,
        WAFFO_PRODUCT_ID: PRODUCT_ONE,
        PUBLIC_BASE_URL: "https://newsletter-cover.com",
        DATABASE_PATH: "/tmp/cover.sqlite",
      }),
    /BLOCKED-CONFIG: WAFFO_WEBHOOK_PROD_PUBLIC_KEY/,
  );
});

test("official Waffo anonymous checkout sends exact USD decimal parameters", async () => {
  const calls: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
  const provider = new LiveWaffo({
    env: {
      WAFFO_MODE: "waffo-test",
      WAFFO_MERCHANT_ID: MERCHANT_ID,
      WAFFO_PRIVATE_KEY: PRIVATE_KEY,
      WAFFO_STORE_ID: STORE_ID,
      WAFFO_PRODUCT_ID: PRODUCT_ONE,
      WAFFO_API_BASE: "https://waffo.example.test",
    },
    fetch: async (input, init) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as unknown,
        headers: Object.fromEntries(
          Object.entries(init?.headers ?? {}).map(([key, value]) => [key, String(value)]),
        ),
      });
      return new Response(
        JSON.stringify({
          data: {
            sessionId: "CHK_waffo_1",
            checkoutUrl: "https://pancake.waffo.ai/store/newsletter-cover/checkout/CHK_waffo_1",
            expiresAt: "2099-01-01T12:45:00.000Z",
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    },
  });
  const metadata = {
    intentId: "intent_test_1",
    intentFingerprint: "fingerprint_test_1",
    targetBidCents: "500",
    chargeCents: "500",
    canonicalUrl: "https://sponsor.example/",
  };
  const result = await provider.createCheckout({
    amountUsd: 5,
    listingId: "listing_test_1",
    successUrl: "https://cover.example/checkout/complete?intent=intent_test_1",
    cancelUrl: "https://cover.example/checkout/complete?intent=intent_test_1",
    intentId: "intent_test_1",
    intentFingerprint: "fingerprint_test_1",
    metadata,
  });
  assert.equal(result.checkoutId, "CHK_waffo_1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://waffo.example.test/v1/actions/checkout/create-session");
  assert.deepEqual(calls[0]?.body, {
    productId: PRODUCT_ONE,
    currency: "USD",
    priceSnapshot: { amount: "5.00", taxCategory: "digital_goods" },
    successUrl: "https://cover.example/checkout/complete?intent=intent_test_1",
    orderMerchantExternalId: "intent_test_1",
    metadata,
  });
  assert.match(calls[0]?.headers["X-Idempotency-Key"] ?? "", /^[0-9a-f]{64}$/);
});

test("live checkout timeout aborts the SDK request and remains ambiguous", async () => {
  let requestSignal: AbortSignal | undefined;
  const provider = new LiveWaffo({
    timeoutMs: 25,
    env: {
      WAFFO_MODE: "waffo-test",
      WAFFO_MERCHANT_ID: MERCHANT_ID,
      WAFFO_PRIVATE_KEY: PRIVATE_KEY,
      WAFFO_STORE_ID: STORE_ID,
      WAFFO_PRODUCT_ID: PRODUCT_ONE,
      WAFFO_API_BASE: "https://waffo.timeout.test",
    },
    fetch: async (_input, init) => {
      requestSignal = init?.signal ?? undefined;
      return await new Promise<never>(() => undefined);
    },
  });
  const startedAt = Date.now();
  await assert.rejects(
    () => provider.createCheckout({
      amountUsd: 5,
      listingId: "listing_timeout",
      successUrl: "https://cover.example.com/checkout/complete?intent=intent_timeout",
      cancelUrl: "https://cover.example.com/checkout/complete?intent=intent_timeout",
      intentId: "intent_timeout",
      intentFingerprint: "fingerprint_timeout",
      metadata: {
        intentId: "intent_timeout",
        intentFingerprint: "fingerprint_timeout",
      },
    }),
    WaffoCheckoutAmbiguousError,
  );
  assert.ok(requestSignal?.aborted, "timeout must abort the provider signal");
  assert.ok(Date.now() - startedAt < 500, "timeout must be application bounded");
});

test("live checkout timeout covers a response body that stalls after headers", async () => {
  const provider = new LiveWaffo({
    timeoutMs: 25,
    env: {
      WAFFO_MODE: "waffo-test",
      WAFFO_MERCHANT_ID: MERCHANT_ID,
      WAFFO_PRIVATE_KEY: PRIVATE_KEY,
      WAFFO_STORE_ID: STORE_ID,
      WAFFO_PRODUCT_ID: PRODUCT_ONE,
      WAFFO_API_BASE: "https://waffo.body-stall.test",
    },
    fetch: async () => ({
      status: 201,
      json: async () => await new Promise<never>(() => undefined),
    }) as unknown as Response,
  });
  const startedAt = Date.now();
  await assert.rejects(
    () => provider.createCheckout({
      amountUsd: 5,
      listingId: "listing_body_stall",
      successUrl: "https://cover.example.com/checkout/complete?intent=intent_body_stall",
      cancelUrl: "https://cover.example.com/checkout/complete?intent=intent_body_stall",
      intentId: "intent_body_stall",
      intentFingerprint: "fingerprint_body_stall",
      metadata: {
        intentId: "intent_body_stall",
        intentFingerprint: "fingerprint_body_stall",
      },
    }),
    WaffoCheckoutAmbiguousError,
  );
  assert.ok(Date.now() - startedAt < 500, "body timeout must be application bounded");
});

test("body-stalled checkout keeps its pre-network intent in unknown recovery", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const provider = new LiveWaffo({
    env: { ...process.env, WAFFO_PRIVATE_KEY: PRIVATE_KEY },
    timeoutMs: 25,
    fetch: async () => ({
      status: 201,
      json: async () => await new Promise<never>(() => undefined),
    }) as unknown as Response,
  });
  const app = await buildApp({ polar: provider, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  await assert.rejects(
    () => startListingCheckout(app.db, provider, {
      sponsorUrl: "https://body-stall-intent.example/cover",
      blurb: "Body timeout remains recoverable",
      bidUsd: 5,
    }, FIXED_NOW),
    WaffoCheckoutAmbiguousError,
  );
  assert.deepEqual(
    app.db.prepare<[], { status: string; n: number }>(
      "SELECT status, COUNT(*) AS n FROM checkouts GROUP BY status",
    ).all(),
    [{ status: "unknown", n: 1 }],
  );
});

test("SDK-shaped 408/409/425/429/5xx responses remain ambiguous", async () => {
  for (const status of [408, 409, 425, 429, 500]) {
    const provider = new LiveWaffo({
      timeoutMs: 200,
      env: {
        WAFFO_MODE: "waffo-test",
        WAFFO_MERCHANT_ID: MERCHANT_ID,
        WAFFO_PRIVATE_KEY: PRIVATE_KEY,
        WAFFO_STORE_ID: STORE_ID,
        WAFFO_PRODUCT_ID: PRODUCT_ONE,
        WAFFO_API_BASE: "https://waffo.status.test",
      },
      fetch: async () => new Response(JSON.stringify({
        errors: [{ message: `status ${status}`, layer: "api" }],
      }), { status, headers: { "content-type": "application/json" } }),
    });
    await assert.rejects(
      () => provider.createCheckout({
        amountUsd: 5,
        listingId: `listing_status_${status}`,
        successUrl: `https://cover.example.com/checkout/complete?intent=intent_status_${status}`,
        cancelUrl: `https://cover.example.com/checkout/complete?intent=intent_status_${status}`,
        intentId: `intent_status_${status}`,
        intentFingerprint: `fingerprint_status_${status}`,
        metadata: {
          intentId: `intent_status_${status}`,
          intentFingerprint: `fingerprint_status_${status}`,
        },
      }),
      WaffoCheckoutAmbiguousError,
    );
  }
});

test("valid Waffo 4xx error notice remains a definitive rejection", async () => {
  const provider = new LiveWaffo({
    env: {
      WAFFO_MODE: "waffo-test",
      WAFFO_MERCHANT_ID: MERCHANT_ID,
      WAFFO_PRIVATE_KEY: PRIVATE_KEY,
      WAFFO_STORE_ID: STORE_ID,
      WAFFO_PRODUCT_ID: PRODUCT_ONE,
      WAFFO_API_BASE: "https://waffo.valid-error.test",
    },
    fetch: async () => new Response(
      JSON.stringify({ errors: [{ message: "invalid product", layer: "api" }] }),
      { status: 400, headers: { "content-type": "application/json" } },
    ),
  });
  await assert.rejects(
    () => provider.createCheckout({
      amountUsd: 5,
      listingId: "listing_valid_error",
      successUrl: "https://cover.example.com/checkout/complete?intent=intent_valid_error",
      cancelUrl: "https://cover.example.com/checkout/complete?intent=intent_valid_error",
      intentId: "intent_valid_error",
      intentFingerprint: "fingerprint_valid_error",
      metadata: {
        intentId: "intent_valid_error",
        intentFingerprint: "fingerprint_valid_error",
      },
    }),
    (error: unknown) => error instanceof WaffoProviderRejectedError && error.status === 400,
  );
});

test("malformed Waffo error envelope stays recoverable through the listing route", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const provider = new LiveWaffo({
    env: {
      ...process.env,
      WAFFO_PRIVATE_KEY: PRIVATE_KEY,
      WAFFO_API_BASE: "https://waffo.malformed.test",
    },
    fetch: async () => new Response(
      JSON.stringify({ errors: [null] }),
      { status: 400, headers: { "content-type": "application/json" } },
    ),
  });
  const app = await buildApp({ polar: provider, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);

  const response = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://malformed-error.example/cover",
      blurb: "Malformed provider errors stay recoverable",
      bidUsd: 5,
    },
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: "waffo_unavailable" });
  assert.deepEqual(
    app.db.prepare<[], { status: string; n: number }>(
      "SELECT status, COUNT(*) AS n FROM checkouts GROUP BY status",
    ).all(),
    [{ status: "unknown", n: 1 }],
  );
  assert.equal(paidCheckoutCount(app.db), 0);
});

test("blank Waffo error notice stays recoverable through the listing route", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const provider = new LiveWaffo({
    env: {
      ...process.env,
      WAFFO_PRIVATE_KEY: PRIVATE_KEY,
      WAFFO_API_BASE: "https://waffo.blank-error.test",
    },
    fetch: async () => new Response(
      JSON.stringify({ errors: [{ message: "  ", layer: " " }] }),
      { status: 400, headers: { "content-type": "application/json" } },
    ),
  });
  const app = await buildApp({ polar: provider, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);

  const response = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      sponsorUrl: "https://blank-error.example/cover",
      blurb: "Blank provider notice stays recoverable",
      bidUsd: 5,
    },
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: "waffo_unavailable" });
  assert.deepEqual(
    app.db.prepare<[], { status: string; n: number }>(
      "SELECT status, COUNT(*) AS n FROM checkouts GROUP BY status",
    ).all(),
    [{ status: "unknown", n: 1 }],
  );
  assert.equal(paidCheckoutCount(app.db), 0);
});

test("wrong-typed Waffo checkout response is an ambiguous checkout, not a TypeError", async () => {
  const provider = new LiveWaffo({
    env: {
      WAFFO_MODE: "waffo-test",
      WAFFO_MERCHANT_ID: MERCHANT_ID,
      WAFFO_PRIVATE_KEY: PRIVATE_KEY,
      WAFFO_STORE_ID: STORE_ID,
      WAFFO_PRODUCT_ID: PRODUCT_ONE,
      WAFFO_API_BASE: "https://waffo.shape.test",
    },
    fetch: async () => new Response(
      JSON.stringify({
        data: {
          sessionId: 42,
          checkoutUrl: "https://pancake.waffo.ai/store/newsletter-cover/checkout/CHK_shape_1",
          expiresAt: "2099-01-01T12:45:00.000Z",
        },
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    ),
  });
  await assert.rejects(
    () => provider.createCheckout({
      amountUsd: 5,
      listingId: "listing_shape_1",
      successUrl: "https://cover.example/checkout/complete?intent=intent_shape_1",
      cancelUrl: "https://cover.example/checkout/complete?intent=intent_shape_1",
      intentId: "intent_shape_1",
      intentFingerprint: "fingerprint_shape_1",
      metadata: {
        intentId: "intent_shape_1",
        intentFingerprint: "fingerprint_shape_1",
      },
    }),
    WaffoCheckoutAmbiguousError,
  );
});

test("hanging live checkout leaves its pre-network intent recoverable", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const provider = new LiveWaffo({
    env: { ...process.env, WAFFO_PRIVATE_KEY: PRIVATE_KEY },
    timeoutMs: 25,
    fetch: async () => await new Promise<never>(() => undefined),
  });
  const app = await buildApp({ polar: provider, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  await assert.rejects(
    () => startListingCheckout(app.db, provider, {
      sponsorUrl: "https://timeout-intent.example/cover",
      blurb: "Provider timeout remains recoverable",
      bidUsd: 5,
    }, FIXED_NOW),
    WaffoCheckoutAmbiguousError,
  );
  assert.deepEqual(
    app.db.prepare<[], { status: string; n: number }>(
      "SELECT status, COUNT(*) AS n FROM checkouts GROUP BY status",
    ).all(),
    [{ status: "unknown", n: 1 }],
  );
  assert.equal(paidCheckoutCount(app.db), 0);
});

test("explicit provider rejection is final; timeout/5xx stays unknown and has no rank", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const rejected = {
    kind: "waffo-test" as const,
    async createCheckout() {
      throw new WaffoProviderRejectedError("Waffo checkout rejected: invalid product", 400);
    },
  };
  const ambiguous = {
    kind: "waffo-test" as const,
    async createCheckout() {
      throw new WaffoCheckoutAmbiguousError("Waffo checkout outcome is ambiguous");
    },
  };
  const app = await buildApp({ polar: rejected });
  t.after(() => app.close());
  insertIssue(app.db);
  await assert.rejects(
    () => startListingCheckout(app.db, rejected, {
      sponsorUrl: "https://reject.example",
      blurb: "Provider rejection",
      bidUsd: 5,
    }, FIXED_NOW),
    /invalid product/,
  );
  const rejectedRow = app.db
    .prepare<[], { status: string }>("SELECT status FROM checkouts LIMIT 1")
    .get();
  assert.deepEqual(rejectedRow, { status: "rejected" });

  const appUnknown = await buildApp({ polar: ambiguous });
  t.after(() => appUnknown.close());
  insertIssue(appUnknown.db);
  const started = await assert.rejects(
    () => startListingCheckout(appUnknown.db, ambiguous, {
      sponsorUrl: "https://timeout.example",
      blurb: "Timeout is recoverable",
      bidUsd: 5,
    }, FIXED_NOW),
    WaffoCheckoutAmbiguousError,
  );
  assert.equal(started, undefined);
  const unknown = appUnknown.db
    .prepare<[], { status: string; n: number }>(
      "SELECT status, COUNT(*) AS n FROM checkouts GROUP BY status",
    )
    .all();
  assert.deepEqual(unknown, [{ status: "unknown", n: 1 }]);
  assert.equal(paidCheckoutCount(appUnknown.db), 0);
});

test("fixture checkout is explicit, unpaid until fixture completion, and return never settles", async (t) => {
  const app = await buildApp({ polar: new FixturePolar() });
  t.after(() => app.close());
  insertIssue(app.db);
  const started = await startListingCheckout(app.db, app.polar, {
    sponsorUrl: "https://fixture.example/cover",
    blurb: "Fixture only",
    bidUsd: MIN_BID_USD,
  }, FIXED_NOW);
  assert.equal(findCheckout(app.db, started.checkoutId)?.status, "pending");
  const returned = await app.inject({
    method: "GET",
    url: `/checkout/complete?intent=${started.checkoutId}`,
  });
  assert.equal(returned.statusCode, 200);
  assert.match(returned.headers["content-type"] ?? "", /text\/html/);
  assert.match(returned.body, /data-checkout-state="pending"/);
  assert.equal(paidCheckoutCount(app.db), 0);
  await completeCheckout(app.db, app.polar, started.polarCheckoutId, FIXED_NOW);
  assert.equal(paidCheckoutCount(app.db), 1);
});

test("signed order.completed settles an ambiguous intent from external id and exact metadata", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const ambiguous = {
    kind: "waffo-test" as const,
    async createCheckout() {
      throw new WaffoCheckoutAmbiguousError();
    },
  };
  const app = await buildApp({ polar: ambiguous, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  const input = {
    sponsorUrl: "https://signed.example/cover",
    blurb: "Signed Waffo completion",
    bidUsd: 5,
  };
  await assert.rejects(() => startListingCheckout(app.db, ambiguous, input, FIXED_NOW));
  const row = app.db.prepare<[], { id: string }>("SELECT id FROM checkouts LIMIT 1").get();
  assert.ok(row);
  const metadata = metadataFor(app, row.id);
  const body = completedBody({ deliveryId: "DEL_1", intentId: row.id, metadata });
  const response = await postEvent(app, body);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true, status: "paid", replay: false });
  assert.equal(paidCheckoutCount(app.db), 1);
  assert.equal(findCheckout(app.db, row.id)?.status, "paid");
  assert.deepEqual(
    app.db.prepare<[], { identity_type: string; outcome: string }>(
      `SELECT identity_type, outcome FROM waffo_identity_reservations
       ORDER BY identity_type`,
    ).all(),
    [
      { identity_type: "business_event", outcome: "accepted" },
      { identity_type: "delivery", outcome: "accepted" },
      { identity_type: "intent", outcome: "accepted" },
      { identity_type: "order", outcome: "accepted" },
      { identity_type: "payment", outcome: "accepted" },
    ],
  );
  const listing = findListingById(app.db, "missing");
  assert.equal(listing, null);
});

test("signed product metadata is required and bound to the immutable intent", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const provider = {
    kind: "waffo-test" as const,
    async createCheckout() {
      throw new WaffoCheckoutAmbiguousError();
    },
  };
  const app = await buildApp({ polar: provider, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  await assert.rejects(() => startListingCheckout(app.db, provider, {
    sponsorUrl: "https://wrong-product.example/cover",
    blurb: "Wrong signed product",
    bidUsd: 5,
  }, FIXED_NOW), WaffoCheckoutAmbiguousError);
  const first = app.db.prepare<[], { id: string }>("SELECT id FROM checkouts ORDER BY rowid LIMIT 1").get();
  assert.ok(first);
  const wrong = await postEvent(app, completedBody({
    deliveryId: "DEL_wrong_product",
    businessEventId: "PAY_wrong_product",
    paymentId: "PAY_wrong_product",
    orderId: "ORD_wrong_product",
    intentId: first.id,
    metadata: metadataFor(app, first.id),
    productId: PRODUCT_TWO,
  }));
  assert.equal(wrong.statusCode, 422);
  assert.deepEqual(wrong.json(), { error: "product_mismatch" });
  assert.equal(findCheckout(app.db, first.id)?.status, "rejected");

  await assert.rejects(() => startListingCheckout(app.db, provider, {
    sponsorUrl: "https://missing-product.example/cover",
    blurb: "Missing signed product",
    bidUsd: 5,
  }, FIXED_NOW));
  const second = app.db.prepare<[], { id: string }>("SELECT id FROM checkouts ORDER BY rowid DESC LIMIT 1").get();
  assert.ok(second);
  const missing = await postEvent(app, completedBody({
    deliveryId: "DEL_missing_product",
    businessEventId: "PAY_missing_product",
    paymentId: "PAY_missing_product",
    orderId: "ORD_missing_product",
    intentId: second.id,
    metadata: metadataFor(app, second.id),
    productId: null,
  }));
  assert.equal(missing.statusCode, 422);
  assert.deepEqual(missing.json(), { error: "product_mismatch" });
  assert.equal(findCheckout(app.db, second.id)?.status, "rejected");
  assert.equal(paidCheckoutCount(app.db), 0);
  assert.equal(
    app.db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM waffo_identity_reservations",
    ).get()?.n,
    10,
  );
});

test("config drift cannot change persisted product/store/mode facts", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const polar = {
    kind: "waffo-test" as const,
    async createCheckout() {
      throw new WaffoCheckoutAmbiguousError();
    },
  };
  const app = await buildApp({ polar, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  await assert.rejects(() => startListingCheckout(app.db, polar, {
    sponsorUrl: "https://drift.example",
    blurb: "Old product remains expected",
    bidUsd: 5,
  }, FIXED_NOW));
  const intent = app.db.prepare<[], { id: string }>("SELECT id FROM checkouts LIMIT 1").get();
  assert.ok(intent);
  const metadata = metadataFor(app, intent.id);
  process.env.WAFFO_PRODUCT_ID = PRODUCT_TWO;
  const response = await postEvent(
    app,
    completedBody({ deliveryId: "DEL_drift", intentId: intent.id, metadata }),
  );
  assert.equal(response.statusCode, 200);
  assert.equal(paidCheckoutCount(app.db), 1);
});

test("exact order replay under a new delivery id is a 2xx no-op; changed reuse is rejected and audited", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const polar = {
    kind: "waffo-test" as const,
    async createCheckout() {
      throw new WaffoCheckoutAmbiguousError();
    },
  };
  const app = await buildApp({ polar, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  await assert.rejects(() => startListingCheckout(app.db, polar, {
    sponsorUrl: "https://replay.example",
    blurb: "Replay order",
    bidUsd: 5,
  }, FIXED_NOW));
  const intent = app.db.prepare<[], { id: string }>("SELECT id FROM checkouts LIMIT 1").get();
  assert.ok(intent);
  const metadata = metadataFor(app, intent.id);
  const firstBody = completedBody({
    deliveryId: "DEL_original",
    businessEventId: "PAY_same",
    paymentId: "PAY_same",
    intentId: intent.id,
    metadata,
  });
  assert.equal((await postEvent(app, firstBody)).statusCode, 200);
  const replayBody = completedBody({
    deliveryId: "DEL_retry",
    businessEventId: "PAY_same",
    paymentId: "PAY_same",
    intentId: intent.id,
    metadata,
  });
  const replay = await postEvent(app, replayBody);
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(replay.json(), { ok: true, status: "paid", replay: true });
  const changedBody = completedBody({
    deliveryId: "DEL_changed",
    businessEventId: "PAY_same",
    paymentId: "PAY_same",
    intentId: intent.id,
    metadata,
    subtotal: "6.00",
    total: "6.00",
  });
  const changed = await postEvent(app, changedBody);
  assert.equal(changed.statusCode, 409);
  assert.deepEqual(changed.json(), { error: "identity_reuse" });
  assert.equal(paidCheckoutCount(app.db), 1);
  assert.equal(
    app.db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM waffo_webhook_events WHERE status = 'rejected'",
    ).get()?.n,
    1,
  );
  assert.ok(
    app.db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM waffo_identity_conflicts",
    ).get()?.n,
  );
  const sameDeliveryChanged = await postEvent(
    app,
    completedBody({
      deliveryId: "DEL_original",
      businessEventId: "PAY_same",
      paymentId: "PAY_same",
      intentId: intent.id,
      metadata,
      subtotal: "6.00",
      total: "6.00",
    }),
  );
  assert.equal(sameDeliveryChanged.statusCode, 409);
  assert.deepEqual(sameDeliveryChanged.json(), { error: "event_mismatch" });
  assert.equal(
    app.db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM waffo_webhook_events WHERE status = 'rejected'",
    ).get()?.n,
    2,
  );
  const exactAfterChanged = await postEvent(app, firstBody);
  assert.equal(exactAfterChanged.statusCode, 200);
  assert.deepEqual(exactAfterChanged.json(), { ok: true, status: "paid", replay: true });
});

test("rejected signed facts reserve identities and cannot be upgraded by a changed retry", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const provider = {
    kind: "waffo-test" as const,
    async createCheckout() {
      throw new WaffoCheckoutAmbiguousError();
    },
  };
  const app = await buildApp({ polar: provider, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  await assert.rejects(() => startListingCheckout(app.db, provider, {
    sponsorUrl: "https://rejected-replay.example",
    blurb: "Rejected replay stays rejected",
    bidUsd: 5,
  }, FIXED_NOW));
  const intent = app.db.prepare<[], { id: string }>("SELECT id FROM checkouts LIMIT 1").get();
  assert.ok(intent);
  const metadata = metadataFor(app, intent.id);
  const malformed = completedBody({
    deliveryId: "DEL_rejected_original",
    businessEventId: "PAY_rejected_replay",
    paymentId: "PAY_rejected_replay",
    orderId: "ORD_rejected_replay",
    intentId: intent.id,
    metadata,
    amount: "5.000",
    subtotal: "5.00",
    total: "5.00",
  });
  const first = await postEvent(app, malformed);
  assert.equal(first.statusCode, 422);
  assert.deepEqual(first.json(), { error: "amount_mismatch" });
  assert.equal(
    app.db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM waffo_identity_reservations",
    ).get()?.n,
    5,
  );

  const changed = await postEvent(app, completedBody({
    deliveryId: "DEL_rejected_changed",
    businessEventId: "PAY_rejected_replay",
    paymentId: "PAY_rejected_replay",
    orderId: "ORD_rejected_replay",
    intentId: intent.id,
    metadata,
    amount: "5.00",
    subtotal: "5.00",
    total: "5.00",
  }));
  assert.equal(changed.statusCode, 409);
  assert.deepEqual(changed.json(), { error: "identity_reuse" });
  assert.equal(paidCheckoutCount(app.db), 0);

  const exactRetry = await postEvent(app, malformed.replace(
    "DEL_rejected_original",
    "DEL_rejected_retry",
  ));
  assert.equal(exactRetry.statusCode, 422);
  assert.deepEqual(exactRetry.json(), { error: "amount_mismatch" });
  assert.equal(paidCheckoutCount(app.db), 0);
  assert.ok(
    (app.db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM waffo_identity_conflicts",
    ).get()?.n ?? 0) > 0,
  );
});

test("invalid signature, wrong facts, and non-completed events never rank", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const polar = new FixturePolar();
  const app = await buildApp({ polar });
  t.after(() => app.close());
  insertIssue(app.db);
  const started = await startListingCheckout(app.db, polar, {
    sponsorUrl: "https://negative.example",
    blurb: "Negative suite",
    bidUsd: 5,
  }, FIXED_NOW);
  const metadata = metadataFor(app, started.checkoutId);
  const valid = completedBody({ deliveryId: "DEL_negative", intentId: started.checkoutId, metadata });
  const invalid = await app.inject({
    method: "POST",
    url: "/webhooks/waffo",
    headers: { ...signedWaffoHeaders(valid), "x-waffo-signature": "t=1,v1=bad" },
    payload: valid,
  });
  assert.equal(invalid.statusCode, 401);
  const wrong = await postEvent(
    app,
    completedBody({
      deliveryId: "DEL_wrong",
      intentId: started.checkoutId,
      metadata,
      currency: "EUR",
    }),
  );
  assert.equal(wrong.statusCode, 422);
  const second = await startListingCheckout(app.db, polar, {
    sponsorUrl: "https://negative-second.example",
    blurb: "Negative second",
    bidUsd: 5,
  }, FIXED_NOW);
  const secondMetadata = metadataFor(app, second.checkoutId);
  const notCompleted = await postEvent(
    app,
    completedBody({
      deliveryId: "DEL_not_completed",
      businessEventId: "PAY_not_completed",
      orderId: "ORD_not_completed",
      paymentId: "PAY_not_completed",
      intentId: second.checkoutId,
      metadata: secondMetadata,
      paymentStatus: "failed",
    }),
  );
  assert.equal(notCompleted.statusCode, 422);
  assert.equal(paidCheckoutCount(app.db), 0);
});

test("webhook raw-body capture rejects content-length and chunked oversize before the ledger", async (t) => {
  const app = await buildApp({ polar: new FixturePolar(), now: FIXED_NOW });
  t.after(() => app.close());
  const oversized = JSON.stringify({ padding: "x".repeat(MAX_WAFFO_WEBHOOK_BODY_BYTES) });
  const declared = await app.inject({
    method: "POST",
    url: "/webhooks/waffo",
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(oversized)),
    },
    payload: "{}",
  });
  assert.equal(declared.statusCode, 413);

  const first = Buffer.alloc(Math.floor(MAX_WAFFO_WEBHOOK_BODY_BYTES / 2), 0x61);
  const second = Buffer.alloc(Math.ceil(MAX_WAFFO_WEBHOOK_BODY_BYTES / 2) + 1, 0x62);
  const chunked = await app.inject({
    method: "POST",
    url: "/webhooks/waffo",
    headers: { "content-type": "application/json" },
    payload: Readable.from([first, second]),
  });
  assert.equal(chunked.statusCode, 413);
  assert.equal(
    app.db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM waffo_webhook_events",
    ).get()?.n,
    0,
  );
});

test("provider event timestamp wins equal-bid ties even when delivery is delayed", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const polar = {
    kind: "waffo-test" as const,
    async createCheckout() {
      throw new WaffoCheckoutAmbiguousError();
    },
  };
  const app = await buildApp({ polar, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  await assert.rejects(() => startListingCheckout(app.db, polar, {
    sponsorUrl: "https://newer.example",
    blurb: "Delivered first",
    bidUsd: 10,
  }, FIXED_NOW));
  await assert.rejects(() => startListingCheckout(app.db, polar, {
    sponsorUrl: "https://older.example",
    blurb: "Paid earlier",
    bidUsd: 10,
  }, FIXED_NOW));
  const intents = app.db.prepare<[], { id: string; listing_id: string }>(
    "SELECT id, listing_id FROM checkouts ORDER BY rowid",
  ).all();
  assert.equal(intents.length, 2);
  const newer = metadataFor(app, intents[0]!.id);
  const older = metadataFor(app, intents[1]!.id);
  const newerBody = completedBody({
    deliveryId: "DEL_newer",
    businessEventId: "PAY_newer",
    intentId: intents[0]!.id,
    metadata: newer,
    orderId: "ORD_newer",
    paymentId: "PAY_newer",
    amount: "10.00",
    subtotal: "10.00",
    total: "10.00",
    timestamp: "2099-01-01T11:00:00.000Z",
  });
  const olderBody = completedBody({
    deliveryId: "DEL_older",
    businessEventId: "PAY_older",
    intentId: intents[1]!.id,
    metadata: older,
    orderId: "ORD_older",
    paymentId: "PAY_older",
    amount: "10.00",
    subtotal: "10.00",
    total: "10.00",
    timestamp: "2099-01-01T10:00:00.000Z",
  });
  const newerResponse = await postEvent(app, newerBody);
  const olderResponse = await postEvent(app, olderBody);
  assert.equal(newerResponse.statusCode, 200);
  assert.equal(olderResponse.statusCode, 200);
  const board = await app.inject({ method: "GET", url: "/", headers: { accept: "application/json" } });
  assert.equal(board.statusCode, 200);
  assert.equal(
    board.json().listings[0].id,
    intents[1]!.listing_id,
    JSON.stringify({ board: board.json().listings, intents }),
  );
});

test("stale captured raise is reconciled without adding its old difference twice", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const polar = new FixturePolar();
  const app = await buildApp({ polar });
  t.after(() => app.close());
  insertIssue(app.db);
  const first = await startListingCheckout(app.db, polar, {
    sponsorUrl: "https://raise.example",
    blurb: "First payment",
    bidUsd: 5,
  }, FIXED_NOW);
  await completeCheckout(app.db, polar, first.polarCheckoutId, FIXED_NOW);
  const raiseOne = await startListingCheckout(app.db, polar, {
    sponsorUrl: "https://raise.example",
    blurb: "Raise one",
    bidUsd: 12,
  }, FIXED_NOW);
  const raiseTwo = await startListingCheckout(app.db, polar, {
    sponsorUrl: "https://raise.example",
    blurb: "Raise two",
    bidUsd: 12,
  }, FIXED_NOW);
  const metadataOne = metadataFor(app, raiseOne.checkoutId);
  const metadataTwo = metadataFor(app, raiseTwo.checkoutId);
  const orderOne: VerifiedWaffoOrder = {
    deliveryId: "DEL_raise_one",
    businessEventId: "PAY_raise_one",
    eventType: "order.completed",
    eventTimestamp: "2099-01-01T11:00:00.000Z",
    mode: "test",
    storeId: STORE_ID,
    orderId: "ORD_raise_one",
    paymentId: "PAY_raise_one",
    orderStatus: "completed",
    paymentStatus: "succeeded",
    currency: "USD",
    productId: PRODUCT_ONE,
    amount: "7.00",
    taxAmount: "0.00",
    subtotal: "7.00",
    total: "7.00",
    orderMerchantExternalId: raiseOne.checkoutId,
    orderMetadata: metadataOne,
    payloadSha256: "hash-one",
    receivedAt: FIXED_NOW.toISOString(),
  };
  assert.equal(applyVerifiedWaffoOrder(app.db, orderOne, FIXED_NOW).reconciled, false);
  const orderTwo = { ...orderOne, deliveryId: "DEL_raise_two", businessEventId: "PAY_raise_two", orderId: "ORD_raise_two", paymentId: "PAY_raise_two", orderMerchantExternalId: raiseTwo.checkoutId, orderMetadata: metadataTwo, payloadSha256: "hash-two" };
  const second = applyVerifiedWaffoOrder(app.db, orderTwo, FIXED_NOW);
  assert.equal(second.reconciled, true);
  assert.equal(findListingById(app.db, metadataOne.listingId)?.bidUsd, 12);
  assert.equal(
    app.db.prepare<[string], { status: string }>("SELECT status FROM checkouts WHERE id = ?").get(raiseTwo.checkoutId)?.status,
    "needs_reconciliation",
  );
});

test("settlement rolls back the event, checkout, and cover mutation together", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const polar = new FixturePolar();
  const app = await buildApp({ polar });
  t.after(() => app.close());
  insertIssue(app.db);
  const started = await startListingCheckout(app.db, polar, {
    sponsorUrl: "https://rollback.example",
    blurb: "Forced atomic rollback",
    bidUsd: 5,
  }, FIXED_NOW);
  const metadata = metadataFor(app, started.checkoutId);
  app.db.exec(
    "CREATE TRIGGER fail_waffo_checkout_update BEFORE UPDATE OF status ON checkouts " +
      "BEGIN SELECT RAISE(ABORT, 'forced settlement rollback'); END;",
  );
  assert.throws(
    () => applyVerifiedWaffoOrder(app.db, {
      deliveryId: "DEL_rollback",
      businessEventId: "PAY_rollback",
      eventType: "order.completed",
      eventTimestamp: "2099-01-01T10:00:00.000Z",
      mode: "test",
      storeId: STORE_ID,
      orderId: "ORD_rollback",
      paymentId: "PAY_rollback",
      orderStatus: "completed",
      paymentStatus: "succeeded",
      currency: "USD",
      productId: PRODUCT_ONE,
      amount: "5.00",
      taxAmount: "0.00",
      subtotal: "5.00",
      total: "5.00",
      orderMerchantExternalId: started.checkoutId,
      orderMetadata: metadata,
      payloadSha256: "rollback-hash",
      receivedAt: FIXED_NOW.toISOString(),
    }, FIXED_NOW),
    /forced settlement rollback/,
  );
  assert.equal(findListingById(app.db, started.listingId)?.bidUsd, 0);
  assert.equal(findCheckout(app.db, started.checkoutId)?.status, "pending");
  assert.equal(
    app.db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM waffo_webhook_events",
    ).get()?.n,
    0,
  );
});

test("restart and two instances share the Waffo event ledger", async (t) => {
  const restore = setWaffoTestEnv();
  const directory = mkdtempSync(join(tmpdir(), "newsletter-waffo-"));
  const databasePath = join(directory, "cover.sqlite");
  const polar = new FixturePolar();
  const appOne = await buildApp({ databasePath, polar, now: FIXED_NOW });
  const appTwo = await buildApp({ databasePath, polar: new FixturePolar(), now: FIXED_NOW });
  t.after(async () => {
    await appTwo.close();
    await appOne.close();
    rmSync(directory, { recursive: true, force: true });
    restore();
  });
  insertIssue(appOne.db);
  const started = await startListingCheckout(appOne.db, polar, {
    sponsorUrl: "https://restart.example",
    blurb: "Durable event",
    bidUsd: 5,
  }, FIXED_NOW);
  const metadata = metadataFor(appOne, started.checkoutId);
  const body = completedBody({
    deliveryId: "DEL_restart",
    businessEventId: "PAY_restart",
    paymentId: "PAY_restart",
    intentId: started.checkoutId,
    metadata,
  });
  const [one, two] = await Promise.all([postEvent(appOne, body), postEvent(appTwo, body)]);
  assert.equal(one.statusCode, 200, JSON.stringify(one.json()));
  assert.equal(two.statusCode, 200, JSON.stringify(two.json()));
  assert.equal(paidCheckoutCount(appOne.db), 1);
  assert.equal(
    appOne.db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM waffo_webhook_events WHERE status = 'accepted'").get()?.n,
    1,
  );
});

test("metadata fingerprint helper is stable and excludes only its self-reference", () => {
  const base = {
    intentId: "intent",
    chargeCents: "500",
    targetBidCents: "500",
  };
  const fingerprint = intentFingerprintForMetadata(base);
  assert.equal(intentFingerprintForMetadata({ ...base, intentFingerprint: fingerprint }), fingerprint);
  assert.notEqual(intentFingerprintForMetadata({ ...base, chargeCents: "600" }), fingerprint);
});

test("signed order.completed requires eventId to equal data.paymentId", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const provider = {
    kind: "waffo-test" as const,
    async createCheckout() {
      throw new WaffoCheckoutAmbiguousError();
    },
  };
  const app = await buildApp({ polar: provider, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  await assert.rejects(() => startListingCheckout(app.db, provider, {
    sponsorUrl: "https://event-id.example",
    blurb: "Event id equality",
    bidUsd: 5,
  }, FIXED_NOW));
  const intent = app.db.prepare<[], { id: string }>("SELECT id FROM checkouts LIMIT 1").get();
  assert.ok(intent);
  const response = await postEvent(app, completedBody({
    deliveryId: "DEL_event_id_mismatch",
    businessEventId: "PAY_business_only",
    paymentId: "PAY_payment_only",
    orderId: "ORD_event_id_mismatch",
    intentId: intent.id,
    metadata: metadataFor(app, intent.id),
  }));
  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.json(), { error: "payment_event_mismatch" });
  assert.equal(paidCheckoutCount(app.db), 0);
  assert.equal(
    app.db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM waffo_identity_reservations",
    ).get()?.n,
    5,
  );
});

test("Waffo amount equations reject malformed facts and persist verified tax", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const provider = {
    kind: "waffo-test" as const,
    async createCheckout() {
      throw new WaffoCheckoutAmbiguousError();
    },
  };
  const app = await buildApp({ polar: provider, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  await assert.rejects(() => startListingCheckout(app.db, provider, {
    sponsorUrl: "https://amount-bad.example",
    blurb: "Bad amount equation",
    bidUsd: 5,
  }, FIXED_NOW));
  const bad = app.db.prepare<[], { id: string }>("SELECT id FROM checkouts ORDER BY rowid LIMIT 1").get();
  assert.ok(bad);
  const badResponse = await postEvent(app, completedBody({
    deliveryId: "DEL_amount_bad",
    businessEventId: "PAY_amount_bad",
    paymentId: "PAY_amount_bad",
    orderId: "ORD_amount_bad",
    intentId: bad.id,
    metadata: metadataFor(app, bad.id),
    amount: "5.000",
    taxAmount: "0.25",
    subtotal: "5.00",
    total: "5.25",
  }));
  assert.equal(badResponse.statusCode, 422);
  assert.deepEqual(badResponse.json(), { error: "amount_mismatch" });
  assert.equal(findCheckout(app.db, bad.id)?.status, "rejected");

  await assert.rejects(() => startListingCheckout(app.db, provider, {
    sponsorUrl: "https://amount-good.example",
    blurb: "Tax is a provider fact",
    bidUsd: 5,
  }, FIXED_NOW));
  const good = app.db.prepare<[], { id: string }>("SELECT id FROM checkouts ORDER BY rowid DESC LIMIT 1").get();
  assert.ok(good);
  const goodResponse = await postEvent(app, completedBody({
    deliveryId: "DEL_amount_good",
    businessEventId: "PAY_amount_good",
    paymentId: "PAY_amount_good",
    orderId: "ORD_amount_good",
    intentId: good.id,
    metadata: metadataFor(app, good.id),
    amount: "5.25",
    taxAmount: "0.25",
    subtotal: "5.00",
    total: "5.25",
  }));
  assert.equal(goodResponse.statusCode, 200);
  assert.deepEqual(goodResponse.json(), { ok: true, status: "paid", replay: false });
  assert.deepEqual(
    app.db.prepare<[string], {
      provider_amount_cents: number | null;
      provider_tax_cents: number | null;
      provider_subtotal_cents: number | null;
      provider_total_cents: number | null;
    }>(
      `SELECT provider_amount_cents, provider_tax_cents,
              provider_subtotal_cents, provider_total_cents
       FROM checkouts WHERE id = ?`,
    ).get(good.id),
    {
      provider_amount_cents: 525,
      provider_tax_cents: 25,
      provider_subtotal_cents: 500,
      provider_total_cents: 525,
    },
  );
});

test("tax-exclusive Waffo variants keep rank at subtotal and reconcile inconsistent captures", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const provider = {
    kind: "waffo-test" as const,
    async createCheckout() {
      throw new WaffoCheckoutAmbiguousError();
    },
  };
  const app = await buildApp({ polar: provider, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  const intents: Array<{ id: string; listingId: string }> = [];
  for (const [url, blurb] of [
    ["https://tax-exclusive.example", "Tax-exclusive amount"],
    ["https://tax-inclusive.example", "Tax-inclusive amount"],
    ["https://tax-optional-total.example", "Optional total"],
    ["https://tax-inconsistent.example", "Inconsistent capture"],
  ] as const) {
    await assert.rejects(() => startListingCheckout(app.db, provider, {
      sponsorUrl: url,
      blurb,
      bidUsd: 5,
    }, FIXED_NOW));
    const row = app.db.prepare<[], { id: string; listing_id: string }>(
      "SELECT id, listing_id FROM checkouts ORDER BY rowid DESC LIMIT 1",
    ).get();
    assert.ok(row);
    intents.push({ id: row.id, listingId: row.listing_id });
  }
  const first = await postEvent(app, completedBody({
    deliveryId: "DEL_tax_exclusive",
    businessEventId: "PAY_tax_exclusive",
    paymentId: "PAY_tax_exclusive",
    orderId: "ORD_tax_exclusive",
    intentId: intents[0]!.id,
    metadata: metadataFor(app, intents[0]!.id),
    amount: "5.00",
    taxAmount: "1.00",
    subtotal: "5.00",
    total: "6.00",
  }));
  assert.equal(first.statusCode, 200);
  assert.equal(findCheckout(app.db, intents[0]!.id)?.status, "paid");

  const second = await postEvent(app, completedBody({
    deliveryId: "DEL_tax_inclusive",
    businessEventId: "PAY_tax_inclusive",
    paymentId: "PAY_tax_inclusive",
    orderId: "ORD_tax_inclusive",
    intentId: intents[1]!.id,
    metadata: metadataFor(app, intents[1]!.id),
    amount: "6.00",
    taxAmount: "1.00",
    subtotal: "5.00",
    total: "6.00",
  }));
  assert.equal(second.statusCode, 200);
  assert.equal(findCheckout(app.db, intents[1]!.id)?.status, "paid");

  const optionalTotal = await postEvent(app, completedBody({
    deliveryId: "DEL_tax_optional_total",
    businessEventId: "PAY_tax_optional_total",
    paymentId: "PAY_tax_optional_total",
    orderId: "ORD_tax_optional_total",
    intentId: intents[2]!.id,
    metadata: metadataFor(app, intents[2]!.id),
    amount: "5.00",
    taxAmount: "1.00",
    subtotal: "5.00",
    total: null,
  }));
  assert.equal(optionalTotal.statusCode, 200);
  assert.equal(findCheckout(app.db, intents[2]!.id)?.status, "paid");

  const inconsistent = await postEvent(app, completedBody({
    deliveryId: "DEL_tax_inconsistent",
    businessEventId: "PAY_tax_inconsistent",
    paymentId: "PAY_tax_inconsistent",
    orderId: "ORD_tax_inconsistent",
    intentId: intents[3]!.id,
    metadata: metadataFor(app, intents[3]!.id),
    amount: "7.00",
    taxAmount: "1.00",
    subtotal: "5.00",
    total: "7.00",
  }));
  assert.equal(inconsistent.statusCode, 200);
  assert.deepEqual(inconsistent.json(), {
    ok: true,
    status: "needs_reconciliation",
    replay: false,
  });
  assert.equal(findCheckout(app.db, intents[3]!.id)?.status, "needs_reconciliation");
  assert.equal(findListingById(app.db, intents[3]!.listingId)?.bidUsd, 0);
  assert.equal(paidCheckoutCount(app.db), 3);
});

test("future and stale provider timestamps enter durable reconciliation", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const provider = {
    kind: "waffo-test" as const,
    async createCheckout() {
      throw new WaffoCheckoutAmbiguousError();
    },
  };
  const app = await buildApp({ polar: provider, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  for (const [url, blurb] of [
    ["https://future-event.example", "Future event"],
    ["https://stale-event.example", "Stale event"],
    ["https://malformed-event.example", "Malformed event"],
  ] as const) {
    await assert.rejects(() => startListingCheckout(app.db, provider, {
      sponsorUrl: url,
      blurb,
      bidUsd: 5,
    }, FIXED_NOW));
  }
  const intents = app.db.prepare<[], { id: string }>("SELECT id FROM checkouts ORDER BY rowid").all();
  const future = await postEvent(app, completedBody({
    deliveryId: "DEL_future_event",
    businessEventId: "PAY_future_event",
    paymentId: "PAY_future_event",
    orderId: "ORD_future_event",
    intentId: intents[0]!.id,
    metadata: metadataFor(app, intents[0]!.id),
    timestamp: "2099-01-01T12:02:00.000Z",
  }));
  const stale = await postEvent(app, completedBody({
    deliveryId: "DEL_stale_event",
    businessEventId: "PAY_stale_event",
    paymentId: "PAY_stale_event",
    orderId: "ORD_stale_event",
    intentId: intents[1]!.id,
    metadata: metadataFor(app, intents[1]!.id),
    timestamp: "2098-12-23T12:00:00.000Z",
  }));
  const malformed = await postEvent(app, completedBody({
    deliveryId: "DEL_malformed_event",
    businessEventId: "PAY_malformed_event",
    paymentId: "PAY_malformed_event",
    orderId: "ORD_malformed_event",
    intentId: intents[2]!.id,
    metadata: metadataFor(app, intents[2]!.id),
    timestamp: "2099-02-31T12:00:00.000Z",
  }));
  assert.equal(future.statusCode, 200);
  assert.equal(stale.statusCode, 200);
  assert.equal(malformed.statusCode, 422);
  assert.deepEqual(future.json(), { ok: true, status: "needs_reconciliation", replay: false });
  assert.deepEqual(stale.json(), { ok: true, status: "needs_reconciliation", replay: false });
  assert.deepEqual(malformed.json(), { error: "event_mismatch" });
  assert.equal(paidCheckoutCount(app.db), 0);
  assert.deepEqual(
    app.db.prepare<[], { error_code: string; status: string }>(
      `SELECT error_code, status FROM waffo_webhook_events
       WHERE status = 'needs_reconciliation' ORDER BY delivery_id`,
    ).all(),
    [
      { error_code: "event_timestamp_future", status: "needs_reconciliation" },
      { error_code: "event_timestamp_stale", status: "needs_reconciliation" },
    ],
  );
});

test("Waffo config and hosted checkout facts are origin- and expiry-checked", async (t) => {
  const validProduction = {
    NODE_ENV: "production",
    WAFFO_MODE: "waffo-prod",
    WAFFO_MERCHANT_ID: MERCHANT_ID,
    WAFFO_PRIVATE_KEY: PRIVATE_KEY,
    WAFFO_STORE_ID: STORE_ID,
    WAFFO_PRODUCT_ID: PRODUCT_ONE,
    WAFFO_WEBHOOK_PROD_PUBLIC_KEY: PUBLIC_KEY,
    PUBLIC_BASE_URL: "https://newsletter-cover.com",
    DATABASE_PATH: "/tmp/newsletter-cover-config.sqlite",
  };
  assert.equal(
    validateWaffoApiOrigin("https://waffo.example.test", "waffo-test"),
    "https://waffo.example.test",
  );
  assert.throws(
    () => validateWaffoApiOrigin("https://waffo.example.test", "waffo-prod"),
    /api\.waffo\.ai/,
  );
  assert.throws(
    () => validateWaffoPublicOrigin("https://cover.example/checkout", "waffo-prod"),
    /origin/,
  );
  for (const url of [
    "http://localhost",
    "https://localhost.",
    "https://127.0.0.1",
    "https://127.0.0.1.",
    "https://2130706433",
    "https://0x7f000001",
    "https://10.0.0.1",
    "https://100.64.0.1",
    "https://169.254.1.1",
    "https://172.16.0.1",
    "https://192.0.2.1",
    "https://192.31.196.1",
    "https://192.52.193.1",
    "https://192.168.1.1",
    "https://192.175.48.1",
    "https://198.18.0.1",
    "https://198.51.100.1",
    "https://203.0.113.1",
    "https://224.0.0.1",
    "https://240.0.0.1",
    "https://999.999.999.999",
    "https://9999999999",
    "https://[::1]",
    "https://[::ffff:127.0.0.1]",
    "https://[2001:db8::1]",
    "https://cover.local",
    "https://cover.test",
    "https://cover.invalid",
    "https://cover.example",
    "https://example.com",
    "https://example.net",
    "https://example.org",
    "https://example.edu",
    "https://cover.example.com",
    "https://Cover.Example.org.",
    "https://%6cocalhost",
  ]) {
    assert.throws(
      () => validateWaffoPublicOrigin(url, "waffo-prod"),
      /PUBLIC_BASE_URL/,
      url,
    );
  }
  assert.equal(
    validateWaffoPublicOrigin("https://Cover.Newsletter-Cover.com.", "waffo-prod"),
    "https://cover.newsletter-cover.com",
  );
  assert.throws(
    () => assertWaffoRuntimeConfig({
      ...validProduction,
      WAFFO_API_BASE: "https://evil.example",
    }),
    /api\.waffo\.ai/,
  );
  assert.throws(
    () => assertWaffoRuntimeConfig({
      ...validProduction,
      PUBLIC_BASE_URL: "https://cover.example/path",
    }),
    /origin/,
  );
  for (const [name, value] of [
    ["WAFFO_MERCHANT_ID", "merchant"],
    ["WAFFO_STORE_ID", "store"],
    ["WAFFO_PRODUCT_ID", "product"],
  ] as const) {
    assert.throws(
      () => assertWaffoRuntimeConfig({ ...validProduction, [name]: value }),
      new RegExp(name),
    );
  }
  assert.throws(
    () => assertWaffoRuntimeConfig({
      ...validProduction,
      WAFFO_WEBHOOK_PROD_PUBLIC_KEY: "not-an-rsa-key",
    }),
    /RSA public key/,
  );
  for (const databasePath of [
    ":memory:",
    "file::memory:?cache=shared",
    "file:memdb1?mode=memory&cache=shared",
    "file:///tmp/cover.sqlite?mode=memory",
  ]) {
    assert.equal(isEphemeralDatabasePath(databasePath), true, databasePath);
    assert.throws(
      () => assertWaffoRuntimeConfig({ ...validProduction, DATABASE_PATH: databasePath }),
      /DATABASE_PATH must be durable/,
    );
  }
  assert.equal(isEphemeralDatabasePath("/tmp/cover.sqlite"), false);
  assert.equal(
    validateWaffoCheckoutUrl("https://pancake.waffo.ai/store/newsletter-cover/checkout/session_1", "session_1"),
    "https://pancake.waffo.ai/store/newsletter-cover/checkout/session_1",
  );
  for (const url of [
    "https://waffo.ai/store/newsletter-cover/checkout/session_1",
    "https://attacker.waffo.ai/store/newsletter-cover/checkout/session_1",
    "https://pancake.waffo.ai/not-a-checkout/session_1",
    "https://pancake.waffo.ai/store/newsletter-cover/not-checkout/session_1",
    "https://pancake.waffo.ai:443/store/newsletter-cover/checkout/session_1",
    "https://user:pass@pancake.waffo.ai/store/newsletter-cover/checkout/session_1",
    "https://pancake.waffo.ai/store/newsletter-cover/checkout/session_%ZZ",
    "https://pancake.waffo.ai/store/newsletter-cover/checkout/session%2F1",
  ]) {
    assert.throws(() => validateWaffoCheckoutUrl(url), WaffoCheckoutAmbiguousError, url);
  }
  assert.throws(
    () => validateWaffoCheckoutUrl(
      "https://pancake.waffo.ai/store/newsletter-cover/checkout/session_1",
      "other-session",
    ),
    WaffoCheckoutAmbiguousError,
  );
  assert.throws(
    () => validateWaffoCheckoutUrl("https://checkout.evil.example/session_1"),
    WaffoCheckoutAmbiguousError,
  );
  assert.equal(
    validateWaffoExpiry("2099-01-01T12:05:00.000Z", FIXED_NOW),
    "2099-01-01T12:05:00.000Z",
  );
  assert.throws(
    () => validateWaffoExpiry("2099-01-01T11:59:00.000Z", FIXED_NOW),
    WaffoCheckoutAmbiguousError,
  );
  assert.throws(
    () => validateWaffoExpiry("2099-02-31T12:05:00.000Z", FIXED_NOW),
    WaffoCheckoutAmbiguousError,
  );
  assert.throws(
    () => validateWaffoExpiry("not-a-date", FIXED_NOW),
    WaffoCheckoutAmbiguousError,
  );
  t.after(() => undefined);
});

test("production-like build rejects injected fixture and in-memory database", async (t) => {
  const restore = setEnv({
    NODE_ENV: "production",
    WAFFO_MODE: "fixture",
    DATABASE_PATH: ":memory:",
  });
  t.after(restore);
  await assert.rejects(
    () => buildApp({ polar: new FixturePolar() }),
    /injected provider is not allowed in production/,
  );
  await assert.rejects(
    () => buildApp({ databasePath: ":memory:" }),
    /DATABASE_PATH must be durable/,
  );
});

test("validated Waffo checkout URL and expiry attach to the immutable intent", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const provider = {
    kind: "waffo-test" as const,
    async createCheckout() {
      return {
        checkoutId: "waffo-session-attach",
        url: "https://pancake.waffo.ai/store/newsletter-cover/checkout/waffo-session-attach",
        expiresAt: "2099-01-01T12:05:00.000Z",
      };
    },
  };
  const app = await buildApp({ polar: provider, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  const started = await startListingCheckout(app.db, provider, {
    sponsorUrl: "https://attach.example",
    blurb: "Durable checkout link",
    bidUsd: 5,
  }, FIXED_NOW);
  assert.equal(started.url, "https://pancake.waffo.ai/store/newsletter-cover/checkout/waffo-session-attach");
  assert.deepEqual(
    app.db.prepare<[string], { checkout_url: string | null; checkout_expires_at: string | null }>(
      "SELECT checkout_url, checkout_expires_at FROM checkouts WHERE id = ?",
    ).get(started.checkoutId),
    {
      checkout_url: "https://pancake.waffo.ai/store/newsletter-cover/checkout/waffo-session-attach",
      checkout_expires_at: "2099-01-01T12:05:00.000Z",
    },
  );
});

test("provider response attach preserves concurrent paid and reconciliation outcomes", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);

  async function runRace(
    suffix: string,
    eventTimestamp: string,
    expectedStatus: "paid" | "needs_reconciliation",
  ): Promise<void> {
    let providerStarted!: () => void;
    let releaseProvider!: (checkout: {
      checkoutId: string;
      url: string;
      expiresAt: string;
    }) => void;
    const providerStartedPromise = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    const providerResponse = new Promise<{
      checkoutId: string;
      url: string;
      expiresAt: string;
    }>((resolve) => {
      releaseProvider = resolve;
    });
    const providerId = `CHK_${suffix}`;
    const provider = {
      kind: "waffo-test" as const,
      async createCheckout() {
        providerStarted();
        return providerResponse;
      },
    };
    const app = await buildApp({ polar: provider, now: FIXED_NOW });
    t.after(() => app.close());
    insertIssue(app.db);
    const starting = startListingCheckout(app.db, provider, {
      sponsorUrl: `https://${suffix}.example/cover`,
      blurb: `Attach race ${suffix}`,
      bidUsd: 5,
    }, FIXED_NOW);
    await providerStartedPromise;
    const intent = app.db.prepare<[], { id: string }>(
      "SELECT id FROM checkouts LIMIT 1",
    ).get();
    assert.ok(intent);
    const settlement = await postEvent(app, completedBody({
      deliveryId: `DEL_attach_${suffix}`,
      businessEventId: `PAY_attach_${suffix}`,
      paymentId: `PAY_attach_${suffix}`,
      orderId: `ORD_attach_${suffix}`,
      intentId: intent.id,
      metadata: metadataFor(app, intent.id),
      timestamp: eventTimestamp,
    }));
    assert.equal(settlement.statusCode, 200);
    assert.deepEqual(settlement.json(), {
      ok: true,
      status: expectedStatus,
      replay: false,
    });
    releaseProvider({
      checkoutId: providerId,
      url: `https://pancake.waffo.ai/store/newsletter-cover/checkout/${providerId}`,
      expiresAt: "2099-01-01T12:05:00.000Z",
    });
    const started = await starting;
    assert.equal(started.polarCheckoutId, providerId);
    assert.deepEqual(
      app.db.prepare<[], { status: string; polar_checkout_id: string }>(
        "SELECT status, polar_checkout_id FROM checkouts WHERE id = (SELECT id FROM checkouts LIMIT 1)",
      ).get(),
      { status: expectedStatus, polar_checkout_id: providerId },
    );
  }

  await runRace("paid_attach_race", "2099-01-01T10:00:00.000Z", "paid");
  await runRace("reconcile_attach_race", "2098-12-20T12:00:00.000Z", "needs_reconciliation");
});

test("attached Waffo checkout facts survive a database restart", async (t) => {
  const restore = setWaffoTestEnv();
  const directory = mkdtempSync(join(tmpdir(), "newsletter-waffo-attach-"));
  const databasePath = join(directory, "cover.sqlite");
  const provider = {
    kind: "waffo-test" as const,
    async createCheckout() {
      return {
        checkoutId: "waffo-session-restart",
        url: "https://pancake.waffo.ai/store/newsletter-cover/checkout/waffo-session-restart",
        expiresAt: "2099-01-01T12:05:00.000Z",
      };
    },
  };
  const app = await buildApp({ databasePath, polar: provider, now: FIXED_NOW });
  insertIssue(app.db);
  const started = await startListingCheckout(app.db, provider, {
    sponsorUrl: "https://attach-restart.example",
    blurb: "Restart keeps the cashier link",
    bidUsd: 5,
  }, FIXED_NOW);
  await app.close();

  const restarted = await buildApp({ databasePath, polar: provider, now: FIXED_NOW });
  t.after(async () => {
    await restarted.close();
    rmSync(directory, { recursive: true, force: true });
    restore();
  });
  assert.deepEqual(
    restarted.db.prepare<[string], {
      polar_checkout_id: string;
      checkout_url: string | null;
      checkout_expires_at: string | null;
      status: string;
    }>(
      `SELECT polar_checkout_id, checkout_url, checkout_expires_at, status
       FROM checkouts WHERE id = ?`,
    ).get(started.checkoutId),
    {
      polar_checkout_id: "waffo-session-restart",
      checkout_url: "https://pancake.waffo.ai/store/newsletter-cover/checkout/waffo-session-restart",
      checkout_expires_at: "2099-01-01T12:05:00.000Z",
      status: "open",
    },
  );
});

test("invalid live checkout response remains unknown and Polar webhook is inert", async (t) => {
  const restore = setWaffoTestEnv();
  t.after(restore);
  const invalidProvider = {
    kind: "waffo-test" as const,
    async createCheckout() {
      return {
        checkoutId: "waffo-session-invalid",
        url: "https://evil.example/checkout/waffo-session-invalid",
        expiresAt: "2099-01-01T12:05:00.000Z",
      };
    },
  };
  const app = await buildApp({ polar: invalidProvider, now: FIXED_NOW });
  t.after(() => app.close());
  insertIssue(app.db);
  await assert.rejects(
    () => startListingCheckout(app.db, invalidProvider, {
      sponsorUrl: "https://invalid-response.example",
      blurb: "Invalid checkout response",
      bidUsd: 5,
    }, FIXED_NOW),
    WaffoCheckoutAmbiguousError,
  );
  assert.equal(
    app.db.prepare<[], { status: string }>("SELECT status FROM checkouts LIMIT 1").get()?.status,
    "unknown",
  );
  const retired = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    payload: "{}",
    headers: { "content-type": "application/json" },
  });
  assert.equal(retired.statusCode, 410);
  assert.deepEqual(retired.json(), { error: "polar_webhook_retired" });
  assert.equal(
    app.db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM waffo_webhook_events").get()?.n,
    0,
  );
});
