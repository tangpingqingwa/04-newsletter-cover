-- listing_id is allocated before pay; unpaid checkouts must not require a listings row
CREATE TABLE checkouts (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  amount_usd INTEGER NOT NULL,
  target_bid_usd INTEGER NOT NULL,
  polar_checkout_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed'))
);
