# ZeroBooker

ZeroBooker is a lightweight appointment booking app for Zero Index.

The active stack is:

- React, Vite and TypeScript for the frontend
- Cloudflare Workers Static Assets for hosting the built SPA
- Cloudflare Workers for all APIs
- Cloudflare D1 for relational persistence
- Cloudflare Access for owner authentication
- Cloudflare Turnstile for public booking-form verification
- Cloudflare Email Sending for booking confirmation emails and calendar attachments
- Wrangler for local development, migrations and deployment
- Vitest for unit and Worker request-path tests

Supabase is no longer an active backend dependency. The previous Supabase files are preserved under `legacy/supabase` for reference only.

## Local Setup

```sh
npm install
copy .dev.vars.example .dev.vars
npm run migrations:local
npm run dev
```

`npm run dev` builds the Vite app and serves the Worker plus static assets through Wrangler at `http://127.0.0.1:8787`.
The example `.dev.vars` leaves Turnstile unset so local bookings use the explicit development bypass. Add real Turnstile keys only when you want to test the widget locally.
Email delivery is skipped until the Cloudflare `EMAIL` binding and `EMAIL_FROM_ADDRESS` are configured. The sender domain must be onboarded to Cloudflare Email Service.

For frontend-only iteration, run the Worker and Vite separately:

```sh
npm run dev:worker
npm run dev:vite
```

Vite proxies `/api` to `http://127.0.0.1:8787`.

## Scripts

- `npm run dev`: production-build the SPA, then run Wrangler locally
- `npm run dev:vite`: Vite dev server only
- `npm run dev:worker`: Wrangler dev server only
- `npm run migrations:local`: apply D1 migrations to local Wrangler state
- `npm run migrations:remote`: apply D1 migrations to the remote Cloudflare D1 database
- `npm run typecheck`: typecheck frontend, Worker and Vite config
- `npm run lint`: run ESLint
- `npm run test`: run Vitest
- `npm run build`: create the production SPA build
- `npm run deploy`: deploy with Wrangler only after explicit approval

## Cloudflare Setup

Remote deployment is intentionally not automatic.

1. Create a D1 database named `zero-booker` in Cloudflare.
2. Replace the production `database_id` placeholder in `wrangler.jsonc`.
3. Create a Turnstile widget and set `TURNSTILE_SITE_KEY` as a Wrangler var.
4. Store the Turnstile secret with `wrangler secret put TURNSTILE_SECRET_KEY`.
5. Create a Cloudflare Access application for owner routes.
6. Protect `/owner/*` and `/api/owner/*`; keep `/book/*` and `/api/public/*` public.
7. Copy the Access AUD tag into `ACCESS_AUD` and set `ACCESS_TEAM_DOMAIN`.
8. Add Godfrey and Vincent's approved email addresses to the Access policy.
9. Update the D1 `business_members` rows so those exact lowercased emails are members of ZeroBooker.
10. Apply remote migrations with `npm run migrations:remote`.
11. Set `PUBLIC_APP_URL` to the production booking origin so emailed manage links are stable.
12. Onboard the sender domain in Cloudflare Email Service and set `EMAIL_FROM_ADDRESS`.
13. Optional: create a Google OAuth web client and set `GOOGLE_CLIENT_ID` to enable the quick-fill button.
14. Deploy only after approval with `npm run deploy -- --env production`.

`GOOGLE_CLIENT_ID` must be the OAuth **Web application Client ID**, for example
`1234567890-example.apps.googleusercontent.com`. Do not use the Google Cloud project ID;
Google returns `invalid_client` when a project ID is passed to Sign In With Google.

## Email, Calendar and Manage Links

When a public booking is created, the Worker stores a hashed management token in D1 and emails the customer a secure `/manage/:token` link. That page lets the customer cancel or reschedule future confirmed bookings. The confirmation and cancellation emails include an `.ics` calendar attachment, and confirmations include an "Add to Google Calendar" link.

Fully automatic Google Calendar insertion requires a separate Google OAuth flow with Calendar API consent and stored refresh tokens. The current implementation uses the safer no-account version: Google quick-fill for name/email plus a customer-controlled calendar link.

Cloudflare Email Sending is configured through the Worker `send_email` binding named `EMAIL`. Sender addresses must belong to a domain that has been onboarded to Cloudflare Email Service.

## Security Notes

- The browser never connects to D1 directly.
- Public APIs only return business metadata, availability and booking confirmations.
- Owner APIs validate Cloudflare Access JWTs and then check D1 business membership.
- Local owner access uses `DEV_ACCESS_EMAIL`; the Worker ignores that bypass when `ENVIRONMENT=production`.
- Turnstile tokens are verified inside the Worker. Missing Turnstile secrets are allowed only for explicit local bypass.
- `.dev.vars`, `.env` files and Wrangler local state are ignored by git.

See `docs/cloudflare-migration-map.md` for the detailed Supabase-to-Cloudflare mapping.
