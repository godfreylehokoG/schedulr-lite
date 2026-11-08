# Supabase to Cloudflare Migration Map

## Current Legacy Inventory

| Previous area | Previous behavior | Cloudflare replacement |
| --- | --- | --- |
| `src/contexts/BookingContext.tsx` | Generated settings, slots and bookings in React memory | API-backed state through Worker routes and D1 |
| `src/components/BookingForm.tsx` | Created in-memory bookings, then invoked Supabase email/calendar side effects | `POST /api/public/business/:slug/bookings` with D1 write, Turnstile verification and idempotency |
| Public owner switch | Anyone could toggle owner mode in the browser | `/owner` route plus Cloudflare Access and D1 membership authorization |
| `scripts/setup-database.sql` | PostgreSQL/Supabase SQL with RLS policies | Ordered SQLite/D1 migrations in `migrations/` |
| Supabase Edge Functions | Resend email function examples | Preserved in `legacy/supabase`; not active in ZeroBooker |
| Supabase Google OAuth | Calendar sync through Supabase auth session | Removed from active UI; owner identity is Cloudflare Access |
| Supabase tests/scripts | Validated Supabase tables/functions/OAuth | Preserved in `legacy/supabase`; active checks are Wrangler, Vitest, typecheck, lint and build |

## Active Cloudflare Surface

Public Worker routes:

- `GET /api/public/business/:slug`
- `GET /api/public/business/:slug/availability`
- `POST /api/public/business/:slug/bookings`

Owner Worker routes:

- `GET /api/owner/businesses`
- `GET /api/owner/business/:id/bookings`
- `PATCH /api/owner/bookings/:id/status`
- `GET /api/owner/business/:id/settings`
- `PUT /api/owner/business/:id/settings`
- `GET /api/owner/business/:id/working-hours`
- `PUT /api/owner/business/:id/working-hours`

## D1 Schema

The migrations create:

- `businesses`
- `business_members`
- `business_settings`
- `working_hours`
- `bookings`
- `booking_events`

Important constraints:

- Text UUID primary keys
- ISO-8601 UTC appointment timestamps
- Business timezone stored separately
- Status `CHECK` constraints
- Unique idempotency keys per business
- Unique active booking slot per business via `idx_bookings_business_active_slot_unique`
- Owner lookup indexes for business/date, status, email and working hours

## Double-Booking Protection

The public booking endpoint:

1. Normalizes the requested slot start to a canonical UTC timestamp.
2. Revalidates working hours and slot cadence inside the Worker.
3. Verifies Turnstile unless explicit local bypass is active.
4. Requires an idempotency key.
5. Inserts into D1 under a unique active-slot index.
6. Converts competing slot writes into `409 Conflict` with: `This time has just been booked. Please choose another slot.`

Durable Objects are not used in this milestone because the current booking model is fixed-duration slots. If variable-duration overlapping appointments are added, use a Durable Object keyed by `business_id` to serialize booking commands for that business.

## Owner Authentication

Cloudflare Access authenticates the person. D1 authorizes the business.

The Worker validates `Cf-Access-Jwt-Assertion` using the Cloudflare Access JWKS URL for the configured team domain and requires the configured AUD tag. Every owner API then checks `business_members` for the authenticated email.

Local development can use `DEV_ACCESS_EMAIL`. That bypass is disabled in production by checking `ENVIRONMENT`.

## Remaining Account Steps

These need your Cloudflare account and should happen only after approval:

- Create the remote D1 database and replace the production database ID.
- Create the Turnstile widget and store the secret with Wrangler.
- Create the Cloudflare Access application and policy for Godfrey and Vincent.
- Replace placeholder member emails in D1 with the approved owner emails.
- Apply remote migrations.
- Deploy the Worker/static assets.

No external Supabase project should be modified or deleted by this migration.
