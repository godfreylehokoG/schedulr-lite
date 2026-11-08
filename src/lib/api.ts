import {
  Booking,
  BookingConfirmation,
  BookingSettings,
  BookingStatus,
  ManagedBooking,
  TimeSlot,
  WorkingHours,
} from '@/types/booking';

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

interface PublicBusinessResponse {
  business: {
    id: string;
    slug: string;
    name: string;
    description: string;
    timezone: string;
    slotDuration: number;
    turnstileRequired: boolean;
    turnstileSiteKey: string;
    googleClientId: string;
  };
}

interface AvailabilityResponse {
  availability: TimeSlot[];
}

interface OwnerBusinessesResponse {
  businesses: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    timezone: string;
    role: string;
  }>;
}

interface OwnerBookingsResponse {
  bookings: Array<{
    id: string;
    businessId: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    notes?: string;
    appointmentStartUtc: string;
    appointmentEndUtc: string;
    status: BookingStatus;
    createdAt: string;
    updatedAt: string;
  }>;
}

interface SettingsResponse {
  settings: BookingSettings;
}

interface WorkingHoursResponse {
  workingHours: WorkingHours[];
}

interface ConfirmationResponse {
  confirmation: BookingConfirmation;
}

interface ManagedBookingResponse {
  booking: ManagedBooking;
}

interface BookingResponse {
  booking: OwnerBookingsResponse['bookings'][number];
}

const OWNER_AUTH_STORAGE_KEY = 'zerobooker.owner.googleCredential';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  if (path.startsWith('/api/owner')) {
    const token = getOwnerAuthToken();
    if (token && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;

  if (envelope.ok === false) {
    if (response.status === 401 && path.startsWith('/api/owner')) {
      clearOwnerAuthToken();
    }
    throw new ApiError(response.status, envelope.error.code, envelope.error.message);
  }

  return envelope.data;
}

export const api = {
  async getPublicBusiness(slug: string): Promise<BookingSettings> {
    const data = await apiFetch<PublicBusinessResponse>(`/api/public/business/${slug}`);
    return {
      businessId: data.business.id,
      slug: data.business.slug,
      businessName: data.business.name,
      description: data.business.description,
      timezone: data.business.timezone,
      slotDuration: data.business.slotDuration,
      workingHours: [],
      turnstileRequired: data.business.turnstileRequired,
      turnstileSiteKey: data.business.turnstileSiteKey,
      googleClientId: data.business.googleClientId,
    };
  },

  async getAvailability(slug: string, from: string, to: string): Promise<TimeSlot[]> {
    const params = new URLSearchParams({ from, to });
    const data = await apiFetch<AvailabilityResponse>(
      `/api/public/business/${slug}/availability?${params.toString()}`,
    );
    return data.availability;
  },

  async createBooking(
    slug: string,
    payload: {
      slotStartUtc: string;
      customerName: string;
      customerEmail: string;
      customerPhone?: string;
      notes?: string;
      turnstileToken?: string;
      idempotencyKey: string;
    },
  ): Promise<BookingConfirmation> {
    const data = await apiFetch<ConfirmationResponse>(`/api/public/business/${slug}/bookings`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.confirmation;
  },

  async getManagedBooking(token: string): Promise<ManagedBooking> {
    const data = await apiFetch<ManagedBookingResponse>(
      `/api/public/bookings/manage/${encodeURIComponent(token)}`,
    );
    return data.booking;
  },

  async cancelManagedBooking(token: string): Promise<ManagedBooking> {
    const data = await apiFetch<ManagedBookingResponse>('/api/public/bookings/cancel', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    return data.booking;
  },

  async rescheduleManagedBooking(token: string, slotStartUtc: string): Promise<ManagedBooking> {
    const data = await apiFetch<ManagedBookingResponse>('/api/public/bookings/reschedule', {
      method: 'POST',
      body: JSON.stringify({ token, slotStartUtc }),
    });
    return data.booking;
  },

  async getOwnerBusinesses(): Promise<OwnerBusinessesResponse['businesses']> {
    const data = await apiFetch<OwnerBusinessesResponse>('/api/owner/businesses');
    return data.businesses;
  },

  async getOwnerSettings(businessId: string): Promise<BookingSettings> {
    const data = await apiFetch<SettingsResponse>(`/api/owner/business/${businessId}/settings`);
    return data.settings;
  },

  async updateOwnerSettings(settings: BookingSettings): Promise<BookingSettings> {
    const data = await apiFetch<SettingsResponse>(
      `/api/owner/business/${settings.businessId}/settings`,
      {
        method: 'PUT',
        body: JSON.stringify({
          businessName: settings.businessName,
          description: settings.description,
          timezone: settings.timezone,
          slotDuration: settings.slotDuration,
          ownerEmail: settings.ownerEmail || '',
        }),
      },
    );
    return data.settings;
  },

  async getOwnerWorkingHours(businessId: string): Promise<WorkingHours[]> {
    const data = await apiFetch<WorkingHoursResponse>(
      `/api/owner/business/${businessId}/working-hours`,
    );
    return data.workingHours;
  },

  async updateOwnerWorkingHours(
    businessId: string,
    workingHours: WorkingHours[],
  ): Promise<WorkingHours[]> {
    const data = await apiFetch<WorkingHoursResponse>(
      `/api/owner/business/${businessId}/working-hours`,
      {
        method: 'PUT',
        body: JSON.stringify({ workingHours }),
      },
    );
    return data.workingHours;
  },

  async getOwnerBookings(businessId: string, from?: string, to?: string): Promise<Booking[]> {
    const params = from && to ? `?${new URLSearchParams({ from, to }).toString()}` : '';
    const data = await apiFetch<OwnerBookingsResponse>(
      `/api/owner/business/${businessId}/bookings${params}`,
    );
    return data.bookings.map(toBooking);
  },

  async updateBookingStatus(id: string, status: BookingStatus): Promise<Booking> {
    const data = await apiFetch<BookingResponse>(`/api/owner/bookings/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return toBooking(data.booking);
  },
};

function toBooking(row: OwnerBookingsResponse['bookings'][number]): Booking {
  const start = new Date(row.appointmentStartUtc);
  const end = new Date(row.appointmentEndUtc);

  return {
    id: row.id,
    businessId: row.businessId,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone || '',
    notes: row.notes || '',
    appointmentStartUtc: row.appointmentStartUtc,
    appointmentEndUtc: row.appointmentEndUtc,
    status: row.status,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    timeSlot: {
      id: row.appointmentStartUtc,
      date: formatLocalDate(start),
      startTime: formatLocalTime(start),
      endTime: formatLocalTime(end),
      startUtc: row.appointmentStartUtc,
      endUtc: row.appointmentEndUtc,
      isBooked: row.status === 'confirmed',
      bookedBy: row.customerName,
      bookedAt: new Date(row.createdAt),
      bookingId: row.id,
      status: row.status,
    },
  };
}

function formatLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatLocalTime(date: Date): string {
  return [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join(':');
}

export function toIsoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getOwnerAuthToken(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(OWNER_AUTH_STORAGE_KEY) || '';
}

export function setOwnerAuthToken(token: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(OWNER_AUTH_STORAGE_KEY, token);
}

export function clearOwnerAuthToken() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(OWNER_AUTH_STORAGE_KEY);
}
