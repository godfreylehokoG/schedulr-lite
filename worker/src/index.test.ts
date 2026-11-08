import { describe, expect, it } from 'vitest';
import worker, { type Env } from './index';

interface FakeBusiness {
  id: string;
  slug: string;
  name: string;
  description: string;
  timezone: string;
}

interface FakeBooking {
  id: string;
  business_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  notes: string | null;
  appointment_start_utc: string;
  appointment_end_utc: string;
  canonical_slot_start_utc: string;
  status: string;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

interface FakeToken {
  token_hash: string;
  booking_id: string;
  business_id: string;
  expires_at: string;
  created_at: string;
  last_used_at: string | null;
}

class FakeStatement {
  private bindings: unknown[] = [];

  constructor(
    private readonly db: FakeD1,
    private readonly sql: string,
  ) {}

  bind(...bindings: unknown[]) {
    this.bindings = bindings;
    return this;
  }

  first<T>() {
    return Promise.resolve(this.db.first(this.sql, this.bindings) as T | null);
  }

  all<T>() {
    return Promise.resolve({ results: this.db.all(this.sql, this.bindings) as T[] });
  }

  run() {
    this.db.run(this.sql, this.bindings);
    return Promise.resolve({ success: true });
  }
}

class FakeD1 {
  business: FakeBusiness = {
    id: 'business-1',
    slug: 'zero-booker',
    name: 'ZeroBooker',
    description: 'Book an appointment with Zero Index',
    timezone: 'Africa/Johannesburg',
  };
  settings = {
    slot_duration_minutes: 30,
    owner_notification_email: null,
    turnstile_required: 1,
  };
  workingHours = [
    { weekday: 1, enabled: 1, start_time: '09:00', end_time: '10:00' },
  ];
  bookings: FakeBooking[] = [];
  tokens: FakeToken[] = [];
  events: unknown[] = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  batch(statements: FakeStatement[]) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  first(sql: string, bindings: unknown[]) {
    if (sql.includes('FROM businesses WHERE slug')) {
      return bindings[0] === this.business.slug ? this.business : null;
    }

    if (sql.includes('FROM businesses WHERE id')) {
      return bindings[0] === this.business.id ? this.business : null;
    }

    if (sql.includes('FROM business_settings')) {
      return this.settings;
    }

    if (sql.includes('WHERE business_id = ? AND idempotency_key = ?')) {
      return (
        this.bookings.find(
          (booking) =>
            booking.business_id === bindings[0] && booking.idempotency_key === bindings[1],
        ) || null
      );
    }

    if (sql.includes('WHERE business_id = ?') && sql.includes('canonical_slot_start_utc = ?')) {
      return (
        this.bookings.find(
          (booking) =>
            booking.business_id === bindings[0] &&
            booking.canonical_slot_start_utc === bindings[1] &&
            booking.status === 'confirmed',
        ) || null
      );
    }

    if (sql.includes('FROM bookings WHERE id = ?')) {
      return this.bookings.find((booking) => booking.id === bindings[0]) || null;
    }

    if (sql.includes('FROM customer_cancellation_tokens token')) {
      const token = this.tokens.find((entry) => entry.token_hash === bindings[0]);
      return token ? this.managedBooking(token.booking_id, token.token_hash) : null;
    }

    if (sql.includes('JOIN customer_cancellation_tokens token ON token.booking_id = b.id')) {
      return this.managedBooking(bindings[0] as string, bindings[1] as string);
    }

    return null;
  }

  all(sql: string, bindings: unknown[]) {
    if (sql.includes('FROM working_hours')) {
      return this.workingHours;
    }

    if (sql.includes('SELECT canonical_slot_start_utc')) {
      return this.bookings
        .filter((booking) => booking.business_id === bindings[0] && booking.status === 'confirmed')
        .map((booking) => ({ canonical_slot_start_utc: booking.canonical_slot_start_utc }));
    }

    return [];
  }

  run(sql: string, bindings: unknown[]) {
    if (sql.includes('INSERT INTO bookings')) {
      const businessId = bindings[1] as string;
      const slotStart = bindings[8] as string;
      const idempotencyKey = bindings[9] as string;

      if (
        this.bookings.some(
          (booking) =>
            booking.business_id === businessId && booking.idempotency_key === idempotencyKey,
        )
      ) {
        throw new Error('UNIQUE constraint failed: bookings.business_id, bookings.idempotency_key');
      }

      if (
        this.bookings.some(
          (booking) =>
            booking.business_id === businessId &&
            booking.canonical_slot_start_utc === slotStart &&
            booking.status === 'confirmed',
        )
      ) {
        throw new Error('UNIQUE constraint failed: idx_bookings_business_active_slot_unique');
      }

      this.bookings.push({
        id: bindings[0] as string,
        business_id: businessId,
        customer_name: bindings[2] as string,
        customer_email: bindings[3] as string,
        customer_phone: bindings[4] as string | null,
        notes: bindings[5] as string | null,
        appointment_start_utc: bindings[6] as string,
        appointment_end_utc: bindings[7] as string,
        canonical_slot_start_utc: slotStart,
        status: 'confirmed',
        idempotency_key: idempotencyKey,
        created_at: bindings[10] as string,
        updated_at: bindings[11] as string,
      });
    }

    if (sql.includes('INSERT INTO booking_events')) {
      this.events.push({ bindings });
    }

    if (sql.includes('INSERT INTO customer_cancellation_tokens')) {
      this.tokens.push({
        token_hash: bindings[0] as string,
        booking_id: bindings[1] as string,
        business_id: bindings[2] as string,
        expires_at: bindings[3] as string,
        created_at: bindings[4] as string,
        last_used_at: null,
      });
    }

    if (sql.includes("SET status = 'cancelled'")) {
      const booking = this.bookings.find((entry) => entry.id === bindings[1]);
      if (booking) {
        booking.status = 'cancelled';
        booking.updated_at = bindings[0] as string;
      }
    }

    if (sql.includes('UPDATE customer_cancellation_tokens')) {
      const token = this.tokens.find((entry) => entry.token_hash === bindings[1]);
      if (token) {
        token.last_used_at = bindings[0] as string;
      }
    }
  }

  private managedBooking(bookingId: string, tokenHash: string) {
    const token = this.tokens.find(
      (entry) => entry.booking_id === bookingId && entry.token_hash === tokenHash,
    );
    const booking = this.bookings.find((entry) => entry.id === bookingId);

    if (!token || !booking) {
      return null;
    }

    return {
      ...booking,
      business_slug: this.business.slug,
      business_name: this.business.name,
      business_timezone: this.business.timezone,
      slot_duration_minutes: this.settings.slot_duration_minutes,
      owner_notification_email: this.settings.owner_notification_email,
      token_expires_at: token.expires_at,
    };
  }
}

function makeEnv(db = new FakeD1()): Env {
  return {
    DB: db as unknown as D1Database,
    ASSETS: { fetch: () => Promise.resolve(new Response('asset')) } as unknown as Fetcher,
    ENVIRONMENT: 'development',
    DEV_ACCESS_EMAIL: 'godfrey@example.invalid',
    PUBLIC_ORIGIN: 'http://localhost:8787',
  };
}

describe('ZeroBooker Worker API', () => {
  it('returns public business metadata without owner-only fields', async () => {
    const response = await worker.fetch(
      new Request('http://localhost:8787/api/public/business/zero-booker'),
      makeEnv(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { business: Record<string, unknown> };
    };
    expect(body.data.business).toMatchObject({
      name: 'ZeroBooker',
      timezone: 'Africa/Johannesburg',
      turnstileRequired: false,
    });
    expect(JSON.stringify(body)).not.toContain('owner_notification_email');
  });

  it('converts competing fixed-slot booking attempts into 409 responses', async () => {
    const db = new FakeD1();
    const env = makeEnv(db);
    const payload = {
      slotStartUtc: '2026-08-10T07:00:00.000Z',
      customerName: 'First Customer',
      customerEmail: 'first@example.com',
      idempotencyKey: 'first-request',
      turnstileToken: 'dev-turnstile-token',
    };

    const first = await worker.fetch(
      new Request('http://localhost:8787/api/public/business/zero-booker/bookings', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
      env,
      {} as ExecutionContext,
    );
    expect(first.status).toBe(201);

    const second = await worker.fetch(
      new Request('http://localhost:8787/api/public/business/zero-booker/bookings', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          customerEmail: 'second@example.com',
          idempotencyKey: 'second-request',
        }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({
      error: {
        code: 'slot_conflict',
        message: 'This time has just been booked. Please choose another slot.',
      },
    });
  });

  it('creates a customer manage link that can cancel a booking', async () => {
    const db = new FakeD1();
    const env = makeEnv(db);
    const response = await worker.fetch(
      new Request('http://localhost:8787/api/public/business/zero-booker/bookings', {
        method: 'POST',
        body: JSON.stringify({
          slotStartUtc: '2026-08-10T07:00:00.000Z',
          customerName: 'Manage Customer',
          customerEmail: 'manage@example.com',
          idempotencyKey: 'manage-request',
          turnstileToken: 'dev-turnstile-token',
        }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    const created = (await response.json()) as {
      data: { confirmation: { manageUrl: string } };
    };
    const token = decodeURIComponent(new URL(created.data.confirmation.manageUrl).pathname.split('/').pop() || '');
    expect(token.length).toBeGreaterThan(24);

    const managed = await worker.fetch(
      new Request(`http://localhost:8787/api/public/bookings/manage/${encodeURIComponent(token)}`),
      env,
      {} as ExecutionContext,
    );
    expect(managed.status).toBe(200);
    await expect(managed.json()).resolves.toMatchObject({
      data: {
        booking: {
          customerEmail: 'manage@example.com',
          status: 'confirmed',
          canCancel: true,
        },
      },
    });

    const cancelled = await worker.fetch(
      new Request('http://localhost:8787/api/public/bookings/cancel', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(cancelled.status).toBe(200);
    await expect(cancelled.json()).resolves.toMatchObject({
      data: {
        booking: {
          status: 'cancelled',
          canReschedule: false,
        },
      },
    });
    expect(db.bookings[0].status).toBe('cancelled');
  });
});
