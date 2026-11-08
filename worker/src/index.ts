import { createRemoteJWKSet, jwtVerify } from "jose";
import { z, ZodError } from "zod";
import {
  addDaysIsoDate,
  daysBetweenInclusive,
  generateAvailabilitySlots,
  getZonedParts,
  normalizeUtcIso,
  validateCanonicalSlot,
  zonedTimeToUtc,
  type WorkingHourRecord,
} from "./time";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  EMAIL?: SendEmail;
  ENVIRONMENT?: string;
  PUBLIC_ORIGIN?: string;
  PUBLIC_APP_URL?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  EMAIL_FROM_ADDRESS?: string;
  DEFAULT_OWNER_EMAIL?: string;
  DEV_ACCESS_EMAIL?: string;
}

type BookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";

interface BusinessRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  timezone: string;
}

interface SettingsRow {
  slot_duration_minutes: number;
  owner_notification_email: string | null;
  turnstile_required: number;
}

interface BookingRow {
  id: string;
  business_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  notes: string | null;
  appointment_start_utc: string;
  appointment_end_utc: string;
  canonical_slot_start_utc: string;
  status: BookingStatus;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

interface ManagedBookingRow extends BookingRow {
  business_slug: string;
  business_name: string;
  business_timezone: string;
  slot_duration_minutes: number;
  owner_notification_email: string | null;
  token_expires_at: string;
}

interface OwnerIdentity {
  email: string;
  source: "cloudflare-access" | "google" | "local-dev";
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public safeMessage: string,
  ) {
    super(safeMessage);
  }
}

const MAX_JSON_BYTES = 8192;
const MAX_AVAILABILITY_DAYS = 60;
const MANAGEMENT_TOKEN_TTL_AFTER_APPOINTMENT_MS = 30 * 24 * 60 * 60 * 1000;
const BOOKING_STATUSES: BookingStatus[] = ["confirmed", "cancelled", "completed", "no_show"];

const bookingRequestSchema = z.object({
  slotStartUtc: z.string().min(20).max(40),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().trim().email().max(254),
  customerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  turnstileToken: z.string().max(2048).optional().or(z.literal("")),
  idempotencyKey: z.string().trim().min(8).max(120),
});

const settingsSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  timezone: z.string().trim().min(1).max(80).refine(isValidTimeZone, "Invalid timezone."),
  slotDuration: z.number().int().refine((value) => [10, 15, 20, 30, 45, 60].includes(value)),
  ownerEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
});

const workingHourSchema = z.object({
  day: z.number().int().min(0).max(6),
  enabled: z.boolean(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

const workingHoursRequestSchema = z.object({
  workingHours: z.array(workingHourSchema).length(7),
});

const statusRequestSchema = z.object({
  status: z.enum(["confirmed", "cancelled", "completed", "no_show"]),
});

const managementTokenSchema = z.string().trim().min(24).max(200);

const cancelBookingSchema = z.object({
  token: managementTokenSchema,
});

const rescheduleBookingSchema = z.object({
  token: managementTokenSchema,
  slotStartUtc: z.string().min(20).max(40),
});

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return corsResponse(request, env, null, 204);
    }

    try {
      if (url.pathname.startsWith("/api/")) {
        const response = await handleApi(request, env, url, ctx);
        return withCors(request, env, response);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return withCors(request, env, handleError(error, request));
    }
  },
};

async function handleApi(
  request: Request,
  env: Env,
  url: URL,
  ctx: ExecutionContext,
): Promise<Response> {
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments[1] === "health" && request.method === "GET") {
    return jsonOk({ service: "zerobooker", status: "ok" });
  }

  if (segments[1] === "public") {
    return handlePublic(request, env, url, segments, ctx);
  }

  if (segments[1] === "owner") {
    return handleOwner(request, env, url, segments);
  }

  throw new HttpError(404, "not_found", "Endpoint not found.");
}

async function handlePublic(
  request: Request,
  env: Env,
  url: URL,
  segments: string[],
  ctx: ExecutionContext,
): Promise<Response> {
  if (segments[2] === "bookings") {
    if (request.method === "GET" && segments[3] === "manage" && segments[4]) {
      return getManagedBooking(request, env, segments[4]);
    }

    if (request.method === "POST" && segments[3] === "cancel") {
      return cancelManagedBooking(request, env, ctx);
    }

    if (request.method === "POST" && segments[3] === "reschedule") {
      return rescheduleManagedBooking(request, env, ctx);
    }
  }

  if (segments[2] !== "business" || !segments[3]) {
    throw new HttpError(404, "not_found", "Endpoint not found.");
  }

  const slug = segments[3];
  const bundle = await getBusinessBundleBySlug(env, slug);

  if (request.method === "GET" && segments.length === 4) {
    return jsonOk({ business: publicBusinessPayload(bundle, env) });
  }

  if (request.method === "GET" && segments[4] === "availability") {
    return jsonOk({
      availability: await getAvailability(env, bundle, url),
    });
  }

  if (request.method === "POST" && segments[4] === "bookings") {
    return createPublicBooking(request, env, bundle, ctx);
  }

  throw new HttpError(404, "not_found", "Endpoint not found.");
}

async function handleOwner(
  request: Request,
  env: Env,
  url: URL,
  segments: string[],
): Promise<Response> {
  const identity = await requireOwnerIdentity(request, env);

  if (request.method === "GET" && segments.length === 2) {
    return jsonOk({ identity });
  }

  if (request.method === "GET" && segments[2] === "businesses") {
    const { results } = await env.DB.prepare(
      `SELECT b.id, b.slug, b.name, b.description, b.timezone, m.role
       FROM business_members m
       JOIN businesses b ON b.id = m.business_id
       WHERE m.email = ?
       ORDER BY b.name ASC`,
    )
      .bind(identity.email)
      .all<BusinessRow & { role: string }>();

    return jsonOk({ businesses: results.map((row) => ({ ...row, role: row.role })) });
  }

  if (segments[2] === "business" && segments[3]) {
    const businessId = segments[3];
    await requireBusinessMembership(env, businessId, identity.email);

    if (request.method === "GET" && segments[4] === "bookings") {
      return jsonOk({
        bookings: await getOwnerBookings(env, businessId, url),
      });
    }

    if (request.method === "GET" && segments[4] === "settings") {
      const bundle = await getBusinessBundleById(env, businessId);
      return jsonOk({ settings: ownerSettingsPayload(bundle) });
    }

    if (request.method === "PUT" && segments[4] === "settings") {
      return updateOwnerSettings(request, env, businessId);
    }

    if (request.method === "GET" && segments[4] === "working-hours") {
      const hours = await getWorkingHours(env, businessId);
      return jsonOk({ workingHours: hours.map(toClientWorkingHour) });
    }

    if (request.method === "PUT" && segments[4] === "working-hours") {
      return updateOwnerWorkingHours(request, env, businessId);
    }
  }

  if (segments[2] === "bookings" && segments[3] && segments[4] === "status") {
    if (request.method !== "PATCH") {
      throw new HttpError(405, "method_not_allowed", "Method not allowed.");
    }

    return updateBookingStatus(request, env, segments[3], identity);
  }

  throw new HttpError(404, "not_found", "Endpoint not found.");
}

async function getBusinessBundleBySlug(env: Env, slug: string) {
  const business = await env.DB.prepare(
    `SELECT id, slug, name, description, timezone FROM businesses WHERE slug = ?`,
  )
    .bind(slug)
    .first<BusinessRow>();

  if (!business) {
    throw new HttpError(404, "business_not_found", "Business not found.");
  }

  const [settings, workingHours] = await Promise.all([
    getSettings(env, business.id),
    getWorkingHours(env, business.id),
  ]);

  return { business, settings, workingHours };
}

async function getBusinessBundleById(env: Env, id: string) {
  const business = await env.DB.prepare(
    `SELECT id, slug, name, description, timezone FROM businesses WHERE id = ?`,
  )
    .bind(id)
    .first<BusinessRow>();

  if (!business) {
    throw new HttpError(404, "business_not_found", "Business not found.");
  }

  const [settings, workingHours] = await Promise.all([
    getSettings(env, business.id),
    getWorkingHours(env, business.id),
  ]);

  return { business, settings, workingHours };
}

async function getSettings(env: Env, businessId: string): Promise<SettingsRow> {
  const settings = await env.DB.prepare(
    `SELECT slot_duration_minutes, owner_notification_email, turnstile_required
     FROM business_settings
     WHERE business_id = ?`,
  )
    .bind(businessId)
    .first<SettingsRow>();

  if (!settings) {
    throw new HttpError(500, "settings_missing", "Business settings are not configured.");
  }

  return settings;
}

async function getWorkingHours(env: Env, businessId: string): Promise<WorkingHourRecord[]> {
  const { results } = await env.DB.prepare(
    `SELECT weekday, enabled, start_time, end_time
     FROM working_hours
     WHERE business_id = ?
     ORDER BY weekday ASC`,
  )
    .bind(businessId)
    .all<WorkingHourRecord>();

  return results;
}

async function getAvailability(
  env: Env,
  bundle: Awaited<ReturnType<typeof getBusinessBundleBySlug>>,
  url: URL,
) {
  const today = getZonedParts(new Date(), bundle.business.timezone).date;
  const from = url.searchParams.get("from") || today;
  const to = url.searchParams.get("to") || addDaysIsoDate(from, 30);

  validateDateRange(from, to);

  const endExclusive = addDaysIsoDate(to, 1);
  const { results } = await env.DB.prepare(
    `SELECT canonical_slot_start_utc
     FROM bookings
     WHERE business_id = ?
       AND status = 'confirmed'
       AND appointment_start_utc >= ?
       AND appointment_start_utc < ?`,
  )
    .bind(
      bundle.business.id,
      zonedTimeToUtc(from, "00:00", bundle.business.timezone).toISOString(),
      zonedTimeToUtc(endExclusive, "00:00", bundle.business.timezone).toISOString(),
    )
    .all<{ canonical_slot_start_utc: string }>();

  const bookedStarts = new Set(results.map((row) => normalizeUtcIso(row.canonical_slot_start_utc)));
  return generateAvailabilitySlots(
    from,
    to,
    bundle.business.timezone,
    bundle.settings.slot_duration_minutes,
    bundle.workingHours,
    bookedStarts,
  );
}

async function createPublicBooking(
  request: Request,
  env: Env,
  bundle: Awaited<ReturnType<typeof getBusinessBundleBySlug>>,
  ctx: ExecutionContext,
): Promise<Response> {
  const body = bookingRequestSchema.parse(await readJson(request));
  const customerEmail = normalizeEmail(body.customerEmail);
  const customerPhone = normalizePhone(body.customerPhone);
  const idempotencyKey = body.idempotencyKey.trim();

  await verifyTurnstile(request, env, body.turnstileToken, idempotencyKey);

  const slot = validateCanonicalSlot(
    body.slotStartUtc,
    bundle.business.timezone,
    bundle.settings.slot_duration_minutes,
    bundle.workingHours,
  );

  if (new Date(slot.startUtc).getTime() < Date.now() - 60_000) {
    throw new HttpError(400, "slot_in_past", "Please choose a future slot.");
  }

  const existingIdempotent = await getBookingByIdempotencyKey(
    env,
    bundle.business.id,
    idempotencyKey,
  );

  if (existingIdempotent) {
    return jsonOk({ confirmation: publicConfirmation(existingIdempotent, bundle.business) });
  }

  const bookingId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  const managementToken = await newManagementToken(slot.endUtc);

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO bookings (
          id,
          business_id,
          customer_name,
          customer_email,
          customer_phone,
          notes,
          appointment_start_utc,
          appointment_end_utc,
          canonical_slot_start_utc,
          status,
          idempotency_key,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`,
      ).bind(
        bookingId,
        bundle.business.id,
        body.customerName.trim(),
        customerEmail,
        customerPhone,
        cleanOptionalText(body.notes),
        slot.startUtc,
        slot.endUtc,
        slot.startUtc,
        idempotencyKey,
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO booking_events (
          id,
          booking_id,
          business_id,
          actor_email,
          event_type,
          from_status,
          to_status,
          metadata,
          created_at
        )
        VALUES (?, ?, ?, NULL, 'created', NULL, 'confirmed', ?, ?)`,
      ).bind(
        eventId,
        bookingId,
        bundle.business.id,
        JSON.stringify({ source: "public_booking" }),
        now,
      ),
      env.DB.prepare(
        `INSERT INTO customer_cancellation_tokens (
          token_hash,
          booking_id,
          business_id,
          expires_at,
          created_at
        )
        VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        managementToken.hash,
        bookingId,
        bundle.business.id,
        managementToken.expiresAt,
        now,
      ),
    ]);
  } catch (error) {
    const idempotentAfterRace = await getBookingByIdempotencyKey(
      env,
      bundle.business.id,
      idempotencyKey,
    );
    if (idempotentAfterRace) {
      return jsonOk({ confirmation: publicConfirmation(idempotentAfterRace, bundle.business) });
    }

    const conflictingBooking = await env.DB.prepare(
      `SELECT id
       FROM bookings
       WHERE business_id = ?
         AND canonical_slot_start_utc = ?
         AND status = 'confirmed'
       LIMIT 1`,
    )
      .bind(bundle.business.id, slot.startUtc)
      .first<{ id: string }>();

    if (conflictingBooking) {
      throw new HttpError(
        409,
        "slot_conflict",
        "This time has just been booked. Please choose another slot.",
      );
    }

    throw error;
  }

  const booking = await getBookingById(env, bookingId);
  const appBaseUrl = getAppBaseUrl(env, request);
  const manageUrl = buildManageUrl(appBaseUrl, managementToken.token);
  const googleCalendarUrl = buildGoogleCalendarUrl(booking, bundle.business, manageUrl);

  runInBackground(
    ctx,
    sendBookingEmails(env, booking, bundle.business, bundle.settings, {
      manageUrl,
      googleCalendarUrl,
      sequence: 0,
    }),
  );

  return jsonOk(
    {
      confirmation: publicConfirmation(booking, bundle.business, {
        manageUrl,
        googleCalendarUrl,
      }),
    },
    201,
  );
}

async function getManagedBooking(
  request: Request,
  env: Env,
  tokenSegment: string,
): Promise<Response> {
  const token = managementTokenSchema.parse(decodeURIComponent(tokenSegment));
  const { booking } = await getManagedBookingByToken(env, token);
  return jsonOk({
    booking: managedBookingPayload(booking, getAppBaseUrl(env, request), token),
  });
}

async function cancelManagedBooking(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const body = cancelBookingSchema.parse(await readJson(request));
  const { booking, tokenHash } = await getManagedBookingByToken(env, body.token);

  if (booking.status === "cancelled") {
    return jsonOk({
      booking: managedBookingPayload(booking, getAppBaseUrl(env, request), body.token),
    });
  }

  if (booking.status !== "confirmed") {
    throw new HttpError(409, "booking_not_active", "This booking can no longer be cancelled.");
  }

  if (new Date(booking.appointment_start_utc).getTime() <= Date.now()) {
    throw new HttpError(409, "booking_in_past", "Past bookings cannot be cancelled from this link.");
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE bookings
       SET status = 'cancelled', updated_at = ?
       WHERE id = ?`,
    ).bind(now, booking.id),
    env.DB.prepare(
      `INSERT INTO booking_events (
        id,
        booking_id,
        business_id,
        actor_email,
        event_type,
        from_status,
        to_status,
        metadata,
        created_at
      )
      VALUES (?, ?, ?, ?, 'status_changed', 'confirmed', 'cancelled', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      booking.id,
      booking.business_id,
      booking.customer_email,
      JSON.stringify({ source: "public_manage_link" }),
      now,
    ),
  ]);

  const updated = await getManagedBookingById(env, booking.id, tokenHash);
  const appBaseUrl = getAppBaseUrl(env, request);
  const manageUrl = buildManageUrl(appBaseUrl, body.token);

  runInBackground(
    ctx,
    sendCancellationEmail(env, updated, businessFromManaged(updated), settingsFromManaged(updated), {
      manageUrl,
      sequence: 1,
    }),
  );

  return jsonOk({
    booking: managedBookingPayload(updated, appBaseUrl, body.token),
  });
}

async function rescheduleManagedBooking(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const body = rescheduleBookingSchema.parse(await readJson(request));
  const { booking, tokenHash } = await getManagedBookingByToken(env, body.token);

  if (booking.status !== "confirmed") {
    throw new HttpError(409, "booking_not_active", "This booking can no longer be rescheduled.");
  }

  if (new Date(booking.appointment_start_utc).getTime() <= Date.now()) {
    throw new HttpError(409, "booking_in_past", "Past bookings cannot be rescheduled from this link.");
  }

  const bundle = await getBusinessBundleById(env, booking.business_id);
  const slot = validateCanonicalSlot(
    body.slotStartUtc,
    bundle.business.timezone,
    bundle.settings.slot_duration_minutes,
    bundle.workingHours,
  );

  if (new Date(slot.startUtc).getTime() < Date.now() - 60_000) {
    throw new HttpError(400, "slot_in_past", "Please choose a future slot.");
  }

  if (normalizeUtcIso(booking.canonical_slot_start_utc) === slot.startUtc) {
    return jsonOk({
      booking: managedBookingPayload(booking, getAppBaseUrl(env, request), body.token),
    });
  }

  const conflictingBooking = await env.DB.prepare(
    `SELECT id
     FROM bookings
     WHERE business_id = ?
       AND canonical_slot_start_utc = ?
       AND status = 'confirmed'
       AND id != ?
     LIMIT 1`,
  )
    .bind(booking.business_id, slot.startUtc, booking.id)
    .first<{ id: string }>();

  if (conflictingBooking) {
    throw new HttpError(
      409,
      "slot_conflict",
      "This time has just been booked. Please choose another slot.",
    );
  }

  const now = new Date().toISOString();

  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE bookings
         SET appointment_start_utc = ?,
             appointment_end_utc = ?,
             canonical_slot_start_utc = ?,
             updated_at = ?
         WHERE id = ? AND status = 'confirmed'`,
      ).bind(slot.startUtc, slot.endUtc, slot.startUtc, now, booking.id),
      env.DB.prepare(
        `INSERT INTO booking_events (
          id,
          booking_id,
          business_id,
          actor_email,
          event_type,
          from_status,
          to_status,
          metadata,
          created_at
        )
        VALUES (?, ?, ?, ?, 'status_changed', 'confirmed', 'confirmed', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        booking.id,
        booking.business_id,
        booking.customer_email,
        JSON.stringify({
          source: "public_reschedule",
          fromStartUtc: booking.appointment_start_utc,
          toStartUtc: slot.startUtc,
        }),
        now,
      ),
    ]);
  } catch (error) {
    const conflictAfterRace = await env.DB.prepare(
      `SELECT id
       FROM bookings
       WHERE business_id = ?
         AND canonical_slot_start_utc = ?
         AND status = 'confirmed'
         AND id != ?
       LIMIT 1`,
    )
      .bind(booking.business_id, slot.startUtc, booking.id)
      .first<{ id: string }>();

    if (conflictAfterRace) {
      throw new HttpError(
        409,
        "slot_conflict",
        "This time has just been booked. Please choose another slot.",
      );
    }

    throw error;
  }

  const updated = await getManagedBookingById(env, booking.id, tokenHash);
  const appBaseUrl = getAppBaseUrl(env, request);
  const manageUrl = buildManageUrl(appBaseUrl, body.token);
  const googleCalendarUrl = buildGoogleCalendarUrl(updated, businessFromManaged(updated), manageUrl);

  runInBackground(
    ctx,
    sendBookingEmails(env, updated, businessFromManaged(updated), settingsFromManaged(updated), {
      manageUrl,
      googleCalendarUrl,
      sequence: 1,
    }),
  );

  return jsonOk({
    booking: managedBookingPayload(updated, appBaseUrl, body.token),
  });
}

async function getManagedBookingByToken(env: Env, token: string) {
  const tokenHash = await hashToken(token);
  const booking = await env.DB.prepare(
    `SELECT
       b.*,
       business.slug AS business_slug,
       business.name AS business_name,
       business.timezone AS business_timezone,
       settings.slot_duration_minutes,
       settings.owner_notification_email,
       token.expires_at AS token_expires_at
     FROM customer_cancellation_tokens token
     JOIN bookings b ON b.id = token.booking_id
     JOIN businesses business ON business.id = b.business_id
     JOIN business_settings settings ON settings.business_id = b.business_id
     WHERE token.token_hash = ?
     LIMIT 1`,
  )
    .bind(tokenHash)
    .first<ManagedBookingRow>();

  if (!booking) {
    throw new HttpError(404, "manage_link_not_found", "This booking link was not found.");
  }

  if (new Date(booking.token_expires_at).getTime() <= Date.now()) {
    throw new HttpError(410, "manage_link_expired", "This booking link has expired.");
  }

  await env.DB.prepare(
    `UPDATE customer_cancellation_tokens
     SET last_used_at = ?
     WHERE token_hash = ?`,
  )
    .bind(new Date().toISOString(), tokenHash)
    .run();

  return { booking, tokenHash };
}

async function getManagedBookingById(
  env: Env,
  bookingId: string,
  tokenHash: string,
): Promise<ManagedBookingRow> {
  const booking = await env.DB.prepare(
    `SELECT
       b.*,
       business.slug AS business_slug,
       business.name AS business_name,
       business.timezone AS business_timezone,
       settings.slot_duration_minutes,
       settings.owner_notification_email,
       token.expires_at AS token_expires_at
     FROM bookings b
     JOIN businesses business ON business.id = b.business_id
     JOIN business_settings settings ON settings.business_id = b.business_id
     JOIN customer_cancellation_tokens token ON token.booking_id = b.id
     WHERE b.id = ? AND token.token_hash = ?
     LIMIT 1`,
  )
    .bind(bookingId, tokenHash)
    .first<ManagedBookingRow>();

  if (!booking) {
    throw new HttpError(404, "booking_not_found", "Booking not found.");
  }

  return booking;
}

function managedBookingPayload(booking: ManagedBookingRow, appBaseUrl: string, token: string) {
  const localStart = getZonedParts(new Date(booking.appointment_start_utc), booking.business_timezone);
  const localEnd = getZonedParts(new Date(booking.appointment_end_utc), booking.business_timezone);
  const business = businessFromManaged(booking);
  const manageUrl = buildManageUrl(appBaseUrl, token);
  const isFuture = new Date(booking.appointment_start_utc).getTime() > Date.now();

  return {
    id: booking.id,
    businessId: booking.business_id,
    businessSlug: booking.business_slug,
    businessName: booking.business_name,
    timezone: booking.business_timezone,
    status: booking.status,
    customerName: booking.customer_name,
    customerEmail: booking.customer_email,
    customerPhone: booking.customer_phone || "",
    notes: booking.notes || "",
    date: localStart.date,
    startTime: localStart.time,
    endTime: localEnd.time,
    appointmentStartUtc: booking.appointment_start_utc,
    appointmentEndUtc: booking.appointment_end_utc,
    manageUrl,
    googleCalendarUrl: buildGoogleCalendarUrl(booking, business, manageUrl),
    canCancel: booking.status === "confirmed" && isFuture,
    canReschedule: booking.status === "confirmed" && isFuture,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
  };
}

async function getOwnerBookings(env: Env, businessId: string, url: URL) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let sql = `SELECT *
             FROM bookings
             WHERE business_id = ?`;
  const bindings: unknown[] = [businessId];

  if (from && to) {
    validateDateRange(from, to);
    sql += ` AND appointment_start_utc >= ? AND appointment_start_utc < ?`;
    bindings.push(`${from}T00:00:00.000Z`, `${addDaysIsoDate(to, 1)}T00:00:00.000Z`);
  }

  sql += ` ORDER BY appointment_start_utc ASC`;

  const { results } = await env.DB.prepare(sql)
    .bind(...bindings)
    .all<BookingRow>();

  return results.map(mapOwnerBooking);
}

async function updateOwnerSettings(
  request: Request,
  env: Env,
  businessId: string,
): Promise<Response> {
  const body = settingsSchema.parse(await readJson(request));
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE businesses
       SET name = ?, description = ?, timezone = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(body.businessName, body.description, body.timezone, now, businessId),
    env.DB.prepare(
      `UPDATE business_settings
       SET slot_duration_minutes = ?, owner_notification_email = ?, updated_at = ?
       WHERE business_id = ?`,
    ).bind(body.slotDuration, cleanOptionalText(body.ownerEmail), now, businessId),
  ]);

  const bundle = await getBusinessBundleById(env, businessId);
  return jsonOk({ settings: ownerSettingsPayload(bundle) });
}

async function updateOwnerWorkingHours(
  request: Request,
  env: Env,
  businessId: string,
): Promise<Response> {
  const body = workingHoursRequestSchema.parse(await readJson(request));
  const weekdays = new Set(body.workingHours.map((entry) => entry.day));
  if (weekdays.size !== 7) {
    throw new HttpError(400, "invalid_working_hours", "Working hours must include each weekday once.");
  }

  const now = new Date().toISOString();
  const statements = body.workingHours.map((entry) =>
    env.DB.prepare(
      `INSERT INTO working_hours (
        id,
        business_id,
        weekday,
        enabled,
        start_time,
        end_time,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(business_id, weekday)
      DO UPDATE SET
        enabled = excluded.enabled,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        updated_at = excluded.updated_at`,
    ).bind(
      crypto.randomUUID(),
      businessId,
      entry.day,
      entry.enabled ? 1 : 0,
      entry.startTime,
      entry.endTime,
      now,
      now,
    ),
  );

  await env.DB.batch(statements);

  const workingHours = await getWorkingHours(env, businessId);
  return jsonOk({ workingHours: workingHours.map(toClientWorkingHour) });
}

async function updateBookingStatus(
  request: Request,
  env: Env,
  bookingId: string,
  identity: OwnerIdentity,
): Promise<Response> {
  const body = statusRequestSchema.parse(await readJson(request));
  const booking = await getBookingById(env, bookingId);
  await requireBusinessMembership(env, booking.business_id, identity.email);

  if (booking.status === body.status) {
    return jsonOk({ booking: mapOwnerBooking(booking) });
  }

  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE bookings
         SET status = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(body.status, now, bookingId),
      env.DB.prepare(
        `INSERT INTO booking_events (
          id,
          booking_id,
          business_id,
          actor_email,
          event_type,
          from_status,
          to_status,
          metadata,
          created_at
        )
        VALUES (?, ?, ?, ?, 'status_changed', ?, ?, ?, ?)`,
      ).bind(
        eventId,
        bookingId,
        booking.business_id,
        identity.email,
        booking.status,
        body.status,
        JSON.stringify({ source: "owner_api" }),
        now,
      ),
    ]);
  } catch (error) {
    if (body.status === "confirmed") {
      throw new HttpError(
        409,
        "slot_conflict",
        "This time has just been booked. Please choose another slot.",
      );
    }

    throw error;
  }

  return jsonOk({ booking: mapOwnerBooking(await getBookingById(env, bookingId)) });
}

function runInBackground(ctx: ExecutionContext, promise: Promise<unknown>) {
  const guarded = promise.catch((error) => {
    console.error("ZeroBooker background task failed", error);
  });
  const maybeCtx = ctx as { waitUntil?: (promise: Promise<unknown>) => void };

  if (typeof maybeCtx.waitUntil === "function") {
    maybeCtx.waitUntil(guarded);
    return;
  }

  void guarded;
}

async function sendBookingEmails(
  env: Env,
  booking: BookingRow,
  business: BusinessRow,
  settings: SettingsRow,
  options: { manageUrl: string; googleCalendarUrl: string; sequence: number },
) {
  const display = bookingDisplay(booking, business);
  const wasRescheduled = options.sequence > 0;
  const customerSubject = wasRescheduled
    ? `Your ${business.name} booking was rescheduled`
    : `Your ${business.name} booking is confirmed`;
  const ownerSubject = wasRescheduled
    ? `ZeroBooker booking rescheduled: ${booking.customer_name}`
    : `New ZeroBooker booking: ${booking.customer_name}`;
  const ics = buildBookingIcs(booking, business, {
    method: "REQUEST",
    status: "CONFIRMED",
    sequence: options.sequence,
    manageUrl: options.manageUrl,
  });
  const ownerEmail = normalizeOptionalEmail(settings.owner_notification_email || env.DEFAULT_OWNER_EMAIL);

  await Promise.all([
    sendCloudflareEmail(env, {
      to: booking.customer_email,
      subject: customerSubject,
      text: [
        `Hi ${booking.customer_name},`,
        "",
        `Your booking with ${business.name} is ${wasRescheduled ? "rescheduled" : "confirmed"}.`,
        `Time: ${display.date} at ${display.startTime} - ${display.endTime} (${business.timezone})`,
        "",
        `Add to Google Calendar: ${options.googleCalendarUrl}`,
        `Cancel or reschedule: ${options.manageUrl}`,
        "",
        "A calendar invite is attached.",
      ].join("\n"),
      html: bookingEmailHtml({
        title: customerSubject,
        intro: `Your booking with ${business.name} is ${wasRescheduled ? "rescheduled" : "confirmed"}.`,
        booking,
        business,
        manageUrl: options.manageUrl,
        googleCalendarUrl: options.googleCalendarUrl,
      }),
      attachments: [
        {
          filename: "zerobooker-appointment.ics",
          content: utf8ToBase64(ics),
          type: "text/calendar; method=REQUEST; charset=utf-8",
          disposition: "attachment",
        },
      ],
    }),
    ownerEmail
      ? sendCloudflareEmail(env, {
          to: ownerEmail,
          subject: ownerSubject,
          text: [
            `${booking.customer_name} ${wasRescheduled ? "rescheduled" : "booked"} an appointment.`,
            "",
            `Time: ${display.date} at ${display.startTime} - ${display.endTime} (${business.timezone})`,
            `Email: ${booking.customer_email}`,
            `Phone: ${booking.customer_phone || "Not provided"}`,
            `Notes: ${booking.notes || "None"}`,
          ].join("\n"),
          html: ownerEmailHtml({
            title: ownerSubject,
            booking,
            business,
          }),
          attachments: [
            {
              filename: "zerobooker-appointment.ics",
              content: utf8ToBase64(ics),
              type: "text/calendar; method=REQUEST; charset=utf-8",
              disposition: "attachment",
            },
          ],
        })
      : Promise.resolve(),
  ]);
}

async function sendCancellationEmail(
  env: Env,
  booking: BookingRow,
  business: BusinessRow,
  settings: SettingsRow,
  options: { manageUrl: string; sequence: number },
) {
  const display = bookingDisplay(booking, business);
  const ics = buildBookingIcs(booking, business, {
    method: "CANCEL",
    status: "CANCELLED",
    sequence: options.sequence,
    manageUrl: options.manageUrl,
  });
  const ownerEmail = normalizeOptionalEmail(settings.owner_notification_email || env.DEFAULT_OWNER_EMAIL);

  await Promise.all([
    sendCloudflareEmail(env, {
      to: booking.customer_email,
      subject: `Your ${business.name} booking was cancelled`,
      text: [
        `Hi ${booking.customer_name},`,
        "",
        `Your booking with ${business.name} on ${display.date} at ${display.startTime} has been cancelled.`,
        "",
        `Booking link: ${options.manageUrl}`,
      ].join("\n"),
      html: bookingEmailHtml({
        title: `Your ${business.name} booking was cancelled`,
        intro: `Your booking on ${display.date} at ${display.startTime} has been cancelled.`,
        booking,
        business,
        manageUrl: options.manageUrl,
      }),
      attachments: [
        {
          filename: "zerobooker-cancellation.ics",
          content: utf8ToBase64(ics),
          type: "text/calendar; method=CANCEL; charset=utf-8",
          disposition: "attachment",
        },
      ],
    }),
    ownerEmail
      ? sendCloudflareEmail(env, {
          to: ownerEmail,
          subject: `ZeroBooker booking cancelled: ${booking.customer_name}`,
          text: [
            `${booking.customer_name} cancelled an appointment.`,
            "",
            `Time: ${display.date} at ${display.startTime} - ${display.endTime} (${business.timezone})`,
            `Email: ${booking.customer_email}`,
            `Phone: ${booking.customer_phone || "Not provided"}`,
          ].join("\n"),
          html: ownerEmailHtml({
            title: `ZeroBooker booking cancelled: ${booking.customer_name}`,
            booking,
            business,
          }),
          attachments: [
            {
              filename: "zerobooker-cancellation.ics",
              content: utf8ToBase64(ics),
              type: "text/calendar; method=CANCEL; charset=utf-8",
              disposition: "attachment",
            },
          ],
        })
      : Promise.resolve(),
  ]);
}

async function sendCloudflareEmail(
  env: Env,
  email: {
    to: string;
    subject: string;
    text: string;
    html: string;
    attachments?: Array<{
      filename: string;
      content: string;
      type: string;
      disposition: "attachment";
    }>;
  },
) {
  if (!env.EMAIL || !env.EMAIL_FROM_ADDRESS) {
    console.info("ZeroBooker email skipped because Cloudflare Email Sending is not configured.");
    return;
  }

  try {
    await env.EMAIL.send({
      from: env.EMAIL_FROM_ADDRESS,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments: email.attachments,
    });
  } catch (error) {
    console.error("ZeroBooker email failed", error);
  }
}

function bookingEmailHtml(input: {
  title: string;
  intro: string;
  booking: BookingRow;
  business: BusinessRow;
  manageUrl: string;
  googleCalendarUrl?: string;
}) {
  const display = bookingDisplay(input.booking, input.business);
  const googleButton = input.googleCalendarUrl
    ? `<a href="${escapeHtml(input.googleCalendarUrl)}" style="${emailButtonStyle()}">Add to Google Calendar</a>`
    : "";

  return emailShell(`
    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:#111111;">${escapeHtml(input.title)}</h1>
    <p style="margin:0 0 20px;color:#3f3f46;line-height:1.6;">${escapeHtml(input.intro)}</p>
    <div style="border:1px solid #e5e5e5;border-radius:14px;padding:18px;margin:0 0 20px;background:#fafafa;">
      <p style="margin:0 0 8px;font-weight:700;color:#111111;">${escapeHtml(input.business.name)}</p>
      <p style="margin:0;color:#3f3f46;">${escapeHtml(display.date)} at ${escapeHtml(display.startTime)} - ${escapeHtml(display.endTime)}</p>
      <p style="margin:6px 0 0;color:#71717a;font-size:13px;">${escapeHtml(input.business.timezone)}</p>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:0 0 20px;">
      ${googleButton}
      <a href="${escapeHtml(input.manageUrl)}" style="${emailButtonStyle("secondary")}">Cancel or reschedule</a>
    </div>
    <p style="margin:0;color:#71717a;font-size:13px;line-height:1.6;">A calendar invite is attached to this email.</p>
  `);
}

function ownerEmailHtml(input: { title: string; booking: BookingRow; business: BusinessRow }) {
  const display = bookingDisplay(input.booking, input.business);

  return emailShell(`
    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:#111111;">${escapeHtml(input.title)}</h1>
    <div style="border:1px solid #e5e5e5;border-radius:14px;padding:18px;background:#fafafa;">
      <p style="margin:0 0 10px;font-weight:700;color:#111111;">${escapeHtml(input.booking.customer_name)}</p>
      <p style="margin:0 0 8px;color:#3f3f46;">${escapeHtml(display.date)} at ${escapeHtml(display.startTime)} - ${escapeHtml(display.endTime)}</p>
      <p style="margin:0 0 8px;color:#3f3f46;">${escapeHtml(input.booking.customer_email)}</p>
      <p style="margin:0 0 8px;color:#3f3f46;">${escapeHtml(input.booking.customer_phone || "No phone provided")}</p>
      <p style="margin:0;color:#71717a;line-height:1.6;">${escapeHtml(input.booking.notes || "No notes")}</p>
    </div>
  `);
}

function emailShell(body: string) {
  return `
    <div style="margin:0;padding:32px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="max-width:560px;margin:0 auto;">
        ${body}
        <p style="margin:28px 0 0;color:#a1a1aa;font-size:12px;">ZeroBooker</p>
      </div>
    </div>
  `;
}

function emailButtonStyle(variant: "primary" | "secondary" = "primary") {
  return [
    "display:inline-block",
    "padding:12px 16px",
    "border-radius:999px",
    "font-size:14px",
    "font-weight:700",
    "text-decoration:none",
    variant === "primary" ? "background:#111111;color:#ffffff" : "background:#ffffff;color:#111111",
    "border:1px solid #111111",
  ].join(";");
}

function bookingDisplay(booking: BookingRow, business: BusinessRow) {
  const localStart = getZonedParts(new Date(booking.appointment_start_utc), business.timezone);
  const localEnd = getZonedParts(new Date(booking.appointment_end_utc), business.timezone);

  return {
    date: localStart.date,
    startTime: localStart.time,
    endTime: localEnd.time,
  };
}

function buildBookingIcs(
  booking: BookingRow,
  business: BusinessRow,
  options: {
    method: "REQUEST" | "CANCEL";
    status: "CONFIRMED" | "CANCELLED";
    sequence: number;
    manageUrl: string;
  },
) {
  const now = new Date();
  const description = [
    `Your appointment with ${business.name} is ${options.status.toLowerCase()}.`,
    "",
    `Customer: ${booking.customer_name}`,
    `Email: ${booking.customer_email}`,
    `Phone: ${booking.customer_phone || "Not provided"}`,
    "",
    `Notes: ${booking.notes || "None"}`,
    `Manage booking: ${options.manageUrl}`,
  ].join("\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${options.method}`,
    "PRODID:-//ZeroBooker//Appointments//EN",
    "BEGIN:VEVENT",
    `UID:${booking.id}@zerobooker`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsUtc(new Date(booking.appointment_start_utc))}`,
    `DTEND:${formatIcsUtc(new Date(booking.appointment_end_utc))}`,
    `SUMMARY:${escapeIcsText(`Appointment at ${business.name}`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(business.name)}`,
    `ATTENDEE;CN=${escapeIcsText(booking.customer_name)};RSVP=TRUE:mailto:${booking.customer_email}`,
    `STATUS:${options.status}`,
    `SEQUENCE:${options.sequence}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function buildGoogleCalendarUrl(
  booking: BookingRow,
  business: BusinessRow,
  manageUrl: string,
) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Appointment at ${business.name}`,
    dates: `${formatIcsUtc(new Date(booking.appointment_start_utc))}/${formatIcsUtc(
      new Date(booking.appointment_end_utc),
    )}`,
    details: [
      `Your appointment with ${business.name} is confirmed.`,
      "",
      `Customer: ${booking.customer_name}`,
      `Email: ${booking.customer_email}`,
      `Manage booking: ${manageUrl}`,
    ].join("\n"),
    location: business.name,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildManageUrl(appBaseUrl: string, token: string) {
  return `${appBaseUrl}/manage/${encodeURIComponent(token)}`;
}

function getAppBaseUrl(env: Env, request: Request) {
  const configured = env.PUBLIC_APP_URL || env.PUBLIC_ORIGIN?.split(",")[0] || new URL(request.url).origin;
  return configured.trim().replace(/\/$/, "");
}

async function newManagementToken(appointmentEndUtc: string) {
  const token = base64UrlFromBytes(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await hashToken(token);
  const baseExpiry = Math.max(new Date(appointmentEndUtc).getTime(), Date.now());
  const expiresAt = new Date(baseExpiry + MANAGEMENT_TOKEN_TTL_AFTER_APPOINTMENT_MS).toISOString();

  return { token, hash, expiresAt };
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return base64UrlFromBytes(new Uint8Array(digest));
}

function base64UrlFromBytes(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function utf8ToBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary);
}

function formatIcsUtc(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    "T",
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0"),
    "Z",
  ].join("");
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function businessFromManaged(booking: ManagedBookingRow): BusinessRow {
  return {
    id: booking.business_id,
    slug: booking.business_slug,
    name: booking.business_name,
    description: "",
    timezone: booking.business_timezone,
  };
}

function settingsFromManaged(booking: ManagedBookingRow): SettingsRow {
  return {
    slot_duration_minutes: booking.slot_duration_minutes,
    owner_notification_email: booking.owner_notification_email,
    turnstile_required: 0,
  };
}

function normalizeOptionalEmail(email: string | null | undefined) {
  const trimmed = email?.trim();
  return trimmed ? normalizeEmail(trimmed) : "";
}

async function requireOwnerIdentity(request: Request, env: Env): Promise<OwnerIdentity> {
  if (env.ENVIRONMENT !== "production") {
    const devEmail = request.headers.get("X-ZeroBooker-Dev-Email") || env.DEV_ACCESS_EMAIL;
    if (devEmail) {
      return { email: normalizeEmail(devEmail), source: "local-dev" };
    }
  }

  const accessToken = request.headers.get("Cf-Access-Jwt-Assertion");
  if (accessToken) {
    return verifyCloudflareAccessIdentity(accessToken, env);
  }

  const googleIdentity = await verifyGoogleOwnerIdentity(request, env);
  if (googleIdentity) {
    return googleIdentity;
  }

  throw new HttpError(401, "access_required", "Owner sign-in is required.");
}

async function verifyCloudflareAccessIdentity(
  token: string,
  env: Env,
): Promise<OwnerIdentity> {
  const teamDomain = normalizeAccessTeamDomain(env.ACCESS_TEAM_DOMAIN);
  if (!teamDomain || !env.ACCESS_AUD) {
    throw new HttpError(500, "access_not_configured", "Owner access is not configured.");
  }

  const jwks = getJwks(teamDomain);
  const { payload } = await jwtVerify(token, jwks, {
    audience: env.ACCESS_AUD,
    issuer: `https://${teamDomain}`,
  });
  const email = typeof payload.email === "string" ? payload.email : undefined;

  if (!email) {
    throw new HttpError(401, "access_identity_missing", "Owner identity is missing.");
  }

  return { email: normalizeEmail(email), source: "cloudflare-access" };
}

async function verifyGoogleOwnerIdentity(
  request: Request,
  env: Env,
): Promise<OwnerIdentity | null> {
  const token = bearerToken(request) || request.headers.get("X-ZeroBooker-Google-Credential");
  if (!token) {
    return null;
  }

  const clientId = publicGoogleClientId(env.GOOGLE_CLIENT_ID);
  if (!clientId) {
    throw new HttpError(500, "google_signin_not_configured", "Google owner sign-in is not configured.");
  }

  try {
    const { payload } = await jwtVerify(token, googleJwks, {
      audience: clientId,
    });
    const issuer = typeof payload.iss === "string" ? payload.iss : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const emailVerified = payload.email_verified === true || payload.email_verified === "true";

    if (!["accounts.google.com", "https://accounts.google.com"].includes(issuer)) {
      throw new Error("Unexpected Google issuer");
    }

    if (!email || !emailVerified) {
      throw new Error("Google email is missing or unverified");
    }

    return { email: normalizeEmail(email), source: "google" };
  } catch (error) {
    console.warn("Google owner sign-in failed", error);
    throw new HttpError(401, "google_signin_invalid", "Google sign-in expired or could not be verified.");
  }
}

async function requireBusinessMembership(env: Env, businessId: string, email: string) {
  const membership = await env.DB.prepare(
    `SELECT id, role
     FROM business_members
     WHERE business_id = ? AND email = ?
     LIMIT 1`,
  )
    .bind(businessId, normalizeEmail(email))
    .first<{ id: string; role: string }>();

  if (!membership) {
    throw new HttpError(403, "business_forbidden", "You do not have access to this business.");
  }

  return membership;
}

async function verifyTurnstile(
  request: Request,
  env: Env,
  token: string | undefined,
  idempotencyKey: string,
) {
  const isProduction = env.ENVIRONMENT === "production";

  if (!isProduction && (!env.TURNSTILE_SECRET_KEY || token === "dev-turnstile-token")) {
    return;
  }

  if (!env.TURNSTILE_SECRET_KEY) {
    throw new HttpError(500, "turnstile_not_configured", "Booking verification is not configured.");
  }

  if (!token) {
    throw new HttpError(400, "turnstile_required", "Please complete booking verification.");
  }

  const remoteIp = request.headers.get("CF-Connecting-IP") || undefined;
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: remoteIp,
      idempotency_key: idempotencyKey,
    }),
  });

  if (!response.ok) {
    throw new HttpError(502, "turnstile_unavailable", "Booking verification is unavailable.");
  }

  const result = (await response.json()) as { success?: boolean };
  if (!result.success) {
    throw new HttpError(400, "turnstile_invalid", "Booking verification failed. Please try again.");
  }
}

async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > MAX_JSON_BYTES) {
    throw new HttpError(413, "request_too_large", "Request body is too large.");
  }

  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) {
    throw new HttpError(413, "request_too_large", "Request body is too large.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

function validateDateRange(from: string, to: string) {
  try {
    const days = daysBetweenInclusive(from, to);
    if (days < 1 || days > MAX_AVAILABILITY_DAYS) {
      throw new Error("Invalid range");
    }
  } catch {
    throw new HttpError(
      400,
      "invalid_date_range",
      `Date range must be between 1 and ${MAX_AVAILABILITY_DAYS} days.`,
    );
  }
}

async function getBookingById(env: Env, bookingId: string): Promise<BookingRow> {
  const booking = await env.DB.prepare(`SELECT * FROM bookings WHERE id = ?`)
    .bind(bookingId)
    .first<BookingRow>();

  if (!booking) {
    throw new HttpError(404, "booking_not_found", "Booking not found.");
  }

  return booking;
}

async function getBookingByIdempotencyKey(
  env: Env,
  businessId: string,
  idempotencyKey: string,
): Promise<BookingRow | null> {
  return env.DB.prepare(
    `SELECT *
     FROM bookings
     WHERE business_id = ? AND idempotency_key = ?
     LIMIT 1`,
  )
    .bind(businessId, idempotencyKey)
    .first<BookingRow>();
}

function publicBusinessPayload(bundle: Awaited<ReturnType<typeof getBusinessBundleBySlug>>, env: Env) {
  const turnstileRequired =
    env.ENVIRONMENT === "production" ||
    (Boolean(env.TURNSTILE_SECRET_KEY) && Boolean(env.TURNSTILE_SITE_KEY));

  return {
    id: bundle.business.id,
    slug: bundle.business.slug,
    name: bundle.business.name,
    description: bundle.business.description,
    timezone: bundle.business.timezone,
    slotDuration: bundle.settings.slot_duration_minutes,
    turnstileRequired,
    turnstileSiteKey: turnstileRequired ? env.TURNSTILE_SITE_KEY || "" : "",
    googleClientId: publicGoogleClientId(env.GOOGLE_CLIENT_ID),
  };
}

function ownerSettingsPayload(bundle: Awaited<ReturnType<typeof getBusinessBundleById>>) {
  return {
    businessId: bundle.business.id,
    slug: bundle.business.slug,
    businessName: bundle.business.name,
    description: bundle.business.description,
    timezone: bundle.business.timezone,
    slotDuration: bundle.settings.slot_duration_minutes,
    ownerEmail: bundle.settings.owner_notification_email || "",
    workingHours: bundle.workingHours.map(toClientWorkingHour),
  };
}

function publicConfirmation(
  booking: BookingRow,
  business: BusinessRow,
  links: { manageUrl?: string; googleCalendarUrl?: string } = {},
) {
  const localStart = getZonedParts(new Date(booking.appointment_start_utc), business.timezone);
  const localEnd = getZonedParts(new Date(booking.appointment_end_utc), business.timezone);

  return {
    id: booking.id,
    businessName: business.name,
    status: booking.status,
    date: localStart.date,
    startTime: localStart.time,
    endTime: localEnd.time,
    appointmentStartUtc: booking.appointment_start_utc,
    appointmentEndUtc: booking.appointment_end_utc,
    manageUrl: links.manageUrl || "",
    googleCalendarUrl: links.googleCalendarUrl || "",
  };
}

function mapOwnerBooking(booking: BookingRow) {
  return {
    id: booking.id,
    businessId: booking.business_id,
    customerName: booking.customer_name,
    customerEmail: booking.customer_email,
    customerPhone: booking.customer_phone || "",
    notes: booking.notes || "",
    appointmentStartUtc: booking.appointment_start_utc,
    appointmentEndUtc: booking.appointment_end_utc,
    status: booking.status,
    idempotencyKey: booking.idempotency_key,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
  };
}

function toClientWorkingHour(row: WorkingHourRecord) {
  return {
    day: row.weekday,
    enabled: Boolean(row.enabled),
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string | undefined): string | null {
  const cleaned = cleanOptionalText(phone);
  return cleaned ? cleaned.replace(/\s+/g, " ") : null;
}

function cleanOptionalText(value: string | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function normalizeAccessTeamDomain(value: string | undefined): string | null {
  const normalized = value
    ?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  return normalized || null;
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function publicGoogleClientId(value: string | undefined): string {
  const clientId = value?.trim() || "";
  if (!clientId) {
    return "";
  }

  if (/^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(clientId)) {
    return clientId;
  }

  console.warn("Ignoring invalid GOOGLE_CLIENT_ID. Use the OAuth Web Client ID, not the Google project ID.");
  return "";
}

function getJwks(teamDomain: string) {
  const cached = jwksCache.get(teamDomain);
  if (cached) {
    return cached;
  }

  const jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  jwksCache.set(teamDomain, jwks);
  return jwks;
}

function jsonOk(data: unknown, status = 200): Response {
  return json({ ok: true, data }, status);
}

function jsonError(status: number, code: string, message: string): Response {
  return json({ ok: false, error: { code, message } }, status);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function handleError(error: unknown, request: Request): Response {
  if (error instanceof ZodError) {
    return jsonError(400, "validation_error", error.issues[0]?.message || "Invalid request.");
  }

  if (error instanceof HttpError) {
    return jsonError(error.status, error.code, error.safeMessage);
  }

  console.error("Unhandled Worker error", {
    url: request.url,
    method: request.method,
    error,
  });

  return jsonError(500, "internal_error", "Something went wrong. Please try again.");
}

function corsResponse(
  request: Request,
  env: Env,
  body: BodyInit | null,
  status: number,
): Response {
  return withCors(
    request,
    env,
    new Response(body, {
      status,
      headers: {
        "access-control-allow-methods": "GET, POST, PUT, PATCH, OPTIONS",
        "access-control-allow-headers":
          "authorization, content-type, cf-access-jwt-assertion, x-zerobooker-dev-email, x-zerobooker-google-credential",
        "access-control-max-age": "86400",
      },
    }),
  );
}

function withCors(request: Request, env: Env, response: Response): Response {
  const origin = request.headers.get("origin");
  if (!origin) {
    return response;
  }

  const allowedOrigins = (env.PUBLIC_ORIGIN || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!allowedOrigins.includes(origin)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.append("vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
