-- A webhook is an external fact. Keep its provider identity and decision so
-- retries (including retries after a process restart) cannot apply a bid twice.
CREATE TABLE polar_webhook_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  provider_order_id TEXT NOT NULL,
  provider_checkout_id TEXT,
  local_checkout_id TEXT,
  product_id TEXT,
  currency TEXT,
  total_amount_cents INTEGER,
  status TEXT NOT NULL CHECK (status IN ('processed', 'rejected')),
  error_code TEXT,
  reason TEXT,
  payload_sha256 TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE UNIQUE INDEX polar_webhook_events_provider_order_id_uq
  ON polar_webhook_events (provider_order_id);
