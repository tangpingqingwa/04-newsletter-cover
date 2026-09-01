-- Forward-only repair for databases that already applied the first identity
-- reservation migration before rejected outcomes were made durable. Rebuild
-- the table so the database constraint matches the settlement contract, then
-- backfill any free identities from the immutable webhook ledger.
DROP INDEX IF EXISTS waffo_identity_reservations_delivery_idx;
ALTER TABLE waffo_identity_reservations RENAME TO waffo_identity_reservations_legacy_008;

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

INSERT OR IGNORE INTO waffo_identity_reservations (
  identity_type, identity_value, delivery_id, event_type, payload_sha256,
  event_fingerprint, outcome, reserved_at
)
SELECT identity_type, identity_value, delivery_id, event_type, payload_sha256,
       event_fingerprint, outcome, reserved_at
FROM waffo_identity_reservations_legacy_008;

-- Rejected events are immutable provider facts too. INSERT OR IGNORE preserves
-- the first reservation when an old accepted event already owns an identity;
-- subsequent signed deliveries still hit the event/conflict audit path.
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

DROP TABLE waffo_identity_reservations_legacy_008;

CREATE INDEX waffo_identity_reservations_delivery_idx
  ON waffo_identity_reservations (delivery_id);
