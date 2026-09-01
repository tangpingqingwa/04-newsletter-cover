import { createHash, randomUUID } from "node:crypto";
import type { AppDb, Checkout } from "../db.js";
import { catchUpIssues } from "../issues.js";
import {
  applyPaidBid,
  createListing,
  findListingById,
  findListingByUrlAndIssue,
  ListingError,
  MAX_BID_USD,
  MIN_BID_USD,
  openIssueDate,
  parseBidUsd,
  parseCreateListingBody,
  quoteListingBid,
} from "../listings.js";
import { FixtureWaffo } from "./fixture.js";
import {
  assertWaffoRuntimeConfig,
  isEphemeralDatabasePath,
  LiveWaffo,
  WaffoCheckoutAmbiguousError,
  WaffoProviderRejectedError,
  waffoEnvironment,
  waffoMode,
  waffoProductId,
  waffoPublicBaseUrl,
  waffoStoreId,
  validateWaffoCheckoutUrl,
  validateWaffoExpiry,
  validateWaffoPublicOrigin,
} from "./waffo.js";
import type { CreateCheckoutInput, WaffoPort } from "./port.js";

export { findListingById, MAX_BID_USD, MIN_BID_USD, parseBidUsd };
export {
  assertWaffoRuntimeConfig,
  isEphemeralDatabasePath,
  waffoEnvironment,
  waffoMode,
  waffoProductId,
  waffoPublicBaseUrl,
  waffoStoreId,
};
export type { WaffoPort };

export type StartedCheckout = {
  url: string;
  checkoutId: string;
  /** Compatibility field; it contains the Waffo session id. */
  polarCheckoutId: string;
  listingId: string;
  amountUsd: number;
  targetBidUsd: number;
};

type CheckoutStatus =
  | Checkout["status"]
  | "creating"
  | "open"
  | "unknown"
  | "pending_unknown"
  | "rejected"
  | "needs_reconciliation";

type CheckoutIntentRow = {
  id: string;
  listing_id: string;
  amount_usd: number;
  target_bid_usd: number;
  polar_checkout_id: string;
  status: string;
  board_key: string;
  canonical_url: string;
  blurb: string;
  quote_base_bid_cents: number;
  target_bid_cents: number;
  charge_cents: number;
  expected_store_id: string;
  expected_product_id: string;
  expected_mode: string;
  expected_currency: string;
  expected_tax_category: string;
  metadata_json: string;
  intent_fingerprint: string;
  created_at: string;
  updated_at: string;
  checkout_expires_at: string | null;
  checkout_url: string | null;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  last_event_id: string | null;
  provider_amount_cents: number | null;
  provider_tax_cents: number | null;
  provider_subtotal_cents: number | null;
  provider_total_cents: number | null;
};

type WaffoWebhookEventRow = {
  delivery_id: string;
  event_type: string;
  business_event_id: string;
  payment_id: string | null;
  order_id: string | null;
  intent_id: string | null;
  store_id: string | null;
  mode: string | null;
  event_timestamp: string | null;
  status: "accepted" | "rejected" | "needs_reconciliation";
  error_code: string | null;
  reason: string | null;
  payload_sha256: string;
  event_fingerprint: string;
  metadata_json: string | null;
  received_at: string;
  amount_cents: number | null;
  tax_cents: number | null;
  subtotal_cents: number | null;
  total_cents: number | null;
};

/** Values extracted only after Waffo's RSA webhook signature is valid. */
export type VerifiedWaffoOrder = {
  deliveryId: string;
  businessEventId: string;
  /** Untrusted after signature verification; only order.completed settles. */
  eventType: string;
  eventTimestamp: string;
  mode: "test" | "prod" | string;
  storeId: string;
  orderId: string;
  paymentId: string;
  orderStatus: string;
  paymentStatus: string;
  currency: string;
  /** Product identity copied from signed Waffo product metadata. */
  productId: string;
  amount: string;
  taxAmount: string;
  subtotal?: string;
  total?: string;
  orderMerchantExternalId: string;
  orderMetadata: Record<string, string>;
  payloadSha256: string;
  eventFingerprint?: string;
  /** Parsed event without the delivery id, used for delivery-independent replay. */
  eventSnapshot?: Record<string, unknown>;
  receivedAt: string;
};

/** Compatibility name for callers that still import the former provider type. */
export type VerifiedPolarOrder = VerifiedWaffoOrder;

export type VerifiedWaffoOrderResult = {
  checkout: Checkout;
  replay: boolean;
  reconciled: boolean;
};

export type VerifiedPolarOrderResult = VerifiedWaffoOrderResult;

const PROVISIONAL_PROVIDER_PREFIX = "local:";
const WEBHOOK_RESERVATION_CODE = "__processing__";
const DEFAULT_FIXTURE_STORE = "fixture-store";
const DEFAULT_FIXTURE_PRODUCT = "fixture-product";
const DEFAULT_FIXTURE_MODE = "fixture";
const DIGITAL_GOODS_TAX_CATEGORY = "digital_goods";

function provisionalProviderCheckoutId(intentId: string): string {
  return `${PROVISIONAL_PROVIDER_PREFIX}${intentId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite value in canonical JSON");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("unsupported value in canonical JSON");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function metadataWithoutFingerprint(metadata: Record<string, string>): Record<string, string> {
  const copy = { ...metadata };
  delete copy.intentFingerprint;
  return copy;
}

export function intentFingerprintForMetadata(
  metadata: Record<string, string>,
): string {
  return sha256(canonicalJson(metadataWithoutFingerprint(metadata)));
}

export function eventFingerprintForWaffoOrder(
  order: Pick<
    VerifiedWaffoOrder,
    | "businessEventId"
    | "eventType"
    | "eventTimestamp"
    | "mode"
    | "storeId"
    | "orderId"
    | "paymentId"
    | "orderStatus"
    | "paymentStatus"
    | "currency"
    | "productId"
    | "amount"
    | "taxAmount"
    | "subtotal"
    | "total"
    | "orderMerchantExternalId"
    | "orderMetadata"
  > & { eventSnapshot?: Record<string, unknown> },
): string {
  if (order.eventSnapshot) {
    const snapshot = { ...order.eventSnapshot };
    delete snapshot.id;
    return sha256(canonicalJson(snapshot));
  }
  const data: Record<string, unknown> = {
    orderId: order.orderId,
    paymentId: order.paymentId,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    currency: order.currency,
    productId: order.productId,
    amount: order.amount,
    taxAmount: order.taxAmount,
    subtotal: order.subtotal,
    total: order.total,
    orderMerchantExternalId: order.orderMerchantExternalId,
    orderMetadata: order.orderMetadata,
  };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) delete data[key];
  }
  return sha256(
    canonicalJson({
      eventType: order.eventType,
      eventId: order.businessEventId,
      timestamp: order.eventTimestamp,
      mode: order.mode,
      storeId: order.storeId,
      data,
    }),
  );
}

function checkoutFromRow(row: CheckoutIntentRow): Checkout {
  return {
    id: row.id,
    listingId: row.listing_id,
    amountUsd: row.amount_usd,
    targetBidUsd: row.target_bid_usd,
    polarCheckoutId: row.polar_checkout_id,
    // Runtime rows may contain the richer Waffo states added by migration 005.
    status: row.status as Checkout["status"],
  };
}

function selectIntentSql(where: string): string {
  return `SELECT id, listing_id, amount_usd, target_bid_usd, polar_checkout_id, status,
                 board_key, canonical_url, blurb, quote_base_bid_cents,
                 target_bid_cents, charge_cents, expected_store_id,
                 expected_product_id, expected_mode, expected_currency,
                 expected_tax_category, metadata_json, intent_fingerprint,
                 created_at, updated_at, checkout_expires_at,
                 checkout_url, provider_order_id, provider_payment_id,
                 last_event_id, provider_amount_cents, provider_tax_cents,
                 provider_subtotal_cents, provider_total_cents
          FROM checkouts
          WHERE ${where}`;
}

function findIntentByLocalId(db: AppDb, intentId: string): CheckoutIntentRow | null {
  return (
    db.prepare<[string], CheckoutIntentRow>(selectIntentSql("id = ?")).get(intentId) ??
    null
  );
}

export function findCheckout(db: AppDb, checkoutId: string): Checkout | null {
  const row = db
    .prepare<[string, string], CheckoutIntentRow>(
      selectIntentSql("id = ? OR polar_checkout_id = ?"),
    )
    .get(checkoutId, checkoutId);
  return row ? checkoutFromRow(row) : null;
}

/** Read-only state projection used by the browser return page. */
export type CheckoutStateView = {
  id: string;
  status: CheckoutStatus;
  amountUsd: number;
  targetBidUsd: number;
  checkoutExpiresAt: string | null;
};

export function findCheckoutState(
  db: AppDb,
  identifier: string,
): CheckoutStateView | null {
  const row = db
    .prepare<[string, string], CheckoutIntentRow>(
      selectIntentSql("id = ? OR polar_checkout_id = ?"),
    )
    .get(identifier, identifier);
  return row
    ? {
        id: row.id,
        status: currentStatus(row),
        amountUsd: row.amount_usd,
        targetBidUsd: row.target_bid_usd,
        checkoutExpiresAt: row.checkout_expires_at,
      }
    : null;
}

function currentStatus(row: CheckoutIntentRow): CheckoutStatus {
  return row.status as CheckoutStatus;
}

function findWaffoEvent(
  db: AppDb,
  deliveryId: string,
): WaffoWebhookEventRow | null {
  return (
    db
      .prepare<[string], WaffoWebhookEventRow>(
        `SELECT delivery_id, event_type, business_event_id, payment_id,
                order_id, intent_id, store_id, mode, event_timestamp, status,
                error_code, reason, payload_sha256, event_fingerprint,
                metadata_json, received_at, amount_cents, tax_cents,
                subtotal_cents, total_cents
         FROM waffo_webhook_events WHERE delivery_id = ?`,
      )
      .get(deliveryId) ?? null
  );
}

function findWaffoEventsBy(
  db: AppDb,
  column: "business_event_id" | "payment_id" | "order_id" | "intent_id",
  value: string,
): WaffoWebhookEventRow[] {
  return db
    .prepare<[string], WaffoWebhookEventRow>(
      `SELECT delivery_id, event_type, business_event_id, payment_id,
              order_id, intent_id, store_id, mode, event_timestamp, status,
              error_code, reason, payload_sha256, event_fingerprint,
              metadata_json, received_at, amount_cents, tax_cents,
              subtotal_cents, total_cents
       FROM waffo_webhook_events
       WHERE ${column} = ?
       ORDER BY received_at ASC, delivery_id ASC`,
    )
    .all(value);
}

function insertWaffoEvent(
  db: AppDb,
  order: VerifiedWaffoOrder,
  status: "accepted" | "rejected" | "needs_reconciliation",
  errorCode: string | null,
  reason: string | null,
  eventFingerprint: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO waffo_webhook_events
       (delivery_id, event_type, business_event_id, payment_id, order_id,
        intent_id, store_id, mode, event_timestamp, status, error_code, reason,
        payload_sha256, event_fingerprint, metadata_json, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    order.deliveryId,
    order.eventType,
    order.businessEventId,
    order.paymentId || null,
    order.orderId || null,
    order.orderMerchantExternalId || null,
    order.storeId || null,
    order.mode || null,
    order.eventTimestamp || null,
    status,
    errorCode,
    reason,
    order.payloadSha256,
    eventFingerprint,
    canonicalJson(order.orderMetadata),
    order.receivedAt,
  );
}

type WaffoIdentity = {
  type: "delivery" | "business_event" | "payment" | "order" | "intent";
  value: string;
};

function waffoIdentities(order: VerifiedWaffoOrder): WaffoIdentity[] {
  const identities: WaffoIdentity[] = [];
  if (order.deliveryId) identities.push({ type: "delivery", value: order.deliveryId });
  if (order.businessEventId) {
    identities.push({
      type: "business_event",
      value: `${order.eventType}:${order.businessEventId}`,
    });
  }
  if (order.paymentId) identities.push({ type: "payment", value: order.paymentId });
  if (order.orderId) identities.push({ type: "order", value: order.orderId });
  if (order.orderMerchantExternalId) {
    identities.push({ type: "intent", value: order.orderMerchantExternalId });
  }
  return identities;
}

type WaffoIdentityReservationRow = {
  identity_type: WaffoIdentity["type"];
  identity_value: string;
  delivery_id: string;
  event_type: string;
  payload_sha256: string;
  event_fingerprint: string;
  outcome: "accepted" | "rejected" | "needs_reconciliation";
  reserved_at: string;
};

function recordIdentityConflict(
  db: AppDb,
  identity: WaffoIdentity,
  existing: WaffoIdentityReservationRow,
  order: VerifiedWaffoOrder,
  eventFingerprint: string,
  reason: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO waffo_identity_conflicts
       (conflict_id, identity_type, identity_value, existing_delivery_id,
        incoming_delivery_id, existing_payload_sha256, incoming_payload_sha256,
        existing_event_fingerprint, incoming_event_fingerprint, reason, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    identity.type,
    identity.value,
    existing.delivery_id,
    order.deliveryId,
    existing.payload_sha256,
    order.payloadSha256,
    existing.event_fingerprint,
    eventFingerprint,
    reason,
    order.receivedAt,
  );
}

/**
 * Reserve all canonical identities before an accepted/reconciliation outcome
 * can commit. Existing identical fingerprints are harmless retries; changed
 * facts are retained in a separate conflict audit and cannot settle.
 */
function reserveWaffoIdentities(
  db: AppDb,
  order: VerifiedWaffoOrder,
  outcome: "accepted" | "rejected" | "needs_reconciliation",
  eventFingerprint: string,
): ListingError | null {
  const identities = waffoIdentities(order);
  const existingRows = new Map<string, WaffoIdentityReservationRow>();
  const conflicts: Array<{ identity: WaffoIdentity; existing: WaffoIdentityReservationRow }> = [];
  for (const identity of identities) {
    const row = db
      .prepare<[string, string], WaffoIdentityReservationRow>(
        `SELECT identity_type, identity_value, delivery_id, event_type,
                payload_sha256, event_fingerprint, outcome, reserved_at
         FROM waffo_identity_reservations
         WHERE identity_type = ? AND identity_value = ?`,
      )
      .get(identity.type, identity.value);
    if (!row) continue;
    existingRows.set(`${identity.type}:${identity.value}`, row);
    if (row.event_fingerprint !== eventFingerprint) {
      recordIdentityConflict(
        db,
        identity,
        row,
        order,
        eventFingerprint,
        "Waffo canonical identity was reused with different signed business facts",
      );
      conflicts.push({ identity, existing: row });
    }
  }

  // Rejected deliveries are still immutable provider facts. Keep every free
  // identity from such an attempt in the durable reservation table, even when
  // another identity already belongs to a different signed payload. Accepted
  // and reconciliation outcomes must remain all-or-nothing on conflicts.
  if (conflicts.length > 0 && outcome !== "rejected") {
    return new ListingError(
      "identity_reuse",
      "Waffo business/payment/order/intent identity was reused with changed facts",
      409,
    );
  }

  const insert = db.prepare(
    `INSERT INTO waffo_identity_reservations
       (identity_type, identity_value, delivery_id, event_type,
        payload_sha256, event_fingerprint, outcome, reserved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const identity of identities) {
    if (existingRows.has(`${identity.type}:${identity.value}`)) continue;
    insert.run(
      identity.type,
      identity.value,
      order.deliveryId,
      order.eventType,
      order.payloadSha256,
      eventFingerprint,
      outcome,
      order.receivedAt,
    );
  }
  if (conflicts.length > 0) {
    return new ListingError(
      "identity_reuse",
      "Waffo business/payment/order/intent identity was reused with changed facts",
      409,
    );
  }
  if (outcome === "needs_reconciliation") {
    db.prepare(
      `UPDATE waffo_identity_reservations
       SET outcome = 'needs_reconciliation'
       WHERE delivery_id = ? AND event_fingerprint = ?`,
    ).run(order.deliveryId, eventFingerprint);
  }
  return null;
}

function recordDeliveryConflict(
  db: AppDb,
  order: VerifiedWaffoOrder,
  eventFingerprint: string,
): void {
  // Keep the original webhook-id row immutable while retaining a durable
  // audit record for a same-delivery-id payload mutation. Repeating the same
  // conflict is idempotent through this derived key.
  insertWaffoEvent(
    db,
    {
      ...order,
      deliveryId: `${order.deliveryId}:conflict:${order.payloadSha256}`,
    },
    "rejected",
    "event_mismatch",
    "Waffo delivery id was reused with a different payload",
    eventFingerprint,
  );
}

function statusForWaffoError(code: string): number {
  if (code === "unknown_intent") return 404;
  if (
    code === "event_replay" ||
    code === "identity_reuse" ||
    code === "intent_already_paid"
  ) {
    return 409;
  }
  if (
    code === "event_mismatch" ||
    code === "wrong_mode" ||
    code === "wrong_store" ||
    code === "order_status_mismatch" ||
    code === "payment_status_mismatch" ||
    code === "currency_mismatch" ||
    code === "product_mismatch" ||
    code === "amount_mismatch" ||
    code === "metadata_mismatch" ||
    code === "payment_missing" ||
    code === "order_missing"
  ) {
    return 422;
  }
  return 400;
}

function waffoErrorFromLedger(row: WaffoWebhookEventRow): ListingError {
  const code = row.error_code ?? "webhook_rejected";
  return new ListingError(
    code,
    row.reason ?? "Waffo webhook was rejected",
    statusForWaffoError(code),
  );
}

function isProviderRejected(error: unknown): boolean {
  return error instanceof WaffoProviderRejectedError ||
    (error instanceof Error && (error as Error & { providerRejected?: boolean }).providerRejected === true);
}

function markIntentState(
  db: AppDb,
  intentId: string,
  status: CheckoutStatus,
  now: Date,
): void {
  db.prepare(
    `UPDATE checkouts SET status = ?, updated_at = ?
     WHERE id = ? AND status NOT IN ('paid', 'needs_reconciliation', 'rejected')`,
  ).run(status, now.toISOString(), intentId);
}

function bestEffortMarkIntentState(
  db: AppDb,
  intentId: string,
  status: CheckoutStatus,
  now: Date,
): void {
  try {
    markIntentState(db, intentId, status, now);
  } catch {
    // The immutable creating row is still retained for later reconciliation.
  }
}

function providerFact(
  provider: WaffoPort,
  method: "getStoreId" | "getProductId" | "getMode",
): string | undefined {
  const value = (provider as WaffoPort & {
    [key: string]: (() => string | undefined) | undefined;
  })[method];
  return typeof value === "function" ? value.call(provider) : undefined;
}

function intentProviderFacts(
  provider: WaffoPort,
  env: NodeJS.ProcessEnv,
): {
  storeId: string;
  productId: string;
  mode: string;
} {
  const mode =
    waffoEnvironment(
      (providerFact(provider, "getMode") as "waffo-test" | "waffo-prod" | undefined) ??
        waffoMode(env),
    ) ?? (provider.kind === "fixture" ? DEFAULT_FIXTURE_MODE : "test");
  return {
    storeId:
      providerFact(provider, "getStoreId") ??
      waffoStoreId(env) ??
      (provider.kind === "fixture" ? DEFAULT_FIXTURE_STORE : "injected-store"),
    productId:
      providerFact(provider, "getProductId") ??
      waffoProductId(env) ??
      (provider.kind === "fixture" ? DEFAULT_FIXTURE_PRODUCT : "injected-product"),
    mode,
  };
}

function buildIntentMetadata(input: {
  intentId: string;
  listingId: string;
  issueDate: string;
  canonicalUrl: string;
  blurb: string;
  quoteBaseBidCents: number;
  targetBidCents: number;
  chargeCents: number;
  kind: "first" | "raise";
  storeId: string;
  productId: string;
  mode: string;
}): { metadata: Record<string, string>; fingerprint: string; json: string } {
  const base: Record<string, string> = {
    intentId: input.intentId,
    listingId: input.listingId,
    issueDate: input.issueDate,
    boardKey: input.issueDate,
    canonicalUrl: input.canonicalUrl,
    blurb: input.blurb,
    quoteBaseBidCents: String(input.quoteBaseBidCents),
    targetBidCents: String(input.targetBidCents),
    chargeCents: String(input.chargeCents),
    kind: input.kind,
    storeId: input.storeId,
    productId: input.productId,
    mode: input.mode,
    currency: "USD",
    taxCategory: DIGITAL_GOODS_TAX_CATEGORY,
  };
  const fingerprint = intentFingerprintForMetadata(base);
  const metadata = { ...base, intentFingerprint: fingerprint };
  return { metadata, fingerprint, json: canonicalJson(metadata) };
}

export function paidCheckoutCount(db: AppDb): number {
  const row = db
    .prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM checkouts WHERE status = 'paid'",
    )
    .get();
  return row?.n ?? 0;
}

/** Explicit runtime selection. Absent WAFFO_MODE is a configuration error. */
export function createWaffo(env: NodeJS.ProcessEnv = process.env): WaffoPort {
  const mode = waffoMode(env);
  if (mode === "fixture") {
    if (env.NODE_ENV === "production") {
      throw new Error("BLOCKED-CONFIG: WAFFO_MODE=waffo-prod required in production");
    }
    return new FixtureWaffo();
  }
  assertWaffoRuntimeConfig(env);
  return new LiveWaffo({ env });
}

/** Compatibility alias. It never consults POLAR_* or WAFFO_LIVE. */
export const createPolar = createWaffo;

export function polarFixtureOnly(_env: NodeJS.ProcessEnv = process.env): boolean {
  return false;
}

export function polarLiveEnabled(_env: NodeJS.ProcessEnv = process.env): boolean {
  return false;
}

export function publicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return validateWaffoPublicOrigin(
    waffoPublicBaseUrl(env) ?? "http://localhost:3000",
    "fixture",
  );
}

/**
 * Validate listing + minimum bid, write the immutable local intent, then call
 * Waffo. No provider result is allowed to create a ranked listing directly.
 */
export async function startListingCheckout(
  db: AppDb,
  polar: WaffoPort,
  body: unknown,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<StartedCheckout> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ListingError("invalid_listing", "listing body must be an object");
  }
  const input = body as Record<string, unknown>;
  const parsed = parseCreateListingBody(body);
  const targetBidUsd = parseBidUsd(input.bidUsd);
  const issueDate = openIssueDate(db, now);
  if (!issueDate) {
    throw new ListingError(
      "no_open_issue",
      "only the open issue accepts listings",
      409,
    );
  }
  const existing = findListingByUrlAndIssue(db, parsed.sponsorUrl, issueDate);
  const quote = quoteListingBid(existing?.bidUsd ?? 0, targetBidUsd);
  const listing = createListing(db, body, now);
  const intentId = randomUUID();
  const provisionalProviderId = provisionalProviderCheckoutId(intentId);
  const providerFacts = intentProviderFacts(polar, env);
  const chargeCents = quote.amountUsd * 100;
  const targetBidCents = quote.targetBidUsd * 100;
  const quoteBaseBidCents = quote.currentBidUsd * 100;
  const intent = buildIntentMetadata({
    intentId,
    listingId: listing.id,
    issueDate: listing.issueDate,
    canonicalUrl: listing.sponsorUrl,
    blurb: listing.blurb,
    quoteBaseBidCents,
    targetBidCents,
    chargeCents,
    kind: quote.raise ? "raise" : "first",
    ...providerFacts,
  });

  const createdAt = now.toISOString();
  db.prepare(
    `INSERT INTO checkouts
       (id, listing_id, amount_usd, target_bid_usd, polar_checkout_id, status,
        board_key, canonical_url, blurb, quote_base_bid_cents, target_bid_cents,
        charge_cents, expected_store_id, expected_product_id, expected_mode,
        expected_currency, expected_tax_category, metadata_json,
        intent_fingerprint, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'creating', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    intentId,
    listing.id,
    quote.amountUsd,
    quote.targetBidUsd,
    provisionalProviderId,
    listing.issueDate,
    listing.sponsorUrl,
    listing.blurb,
    quoteBaseBidCents,
    targetBidCents,
    chargeCents,
    providerFacts.storeId,
    providerFacts.productId,
    providerFacts.mode,
    "USD",
    DIGITAL_GOODS_TAX_CATEGORY,
    intent.json,
    intent.fingerprint,
    createdAt,
    createdAt,
  );

  const mode = waffoMode(env) ??
    (polar.kind === "fixture"
      ? "fixture"
      : providerFact(polar, "getMode") === "waffo-prod"
        ? "waffo-prod"
        : providerFact(polar, "getMode") === "waffo-test"
          ? "waffo-test"
          : undefined);
  let base: string;
  try {
    base = mode === "fixture"
      ? publicBaseUrl(env)
      : validateWaffoPublicOrigin(waffoPublicBaseUrl(env), mode);
  } catch (error) {
    bestEffortMarkIntentState(db, intentId, "unknown", now);
    throw new WaffoCheckoutAmbiguousError(
      error instanceof Error ? error.message : "BLOCKED-CONFIG: PUBLIC_BASE_URL",
      { cause: error },
    );
  }
  const checkoutInput: CreateCheckoutInput = {
    amountUsd: quote.amountUsd,
    listingId: listing.id,
    successUrl: `${base}/checkout/complete?intent=${encodeURIComponent(intentId)}`,
    cancelUrl: `${base}/checkout/complete?intent=${encodeURIComponent(intentId)}`,
    intentId,
    intentFingerprint: intent.fingerprint,
    checkoutId: intentId,
    metadata: intent.metadata,
  };

  let created: Awaited<ReturnType<WaffoPort["createCheckout"]>>;
  try {
    created = await polar.createCheckout(checkoutInput);
  } catch (error) {
    bestEffortMarkIntentState(
      db,
      intentId,
      isProviderRejected(error) ? "rejected" : "unknown",
      now,
    );
    throw error;
  }

  const settledStatus = polar.kind === "fixture" ? "pending" : "open";
  let checkoutUrl = created.url;
  let checkoutExpiresAt = created.expiresAt ?? null;
  try {
    if (polar.kind === "fixture" || mode === "fixture") {
      if (!/^\/checkout\/complete\?checkoutId=[^&]+$/.test(checkoutUrl)) {
        throw new WaffoCheckoutAmbiguousError("fixture checkout URL is invalid");
      }
    } else {
      checkoutUrl = validateWaffoCheckoutUrl(checkoutUrl, created.checkoutId);
      checkoutExpiresAt = validateWaffoExpiry(created.expiresAt, now);
    }
  } catch (error) {
    bestEffortMarkIntentState(db, intentId, "unknown", now);
    if (error instanceof WaffoCheckoutAmbiguousError) throw error;
    throw new WaffoCheckoutAmbiguousError("Waffo checkout response was invalid", {
      cause: error,
    });
  }
  try {
    db.transaction(() => {
      // The provider response may race a signed webhook. Only the immutable
      // creating row may transition to open/pending; a settled or
      // reconciliation state is never overwritten by this attach.
      const opened = db
        .prepare(
          `UPDATE checkouts
           SET polar_checkout_id = ?, checkout_url = ?, status = ?,
               checkout_expires_at = ?, updated_at = ?
           WHERE id = ? AND polar_checkout_id = ? AND status = 'creating'`,
        )
        .run(
          created.checkoutId,
          checkoutUrl,
          settledStatus,
          checkoutExpiresAt,
          now.toISOString(),
          intentId,
          provisionalProviderId,
        );
      if (opened.changes > 0) return;

      // If settlement won the race, attach provider facts without changing
      // the terminal/reconciliation outcome already recorded by the webhook.
      const settled = db
        .prepare(
          `UPDATE checkouts
           SET polar_checkout_id = ?, checkout_url = ?,
               checkout_expires_at = ?, updated_at = ?
           WHERE id = ? AND polar_checkout_id = ?
             AND status IN ('paid', 'needs_reconciliation', 'rejected')`,
        )
        .run(
          created.checkoutId,
          checkoutUrl,
          checkoutExpiresAt,
          now.toISOString(),
          intentId,
          provisionalProviderId,
        );
      if (settled.changes > 0) return;

      const persisted = findIntentByLocalId(db, intentId);
      if (!persisted || persisted.polar_checkout_id !== created.checkoutId) {
        throw new WaffoCheckoutAmbiguousError(
          "Waffo checkout attach outcome is ambiguous",
        );
      }
    })();
  } catch (error) {
    if (error instanceof WaffoCheckoutAmbiguousError) throw error;
    bestEffortMarkIntentState(db, intentId, "unknown", now);
    throw new WaffoCheckoutAmbiguousError("Waffo checkout attach outcome is ambiguous", {
      cause: error,
    });
  }

  return {
    url: checkoutUrl,
    checkoutId: intentId,
    polarCheckoutId: created.checkoutId,
    listingId: listing.id,
    amountUsd: quote.amountUsd,
    targetBidUsd: quote.targetBidUsd,
  };
}

/** Apply a fixture checkout only; live Waffo settlement is webhook-only. */
export function applyPaidCheckout(
  db: AppDb,
  checkoutId: string,
  now: Date = new Date(),
): Checkout {
  catchUpIssues(db, now);
  const checkout = findCheckout(db, checkoutId);
  if (!checkout) {
    throw new ListingError("unknown_checkout", "checkout not found", 404);
  }
  if (checkout.status === "paid") return checkout;
  const status = String(checkout.status);
  if (status === "rejected" || status === "needs_reconciliation" || status === "unknown") {
    throw new ListingError("checkout_not_fixture", "live checkout completion is webhook-only", 409);
  }
  const listing = findListingById(db, checkout.listingId);
  if (!listing) {
    throw new ListingError("unknown_checkout", "checkout listing not found", 404);
  }
  const quote = quoteListingBid(listing.bidUsd, checkout.targetBidUsd);
  if (checkout.amountUsd !== quote.amountUsd) {
    throw new ListingError(
      quote.raise ? "raise_not_difference" : "below_minimum",
      quote.raise
        ? `raise pays the difference only (expected $${quote.amountUsd})`
        : `first bid must be at least $${MIN_BID_USD}`,
    );
  }
  db.transaction(() => {
    db.prepare("UPDATE checkouts SET status = 'paid', updated_at = ? WHERE id = ?").run(
      now.toISOString(),
      checkout.id,
    );
    applyPaidBid(db, listing.id, checkout.targetBidUsd, now);
  })();
  return { ...checkout, status: "paid" };
}

function parseExactDisplayCents(value: unknown): number | null {
  if (typeof value !== "string") return null;
  if (value !== value.trim()) return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  try {
    // Parse through BigInt so a hostile oversized decimal cannot be rounded
    // by binary floating point into a different, apparently safe cent value.
    const cents = BigInt(match[1]) * 100n + BigInt(fraction || "0");
    return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
  } catch {
    return null;
  }
}

type WaffoMoneyFacts = {
  amountCents: number;
  taxCents: number;
  subtotalCents: number | null;
  totalCents: number | null;
};

const PROVIDER_EVENT_FUTURE_TOLERANCE_MS = 60_000;
const PROVIDER_EVENT_STALE_TOLERANCE_MS = 7 * 24 * 60 * 60 * 1000;
const ISO_UTC_TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

function parseProviderEventTimestamp(value: string): Date | null {
  const match = ISO_UTC_TIMESTAMP_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millis = Number((match[7] ?? "").padEnd(3, "0") || "0");
  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millis));
  if (!Number.isFinite(parsed.getTime())) return null;
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second ||
    parsed.getUTCMilliseconds() !== millis
  ) {
    return null;
  }
  return parsed;
}

function exactMetadata(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") return null;
    result[key] = item;
  }
  return result;
}

function parseStoredMetadata(row: CheckoutIntentRow): Record<string, string> | null {
  try {
    return exactMetadata(JSON.parse(row.metadata_json));
  } catch {
    return null;
  }
}

function reconciliationError(code: string, message: string): ListingError {
  return new ListingError(code, message, 200);
}

/**
 * Settle one already-authenticated Waffo order.completed event. All identity,
 * amount, metadata, and state changes happen in one SQLite transaction.
 */
export function applyVerifiedWaffoOrder(
  db: AppDb,
  order: VerifiedWaffoOrder,
  now: Date = new Date(),
): VerifiedWaffoOrderResult {
  catchUpIssues(db, now);
  if (
    typeof order.deliveryId !== "string" ||
    order.deliveryId.trim() === "" ||
    typeof order.eventType !== "string" ||
    typeof order.eventTimestamp !== "string" ||
    typeof order.payloadSha256 !== "string" ||
    order.payloadSha256.trim() === "" ||
    typeof order.receivedAt !== "string"
  ) {
    throw new ListingError("event_mismatch", "Waffo event envelope is invalid", 422);
  }
  type TransactionResult =
    | { kind: "accepted"; intentId: string; replay: boolean }
    | { kind: "rejected"; error: ListingError }
    | { kind: "reconciliation"; intentId: string; error: ListingError; replay: boolean };

  // Never trust a caller-supplied fingerprint: the normalized signed event is
  // the source of truth for replay/change detection.
  const computedFingerprint = eventFingerprintForWaffoOrder(order);
  const result = db.transaction((): TransactionResult => {
    insertWaffoEvent(
      db,
      order,
      "rejected",
      WEBHOOK_RESERVATION_CODE,
      "processing",
      computedFingerprint,
    );
    const current = findWaffoEvent(db, order.deliveryId);
    if (!current) {
      return {
        kind: "rejected",
        error: new ListingError(
          "event_record_failed",
          "Waffo webhook event could not be recorded",
          500,
        ),
      };
    }
    if (
      current.payload_sha256 !== order.payloadSha256 ||
      current.event_fingerprint !== computedFingerprint
    ) {
      recordIdentityConflict(
        db,
        { type: "delivery", value: order.deliveryId },
        {
          identity_type: "delivery",
          identity_value: order.deliveryId,
          delivery_id: current.delivery_id,
          event_type: current.event_type,
          payload_sha256: current.payload_sha256,
          event_fingerprint: current.event_fingerprint,
          outcome: current.status,
          reserved_at: current.received_at,
        },
        order,
        computedFingerprint,
        "Waffo delivery id was reused with a different signed payload",
      );
      // A delivery-id mutation is itself a rejected signed attempt. Reserve
      // every other identity that is present in the incoming payload too;
      // otherwise a changed same-delivery request could leave a newly
      // introduced payment/order/intent free for a later settlement.
      reserveWaffoIdentities(db, order, "rejected", computedFingerprint);
      recordDeliveryConflict(db, order, computedFingerprint);
      return {
        kind: "rejected",
        error: new ListingError(
          "event_mismatch",
          "Waffo delivery id was reused with a different payload",
          409,
        ),
      };
    }
    if (current.status === "accepted") {
      return {
        kind: "accepted",
        intentId: current.intent_id ?? "",
        replay: true,
      };
    }
    if (current.status === "needs_reconciliation") {
      return {
        kind: "reconciliation",
        intentId: current.intent_id ?? "",
        replay: true,
        error: reconciliationError(
          current.error_code ?? "needs_reconciliation",
          current.reason ?? "Waffo payment needs reconciliation",
        ),
      };
    }
    if (current.error_code && current.error_code !== WEBHOOK_RESERVATION_CODE) {
      return { kind: "rejected", error: waffoErrorFromLedger(current) };
    }

    const priorByBusiness = order.businessEventId
      ? findWaffoEventsBy(db, "business_event_id", order.businessEventId).filter(
          (event) =>
            event.delivery_id !== order.deliveryId,
        )
      : [];
    const priorIdentity = [
      ...(order.paymentId ? findWaffoEventsBy(db, "payment_id", order.paymentId) : []),
      ...(order.orderId ? findWaffoEventsBy(db, "order_id", order.orderId) : []),
      ...(order.orderMerchantExternalId
        ? findWaffoEventsBy(db, "intent_id", order.orderMerchantExternalId)
        : []),
    ].filter((event, index, all) =>
      event.delivery_id !== order.deliveryId &&
      all.findIndex((candidate) => candidate.delivery_id === event.delivery_id) === index,
    );
    const prior = [...priorByBusiness, ...priorIdentity].filter(
      (event, index, all) =>
        all.findIndex((candidate) => candidate.delivery_id === event.delivery_id) === index,
    );
    if (prior.length > 0) {
      // A changed replay is retained as a rejected audit row, but it must
      // not poison a later exact retry of the original accepted event. Pick
      // the matching canonical outcome first; only an identity with no
      // matching fingerprint is an immutable-facts conflict.
      const sameFingerprint = prior.filter(
        (event) => event.event_fingerprint === computedFingerprint,
      );
      const accepted = sameFingerprint.find((event) => event.status === "accepted");
      if (accepted) {
        const reservationError = reserveWaffoIdentities(
          db,
          order,
          "accepted",
          computedFingerprint,
        );
        if (reservationError) {
          db.prepare(
            `UPDATE waffo_webhook_events
             SET status = 'rejected', error_code = ?, reason = ?
             WHERE delivery_id = ?`,
          ).run(reservationError.code, reservationError.message, order.deliveryId);
          return { kind: "rejected", error: reservationError };
        }
        db.prepare(
          `UPDATE waffo_webhook_events
           SET status = 'accepted', error_code = NULL, reason = ?
           WHERE delivery_id = ?`,
        ).run("exact replay of an accepted Waffo payment", order.deliveryId);
        return {
          kind: "accepted",
          intentId: accepted.intent_id ?? order.orderMerchantExternalId,
          replay: true,
        };
      }
      const needs = sameFingerprint.find(
        (event) => event.status === "needs_reconciliation",
      );
      if (needs) {
        const error = reconciliationError(
          needs.error_code ?? "needs_reconciliation",
          needs.reason ?? "Waffo payment needs reconciliation",
        );
        const reservationError = reserveWaffoIdentities(
          db,
          order,
          "needs_reconciliation",
          computedFingerprint,
        );
        if (reservationError) {
          db.prepare(
            `UPDATE waffo_webhook_events
             SET status = 'rejected', error_code = ?, reason = ?
             WHERE delivery_id = ?`,
          ).run(reservationError.code, reservationError.message, order.deliveryId);
          return { kind: "rejected", error: reservationError };
        }
        db.prepare(
          `UPDATE waffo_webhook_events
           SET status = 'needs_reconciliation', error_code = ?, reason = ?
           WHERE delivery_id = ?`,
        ).run(error.code, error.message, order.deliveryId);
        return {
          kind: "reconciliation",
          intentId: needs.intent_id ?? order.orderMerchantExternalId,
          error,
          replay: true,
        };
      }
      const rejected = sameFingerprint.find((event) => event.status === "rejected");
      if (rejected && rejected.error_code !== WEBHOOK_RESERVATION_CODE) {
        const error = waffoErrorFromLedger(rejected);
        const reservationError = reserveWaffoIdentities(
          db,
          order,
          "rejected",
          computedFingerprint,
        );
        if (reservationError) {
          db.prepare(
            `UPDATE waffo_webhook_events
             SET status = 'rejected', error_code = ?, reason = ?
             WHERE delivery_id = ?`,
          ).run(reservationError.code, reservationError.message, order.deliveryId);
          return { kind: "rejected", error: reservationError };
        }
        db.prepare(
          `UPDATE waffo_webhook_events
           SET status = 'rejected', error_code = ?, reason = ?
           WHERE delivery_id = ?`,
        ).run(error.code, error.message, order.deliveryId);
        return { kind: "rejected", error };
      }
      if (sameFingerprint.length === 0) {
        const error = new ListingError(
          "identity_reuse",
          "Waffo business/payment/order/intent identity was reused with changed facts",
          409,
        );
        // Route-level validation may reject a changed replay before the
        // normal settlement path reaches the reservation helper. Still
        // retain one conflict row for the first durable identity so an
        // operator can reconcile the captured payment without relying on the
        // event ledger's rejected row alone.
        reserveWaffoIdentities(db, order, "rejected", computedFingerprint);
        db.prepare(
          `UPDATE waffo_webhook_events
           SET status = 'rejected', error_code = ?, reason = ?
           WHERE delivery_id = ?`,
        ).run(error.code, error.message, order.deliveryId);
        return { kind: "rejected", error };
      }
    }

    const reject = (error: ListingError): TransactionResult => {
      // A signed definitive outcome for a known intent is itself final for
      // that intent. Persist the rejection in the same transaction as the
      // event/identity reservation, while preserving paid and reconciliation
      // states if a concurrent settlement already won.
      if (order.orderMerchantExternalId) {
        db.prepare(
          `UPDATE checkouts
           SET status = 'rejected', updated_at = ?
           WHERE id = ? AND status NOT IN ('paid', 'needs_reconciliation', 'rejected')`,
        ).run(now.toISOString(), order.orderMerchantExternalId);
      }
      const reservationError = reserveWaffoIdentities(
        db,
        order,
        "rejected",
        computedFingerprint,
      );
      if (reservationError) {
        db.prepare(
          `UPDATE waffo_webhook_events
           SET status = 'rejected', error_code = ?, reason = ?
           WHERE delivery_id = ?`,
        ).run(reservationError.code, reservationError.message, order.deliveryId);
        return { kind: "rejected", error: reservationError };
      }
      db.prepare(
        `UPDATE waffo_webhook_events
         SET status = 'rejected', error_code = ?, reason = ?
         WHERE delivery_id = ?`,
      ).run(error.code, error.message, order.deliveryId);
      return { kind: "rejected", error };
    };
    const reconcile = (
      intentId: string,
      error: ListingError,
      facts?: WaffoMoneyFacts,
    ): TransactionResult => {
      const reservationError = reserveWaffoIdentities(
        db,
        order,
        "needs_reconciliation",
        computedFingerprint,
      );
      if (reservationError) {
        db.prepare(
          `UPDATE waffo_webhook_events
           SET status = 'rejected', error_code = ?, reason = ?
           WHERE delivery_id = ?`,
        ).run(reservationError.code, reservationError.message, order.deliveryId);
        return { kind: "rejected", error: reservationError };
      }
      db.prepare(
        `UPDATE waffo_webhook_events
         SET status = 'needs_reconciliation', error_code = ?, reason = ?,
             amount_cents = COALESCE(?, amount_cents),
             tax_cents = COALESCE(?, tax_cents),
             subtotal_cents = COALESCE(?, subtotal_cents),
             total_cents = COALESCE(?, total_cents)
         WHERE delivery_id = ?`,
      ).run(
        error.code,
        error.message,
        facts?.amountCents ?? null,
        facts?.taxCents ?? null,
        facts?.subtotalCents ?? null,
        facts?.totalCents ?? null,
        order.deliveryId,
      );
      db.prepare(
        `UPDATE checkouts
         SET status = 'needs_reconciliation', updated_at = ?,
             provider_amount_cents = COALESCE(?, provider_amount_cents),
             provider_tax_cents = COALESCE(?, provider_tax_cents),
             provider_subtotal_cents = COALESCE(?, provider_subtotal_cents),
             provider_total_cents = COALESCE(?, provider_total_cents)
         WHERE id = ? AND status NOT IN ('paid', 'rejected')`,
      ).run(
        now.toISOString(),
        facts?.amountCents ?? null,
        facts?.taxCents ?? null,
        facts?.subtotalCents ?? null,
        facts?.totalCents ?? null,
        intentId,
      );
      return { kind: "reconciliation", intentId, error, replay: false };
    };

    try {
      if (order.eventType !== "order.completed") {
        return reject(
          new ListingError("unsupported_event", "Waffo event is not order.completed", 422),
        );
      }
      if (!order.businessEventId) {
        return reject(new ListingError("event_mismatch", "Waffo business event id is missing", 422));
      }
      if (!order.orderId) {
        return reject(new ListingError("order_missing", "Waffo order id is missing", 422));
      }
      if (!order.paymentId) {
        return reject(new ListingError("payment_missing", "Waffo payment id is missing", 422));
      }
      if (order.businessEventId !== order.paymentId) {
        return reject(
          new ListingError(
            "payment_event_mismatch",
            "Waffo order.completed eventId must equal data.paymentId",
            422,
          ),
        );
      }
      if (order.orderStatus !== "completed") {
        return reject(
          new ListingError("order_status_mismatch", "Waffo order is not completed", 422),
        );
      }
      if (order.paymentStatus !== "succeeded") {
        return reject(
          new ListingError("payment_status_mismatch", "Waffo payment did not succeed", 422),
        );
      }
      const intentId = order.orderMerchantExternalId;
      if (!intentId) {
        return reject(new ListingError("unknown_intent", "Waffo intent id is missing", 404));
      }
      const intent = findIntentByLocalId(db, intentId);
      if (!intent) {
        return reject(new ListingError("unknown_intent", "Waffo intent was not found", 404));
      }
      if (
        intent.expected_currency !== "USD" ||
        order.currency !== intent.expected_currency
      ) {
        return reject(new ListingError("currency_mismatch", "Waffo payment is not USD", 422));
      }
      if (order.productId !== intent.expected_product_id) {
        return reject(new ListingError("product_mismatch", "Waffo product does not match intent", 422));
      }
      if (order.mode !== intent.expected_mode) {
        return reject(new ListingError("wrong_mode", "Waffo environment does not match intent", 422));
      }
      if (order.storeId !== intent.expected_store_id) {
        return reject(new ListingError("wrong_store", "Waffo store does not match intent", 422));
      }
      const metadata = exactMetadata(order.orderMetadata);
      const storedMetadata = parseStoredMetadata(intent);
      if (!metadata || !storedMetadata || canonicalJson(metadata) !== canonicalJson(storedMetadata)) {
        return reject(new ListingError("metadata_mismatch", "Waffo order metadata does not match intent", 422));
      }
      if (
        metadata.intentId !== intent.id ||
        metadata.intentFingerprint !== intent.intent_fingerprint ||
        intentFingerprintForMetadata(metadata) !== intent.intent_fingerprint
      ) {
        return reject(new ListingError("metadata_mismatch", "Waffo intent fingerprint does not match", 422));
      }
      const amountCents = parseExactDisplayCents(order.amount);
      const taxCents = parseExactDisplayCents(order.taxAmount);
      const hasSubtotal = order.subtotal !== undefined;
      const subtotalCents = hasSubtotal
        ? parseExactDisplayCents(order.subtotal)
        : null;
      const hasTotal = order.total !== undefined;
      const totalCents = hasTotal
        ? parseExactDisplayCents(order.total)
        : null;
      const expectedChargeCents = intent.charge_cents;
      if (!Number.isSafeInteger(expectedChargeCents) || expectedChargeCents <= 0) {
        return reject(new ListingError("amount_mismatch", "Waffo intent charge is invalid", 422));
      }
      if (amountCents === null || taxCents === null) {
        return reject(new ListingError("amount_mismatch", "Waffo amount is not an exact decimal", 422));
      }
      if (hasTotal && totalCents === null) {
        return reject(new ListingError("amount_mismatch", "Waffo total is not an exact decimal", 422));
      }
      if (hasSubtotal && subtotalCents === null) {
        return reject(new ListingError("amount_mismatch", "Waffo subtotal is not an exact decimal", 422));
      }
      const moneyFacts: WaffoMoneyFacts = {
        amountCents,
        taxCents,
        subtotalCents,
        totalCents,
      };
      // Waffo's price snapshot is tax-exclusive. The provider may expose
      // either the subtotal or the buyer-tax-inclusive amount in `amount`,
      // while `total` may follow either representation. Numeric fields that
      // are present but inconsistent prove a captured payment we cannot rank
      // safely, so retain it for reconciliation instead of silently dropping
      // the payment. Malformed decimals above remain definitive rejection.
      if (subtotalCents !== null) {
        const expectedTaxedCents = subtotalCents + taxCents;
        if (!Number.isSafeInteger(expectedTaxedCents)) {
          return reconcile(
            intent.id,
            reconciliationError("amount_mismatch", "Waffo amount equation overflowed"),
            moneyFacts,
          );
        }
        const amountIsConsistent =
          subtotalCents === expectedChargeCents &&
          (amountCents === subtotalCents || amountCents === expectedTaxedCents);
        const totalIsConsistent =
          totalCents === null ||
          totalCents === amountCents ||
          totalCents === expectedTaxedCents;
        if (!amountIsConsistent || !totalIsConsistent) {
          return reconcile(
            intent.id,
            reconciliationError(
              "amount_mismatch",
              "captured Waffo amount facts do not match the immutable charge",
            ),
            moneyFacts,
          );
        }
      } else if (
        taxCents !== 0 ||
        amountCents !== expectedChargeCents ||
        (totalCents !== null && totalCents !== amountCents)
      ) {
        return reconcile(
          intent.id,
          reconciliationError(
            "amount_mismatch",
            "captured Waffo untaxed amount facts do not match the immutable charge",
          ),
          moneyFacts,
        );
      }
      const eventAt = parseProviderEventTimestamp(order.eventTimestamp);
      if (!eventAt) {
        return reject(new ListingError("event_mismatch", "Waffo event timestamp is invalid", 422));
      }
      const listing = findListingById(db, intent.listing_id);
      if (!listing) return reject(new ListingError("unknown_listing", "intent listing was not found", 404));
      if (listing.status !== "active") {
        return reconcile(
          intent.id,
          reconciliationError("listing_not_active", "captured Waffo payment needs listing reconciliation"),
          moneyFacts,
        );
      }
      const currentBidCents = listing.bidUsd * 100;
      if (currentBidCents !== intent.quote_base_bid_cents) {
        return reconcile(
          intent.id,
          reconciliationError("stale_quote", "captured Waffo raise no longer matches the current bid"),
          moneyFacts,
        );
      }
      if (eventAt.getTime() > now.getTime() + PROVIDER_EVENT_FUTURE_TOLERANCE_MS) {
        return reconcile(
          intent.id,
          reconciliationError(
            "event_timestamp_future",
            "captured Waffo payment has a future provider timestamp",
          ),
          moneyFacts,
        );
      }
      if (
        eventAt.getTime() < now.getTime() - PROVIDER_EVENT_STALE_TOLERANCE_MS
      ) {
        return reconcile(
          intent.id,
          reconciliationError(
            "event_timestamp_stale",
            "captured Waffo payment has a stale provider timestamp",
          ),
          moneyFacts,
        );
      }
      const intentStatus = currentStatus(intent);
      if (intentStatus === "paid") {
        return reject(new ListingError("intent_already_paid", "Waffo intent is already paid", 409));
      }
      if (intentStatus === "rejected") {
        return reject(new ListingError("intent_rejected", "Waffo intent was explicitly rejected", 422));
      }
      const reservationError = reserveWaffoIdentities(
        db,
        order,
        "accepted",
        computedFingerprint,
      );
      if (reservationError) return reject(reservationError);
      try {
        // Validate issue openness against receipt time, then stamp a first
        // placement with the provider's event time. A delayed older event
        // must still be able to settle beside a newer event already applied;
        // using eventAt for the close check would mistake that future row for
        // an expired issue. Raises leave their original placement timestamp.
        const wasUnpaid = listing.bidUsd <= 0;
        applyPaidBid(db, listing.id, intent.target_bid_usd, now);
        if (wasUnpaid) {
          db.prepare("UPDATE listings SET created_at = ? WHERE id = ?").run(
            eventAt.toISOString(),
            listing.id,
          );
        }
      } catch (error) {
        if (error instanceof ListingError &&
          ["issue_closed", "bid_not_higher", "raise_not_difference", "below_minimum"].includes(error.code)) {
          return reconcile(intent.id, reconciliationError("needs_reconciliation", `captured Waffo payment needs reconciliation: ${error.message}`), moneyFacts);
        }
        throw error;
      }
      db.prepare(
        `UPDATE checkouts
         SET status = 'paid', provider_order_id = ?, provider_payment_id = ?,
             last_event_id = ?, updated_at = ?, provider_amount_cents = ?,
             provider_tax_cents = ?, provider_subtotal_cents = ?,
             provider_total_cents = ?
         WHERE id = ? AND status NOT IN ('paid', 'rejected')`,
      ).run(
        order.orderId,
        order.paymentId,
        order.businessEventId,
        now.toISOString(),
        moneyFacts.amountCents,
        moneyFacts.taxCents,
        moneyFacts.subtotalCents,
        moneyFacts.totalCents,
        intent.id,
      );
      db.prepare(
        `UPDATE waffo_webhook_events
         SET status = 'accepted', error_code = NULL, reason = NULL,
             amount_cents = ?, tax_cents = ?, subtotal_cents = ?, total_cents = ?
         WHERE delivery_id = ?`,
      ).run(
        moneyFacts.amountCents,
        moneyFacts.taxCents,
        moneyFacts.subtotalCents,
        moneyFacts.totalCents,
        order.deliveryId,
      );
      return { kind: "accepted", intentId: intent.id, replay: false };
    } catch (error) {
      if (error instanceof ListingError) return reject(error);
      throw error;
    }
  })();

  if (result.kind === "rejected") throw result.error;
  const checkout = findIntentByLocalId(db, result.intentId);
  if (!checkout) {
    throw new ListingError("event_record_corrupt", "Waffo settlement lost its local intent", 500);
  }
  return {
    checkout: checkoutFromRow(checkout),
    replay: result.kind === "accepted" || result.kind === "reconciliation"
      ? result.replay
      : false,
    reconciled: result.kind === "reconciliation",
  };
}

/** Compatibility alias; live settlement always uses Waffo event fields. */
export const applyVerifiedPolarOrder = applyVerifiedWaffoOrder;

export async function completeCheckout(
  db: AppDb,
  polar: WaffoPort,
  checkoutId: string,
  now: Date = new Date(),
): Promise<Checkout> {
  if (!(polar instanceof FixtureWaffo)) {
    throw new ListingError("checkout_not_fixture", "live checkout completion is webhook-only", 409);
  }
  const local = polar.getCheckout(checkoutId);
  if (!local && !findCheckout(db, checkoutId)) {
    throw new ListingError("unknown_checkout", "checkout not found", 404);
  }
  if (local) await polar.complete(checkoutId);
  return applyPaidCheckout(db, checkoutId, now);
}
