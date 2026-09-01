-- Canonical accepted/reconciled identities are unique at the database
-- boundary. Rejected delivery attempts remain repeatable audit rows so a
-- changed signed payload can be retained without replacing the first event.
CREATE UNIQUE INDEX waffo_accepted_business_event_uq
  ON waffo_webhook_events (event_type, business_event_id)
  WHERE status = 'accepted';

CREATE UNIQUE INDEX waffo_accepted_payment_uq
  ON waffo_webhook_events (payment_id)
  WHERE status = 'accepted' AND payment_id IS NOT NULL;

CREATE UNIQUE INDEX waffo_accepted_order_uq
  ON waffo_webhook_events (order_id)
  WHERE status = 'accepted' AND order_id IS NOT NULL;

CREATE UNIQUE INDEX waffo_accepted_intent_uq
  ON waffo_webhook_events (intent_id)
  WHERE status = 'accepted' AND intent_id IS NOT NULL;
