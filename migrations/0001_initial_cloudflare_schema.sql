PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg' CHECK (length(timezone) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS business_members (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (business_id, email)
);

CREATE TABLE IF NOT EXISTS business_settings (
  business_id TEXT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_duration_minutes IN (10, 15, 20, 30, 45, 60)),
  owner_notification_email TEXT CHECK (owner_notification_email IS NULL OR length(owner_notification_email) <= 254),
  turnstile_required INTEGER NOT NULL DEFAULT 1 CHECK (turnstile_required IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS working_hours (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  end_time TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (business_id, weekday),
  CHECK (start_time < end_time)
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 120),
  customer_email TEXT NOT NULL CHECK (length(customer_email) BETWEEN 3 AND 254),
  customer_phone TEXT CHECK (customer_phone IS NULL OR length(customer_phone) <= 40),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  appointment_start_utc TEXT NOT NULL,
  appointment_end_utc TEXT NOT NULL,
  canonical_slot_start_utc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (business_id, idempotency_key),
  CHECK (appointment_start_utc = canonical_slot_start_utc),
  CHECK (appointment_start_utc < appointment_end_utc)
);

CREATE TABLE IF NOT EXISTS booking_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  actor_email TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'status_changed')),
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  to_status TEXT CHECK (to_status IS NULL OR to_status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_business_members_email ON business_members(email);
CREATE INDEX IF NOT EXISTS idx_working_hours_business_weekday ON working_hours(business_id, weekday);
CREATE INDEX IF NOT EXISTS idx_bookings_business_start ON bookings(business_id, appointment_start_utc);
CREATE INDEX IF NOT EXISTS idx_bookings_business_status ON bookings(business_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_email_owner_lookup ON bookings(business_id, customer_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_business_active_slot_unique
  ON bookings(business_id, canonical_slot_start_utc)
  WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_booking_events_business_booking ON booking_events(business_id, booking_id);
