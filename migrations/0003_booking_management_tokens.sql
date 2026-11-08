PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customer_cancellation_tokens (
  token_hash TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_tokens_booking ON customer_cancellation_tokens(booking_id);
CREATE INDEX IF NOT EXISTS idx_customer_tokens_business ON customer_cancellation_tokens(business_id);
CREATE INDEX IF NOT EXISTS idx_customer_tokens_expires ON customer_cancellation_tokens(expires_at);
