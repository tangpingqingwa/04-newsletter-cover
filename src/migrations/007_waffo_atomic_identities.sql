-- The provider session URL and verified money facts are recoverable local
-- state. They are attached after the provider response and never inferred from
-- the browser return route.
ALTER TABLE checkouts ADD COLUMN checkout_url TEXT;
ALTER TABLE checkouts ADD COLUMN provider_amount_cents INTEGER;
ALTER TABLE checkouts ADD COLUMN provider_tax_cents INTEGER;
ALTER TABLE checkouts ADD COLUMN provider_subtotal_cents INTEGER;
ALTER TABLE checkouts ADD COLUMN provider_total_cents INTEGER;

ALTER TABLE waffo_webhook_events ADD COLUMN amount_cents INTEGER;
ALTER TABLE waffo_webhook_events ADD COLUMN tax_cents INTEGER;
ALTER TABLE waffo_webhook_events ADD COLUMN subtotal_cents INTEGER;
ALTER TABLE waffo_webhook_events ADD COLUMN total_cents INTEGER;

-- The reservation table below is the durable uniqueness boundary. The older
-- accepted-only indexes cannot represent an exact retry under a new delivery
-- id because they reject the retry's append-only ledger row before the
-- transaction can classify it as a no-op.
DROP INDEX IF EXISTS waffo_accepted_business_event_uq;
DROP INDEX IF EXISTS waffo_accepted_payment_uq;
DROP INDEX IF EXISTS waffo_accepted_order_uq;
DROP INDEX IF EXISTS waffo_accepted_intent_uq;

-- A reservation exists for every delivery/business/payment/order/intent
-- identity that reaches an accepted, rejected, or reconciliation outcome. This table is
-- the concurrent database boundary; the event ledger remains the immutable
-- payload/outcome log.
CREATE TABLE waffo_identity_reservations (
  identity_type TEXT NOT NULL CHECK (
    identity_type IN ('delivery', 'business_event', 'payment', 'order', 'intent')
  ),
  identity_value TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  event_fingerprint TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'needs_reconciliation')),
  reserved_at TEXT NOT NULL,
  PRIMARY KEY (identity_type, identity_value)
);

CREATE INDEX waffo_identity_reservations_delivery_idx
  ON waffo_identity_reservations (delivery_id);

-- Never overwrite a first-seen identity. A changed signed payload gets its
-- own append-only conflict row for operator reconciliation/audit.
CREATE TABLE waffo_identity_conflicts (
  conflict_id TEXT PRIMARY KEY NOT NULL,
  identity_type TEXT NOT NULL,
  identity_value TEXT NOT NULL,
  existing_delivery_id TEXT NOT NULL,
  incoming_delivery_id TEXT NOT NULL,
  existing_payload_sha256 TEXT NOT NULL,
  incoming_payload_sha256 TEXT NOT NULL,
  existing_event_fingerprint TEXT NOT NULL,
  incoming_event_fingerprint TEXT NOT NULL,
  reason TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE UNIQUE INDEX waffo_identity_conflicts_repeat_uq
  ON waffo_identity_conflicts (
    identity_type,
    identity_value,
    incoming_delivery_id,
    incoming_event_fingerprint
  );

-- Backfill every durable outcome from the interrupted Waffo implementation.
-- Rejected payloads are immutable provider facts too: keeping them here closes
-- the changed-replay path that could otherwise settle the same payment later.
INSERT OR IGNORE INTO waffo_identity_reservations (
  identity_type, identity_value, delivery_id, event_type, payload_sha256,
  event_fingerprint, outcome, reserved_at
)
SELECT 'delivery', delivery_id, delivery_id, event_type, payload_sha256,
       event_fingerprint, status, received_at
FROM waffo_webhook_events
WHERE status IN ('accepted', 'rejected', 'needs_reconciliation');

INSERT OR IGNORE INTO waffo_identity_reservations (
  identity_type, identity_value, delivery_id, event_type, payload_sha256,
  event_fingerprint, outcome, reserved_at
)
SELECT 'business_event', event_type || ':' || business_event_id, delivery_id,
       event_type, payload_sha256, event_fingerprint, status, received_at
FROM waffo_webhook_events
WHERE status IN ('accepted', 'rejected', 'needs_reconciliation')
  AND business_event_id <> '';

INSERT OR IGNORE INTO waffo_identity_reservations (
  identity_type, identity_value, delivery_id, event_type, payload_sha256,
  event_fingerprint, outcome, reserved_at
)
SELECT 'payment', payment_id, delivery_id, event_type, payload_sha256,
       event_fingerprint, status, received_at
FROM waffo_webhook_events
WHERE status IN ('accepted', 'rejected', 'needs_reconciliation')
  AND payment_id IS NOT NULL AND payment_id <> '';

INSERT OR IGNORE INTO waffo_identity_reservations (
  identity_type, identity_value, delivery_id, event_type, payload_sha256,
  event_fingerprint, outcome, reserved_at
)
SELECT 'order', order_id, delivery_id, event_type, payload_sha256,
       event_fingerprint, status, received_at
FROM waffo_webhook_events
WHERE status IN ('accepted', 'rejected', 'needs_reconciliation')
  AND order_id IS NOT NULL AND order_id <> '';

INSERT OR IGNORE INTO waffo_identity_reservations (
  identity_type, identity_value, delivery_id, event_type, payload_sha256,
  event_fingerprint, outcome, reserved_at
)
SELECT 'intent', intent_id, delivery_id, event_type, payload_sha256,
       event_fingerprint, status, received_at
FROM waffo_webhook_events
WHERE status IN ('accepted', 'rejected', 'needs_reconciliation')
  AND intent_id IS NOT NULL AND intent_id <> '';
