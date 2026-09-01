-- Waffo intents are durable before the provider call. The table rebuild keeps
-- the six-column compatibility insert used by old fixture tests while adding
-- the immutable creation facts and reconciliation states.
ALTER TABLE checkouts RENAME TO checkouts_legacy_005;

CREATE TABLE checkouts (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  amount_usd INTEGER NOT NULL,
  target_bid_usd INTEGER NOT NULL,
  polar_checkout_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN (
    'creating', 'open', 'unknown', 'pending', 'pending_unknown',
    'paid', 'rejected', 'needs_reconciliation'
  )),
  board_key TEXT NOT NULL DEFAULT '',
  canonical_url TEXT NOT NULL DEFAULT '',
  blurb TEXT NOT NULL DEFAULT '',
  quote_base_bid_cents INTEGER NOT NULL DEFAULT 0,
  target_bid_cents INTEGER NOT NULL DEFAULT 0,
  charge_cents INTEGER NOT NULL DEFAULT 0,
  expected_store_id TEXT NOT NULL DEFAULT '',
  expected_product_id TEXT NOT NULL DEFAULT '',
  expected_mode TEXT NOT NULL DEFAULT '',
  expected_currency TEXT NOT NULL DEFAULT 'USD',
  expected_tax_category TEXT NOT NULL DEFAULT 'digital_goods',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  intent_fingerprint TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  checkout_expires_at TEXT,
  provider_order_id TEXT,
  provider_payment_id TEXT,
  last_event_id TEXT
);

INSERT INTO checkouts (
  id, listing_id, amount_usd, target_bid_usd, polar_checkout_id, status,
  board_key, canonical_url, blurb, quote_base_bid_cents, target_bid_cents,
  charge_cents, expected_store_id, expected_product_id, expected_mode,
  expected_currency, expected_tax_category, metadata_json, intent_fingerprint,
  created_at, updated_at
)
SELECT
  id,
  listing_id,
  amount_usd,
  target_bid_usd,
  polar_checkout_id,
  CASE status WHEN 'failed' THEN 'rejected' ELSE status END,
  '',
  '',
  '',
  CASE WHEN amount_usd < target_bid_usd THEN (target_bid_usd - amount_usd) * 100 ELSE 0 END,
  target_bid_usd * 100,
  amount_usd * 100,
  '',
  '',
  '',
  'USD',
  'digital_goods',
  '{}',
  'legacy:' || id,
  '',
  ''
FROM checkouts_legacy_005;

DROP TABLE checkouts_legacy_005;

-- Delivery IDs are unique. Business/payment/order/intent identities are
-- checked in the settlement transaction so changed replays can remain
-- auditable instead of being hidden by a uniqueness violation.
CREATE TABLE waffo_webhook_events (
  delivery_id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  business_event_id TEXT NOT NULL,
  payment_id TEXT,
  order_id TEXT,
  intent_id TEXT,
  store_id TEXT,
  mode TEXT,
  event_timestamp TEXT,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected', 'needs_reconciliation')),
  error_code TEXT,
  reason TEXT,
  payload_sha256 TEXT NOT NULL,
  event_fingerprint TEXT NOT NULL,
  metadata_json TEXT,
  received_at TEXT NOT NULL
);

CREATE INDEX waffo_webhook_events_business_event_idx
  ON waffo_webhook_events (event_type, business_event_id);
CREATE INDEX waffo_webhook_events_payment_idx
  ON waffo_webhook_events (payment_id);
CREATE INDEX waffo_webhook_events_order_idx
  ON waffo_webhook_events (order_id);
CREATE INDEX waffo_webhook_events_intent_idx
  ON waffo_webhook_events (intent_id);
