import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  Booking,
  BookingConfirmation,
  BookingSettings,
  BookingStatus,
  TimeSlot,
  WorkingHours,
} from '@/types/booking';
import { addDays, api, getOwnerAuthToken, toIsoDate } from '@/lib/api';

type BookingMode = 'public' | 'owner';

interface BookingDraft {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
}

interface BookingContextType {
  mode: BookingMode;
  settings: BookingSettings;
  updateSettings: (settings: Partial<BookingSettings>) => void;
  saveSettings: () => Promise<void>;
  saveWorkingHours: (workingHours: WorkingHours[]) => Promise<void>;
  timeSlots: TimeSlot[];
  bookings: Booking[];
  bookTimeSlot: (
    slotId: string,
    booking: BookingDraft,
    turnstileToken: string | undefined,
    idempotencyKey: string,
  ) => Promise<BookingConfirmation>;
  generateTimeSlots: (startDate: Date, endDate: Date) => Promise<void>;
  refresh: () => Promise<void>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  isOwnerMode: boolean;
  loading: boolean;
  loadingAvailability: boolean;
  saving: boolean;
  error: string | null;
  authError: string | null;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

const defaultWorkingHours: WorkingHours[] = [
  { day: 0, enabled: false, startTime: '09:00', endTime: '17:00' },
  { day: 1, enabled: true, startTime: '09:00', endTime: '17:00' },
  { day: 2, enabled: true, startTime: '09:00', endTime: '17:00' },
  { day: 3, enabled: true, startTime: '09:00', endTime: '17:00' },
  { day: 4, enabled: true, startTime: '09:00', endTime: '17:00' },
  { day: 5, enabled: true, startTime: '09:00', endTime: '17:00' },
  { day: 6, enabled: false, startTime: '09:00', endTime: '17:00' },
];

const defaultSettings: BookingSettings = {
  slotDuration: 30,
  workingHours: defaultWorkingHours,
  businessName: 'ZeroBooker',
  description: 'Book an appointment with Zero Index',
  timezone: 'Africa/Johannesburg',
  slug: 'zero-booker',
  turnstileRequired: false,
  turnstileSiteKey: '',
  googleClientId: '',
};

interface BookingProviderProps {
  children: React.ReactNode;
  mode?: BookingMode;
  slug?: string;
  businessId?: string;
}

export const BookingProvider: React.FC<BookingProviderProps> = ({
  children,
  mode = 'public',
  slug = 'zero-booker',
  businessId,
}) => {
  const [settings, setSettings] = useState<BookingSettings>(defaultSettings);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadAvailability = useCallback(
    async (targetSlug: string, ownerBookings: Booking[] = []) => {
      setLoadingAvailability(true);
      const from = toIsoDate(new Date());
      const to = toIsoDate(addDays(new Date(), 30));

      try {
        const slots = await api.getAvailability(targetSlug, from, to);
        setTimeSlots(mode === 'owner' ? decorateSlots(slots, ownerBookings) : slots);
      } finally {
        setLoadingAvailability(false);
      }
    },
    [mode],
  );

  const loadPublic = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAuthError(null);

    try {
      const publicSettings = await api.getPublicBusiness(slug);
      setSettings((prev) => ({ ...prev, ...publicSettings }));
      setBookings([]);
      await loadAvailability(publicSettings.slug || slug, []);
    } catch (err) {
      setError(messageFromError(err, 'Could not load booking availability.'));
    } finally {
      setLoading(false);
    }
  }, [loadAvailability, slug]);

  const loadOwner = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAuthError(null);

    try {
      if (shouldPromptForOwnerSignIn()) {
        const publicSettings = await api.getPublicBusiness(slug);
        setSettings((prev) => ({ ...prev, ...publicSettings }));
        setBookings([]);
        setTimeSlots([]);
        setAuthError('Owner sign-in is required.');
        return;
      }

      const businesses = await api.getOwnerBusinesses();
      const selectedBusiness = businessId
        ? businesses.find((business) => business.id === businessId)
        : businesses[0];

      if (!selectedBusiness) {
        setAuthError('You are signed in, but no ZeroBooker business membership was found.');
        setBookings([]);
        setTimeSlots([]);
        return;
      }

      const ownerSettings = await api.getOwnerSettings(selectedBusiness.id);
      const ownerBookings = await api.getOwnerBookings(selectedBusiness.id);
      setSettings((prev) => ({ ...prev, ...ownerSettings }));
      setBookings(ownerBookings);
      await loadAvailability(ownerSettings.slug || selectedBusiness.slug, ownerBookings);
    } catch (err) {
      const message = messageFromError(err, 'Owner access could not be loaded.');
      if (isAuthError(err)) {
        setAuthError(message);
        try {
          const publicSettings = await api.getPublicBusiness(slug);
          setSettings((prev) => ({ ...prev, ...publicSettings }));
        } catch {
          // Keep the auth prompt usable even if public metadata is temporarily unavailable.
        }
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [businessId, loadAvailability]);

  useEffect(() => {
    if (mode === 'owner') {
      void loadOwner();
    } else {
      void loadPublic();
    }
  }, [loadOwner, loadPublic, mode]);

  const updateSettings = (newSettings: Partial<BookingSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const saveSettings = async () => {
    if (!settings.businessId) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateOwnerSettings(settings);
      setSettings((prev) => ({ ...prev, ...saved }));
      await loadAvailability(saved.slug || settings.slug || slug, bookings);
    } catch (err) {
      setError(messageFromError(err, 'Settings could not be saved.'));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const saveWorkingHours = async (workingHours: WorkingHours[]) => {
    if (!settings.businessId) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateOwnerWorkingHours(settings.businessId, workingHours);
      setSettings((prev) => ({ ...prev, workingHours: saved }));
      await loadAvailability(settings.slug || slug, bookings);
    } catch (err) {
      setError(messageFromError(err, 'Working hours could not be saved.'));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const bookTimeSlot = async (
    slotId: string,
    bookingData: BookingDraft,
    turnstileToken: string | undefined,
    idempotencyKey: string,
  ) => {
    const slot = timeSlots.find((entry) => entry.id === slotId);
    if (!slot || slot.isBooked) {
      throw new Error('This time has just been booked. Please choose another slot.');
    }

    const confirmation = await api.createBooking(settings.slug || slug, {
      slotStartUtc: slot.startUtc,
      ...bookingData,
      turnstileToken,
      idempotencyKey,
    });

    await loadAvailability(settings.slug || slug, bookings);
    return confirmation;
  };

  const generateTimeSlots = async (startDate: Date, endDate: Date) => {
    await loadAvailabilityForRange(
      settings.slug || slug,
      startDate,
      endDate,
      mode === 'owner' ? bookings : [],
      setLoadingAvailability,
      setTimeSlots,
      mode,
    );
  };

  const refresh = async () => {
    if (mode === 'owner') {
      await loadOwner();
    } else {
      await loadPublic();
    }
  };

  const updateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateBookingStatus(bookingId, status);
      const nextBookings = bookings.map((booking) => (booking.id === bookingId ? updated : booking));
      setBookings(nextBookings);
      setTimeSlots((slots) => decorateSlots(slots, nextBookings));
    } catch (err) {
      setError(messageFromError(err, 'Booking status could not be updated.'));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const value: BookingContextType = {
    mode,
    settings,
    updateSettings,
    saveSettings,
    saveWorkingHours,
    timeSlots,
    bookings,
    bookTimeSlot,
    generateTimeSlots,
    refresh,
    updateBookingStatus,
    isOwnerMode: mode === 'owner',
    loading,
    loadingAvailability,
    saving,
    error,
    authError,
  };

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
};

export const useBooking = () => {
  const context = useContext(BookingContext);
  if (context === undefined) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  return context;
};

function decorateSlots(slots: TimeSlot[], bookings: Booking[]): TimeSlot[] {
  const activeBookings = new Map(
    bookings
      .filter((booking) => booking.status === 'confirmed')
      .map((booking) => [booking.appointmentStartUtc, booking]),
  );

  return slots.map((slot) => {
    const booking = activeBookings.get(slot.startUtc);
    if (!booking) {
      return { ...slot, bookedBy: undefined, bookingId: undefined, status: undefined };
    }

    return {
      ...slot,
      isBooked: true,
      bookedBy: booking.customerName,
      bookedAt: booking.createdAt,
      bookingId: booking.id,
      status: booking.status,
    };
  });
}

async function loadAvailabilityForRange(
  slug: string,
  startDate: Date,
  endDate: Date,
  bookings: Booking[],
  setLoadingAvailability: (loading: boolean) => void,
  setTimeSlots: (slots: TimeSlot[]) => void,
  mode: BookingMode,
) {
  setLoadingAvailability(true);
  try {
    const slots = await api.getAvailability(slug, toIsoDate(startDate), toIsoDate(endDate));
    setTimeSlots(mode === 'owner' ? decorateSlots(slots, bookings) : slots);
  } finally {
    setLoadingAvailability(false);
  }
}

function isAuthError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error
    ? [401, 403].includes(Number((error as { status: number }).status))
    : false;
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function shouldPromptForOwnerSignIn(): boolean {
  if (getOwnerAuthToken()) {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  return !['localhost', '127.0.0.1'].includes(window.location.hostname);
}
