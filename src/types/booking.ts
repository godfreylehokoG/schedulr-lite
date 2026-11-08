export type BookingStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';

export interface WorkingHours {
  day: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export interface BookingSettings {
  businessId?: string;
  slug?: string;
  slotDuration: number;
  workingHours: WorkingHours[];
  businessName: string;
  description: string;
  timezone: string;
  ownerEmail?: string;
  turnstileRequired?: boolean;
  turnstileSiteKey?: string;
  googleClientId?: string;
}

export interface TimeSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  startUtc: string;
  endUtc: string;
  isBooked: boolean;
  bookedBy?: string;
  bookedAt?: Date;
  bookingId?: string;
  status?: BookingStatus;
}

export interface Booking {
  id: string;
  businessId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
  appointmentStartUtc: string;
  appointmentEndUtc: string;
  timeSlot: TimeSlot;
  status: BookingStatus;
  createdAt: Date;
  updatedAt?: Date;
}

export interface BookingConfirmation {
  id: string;
  businessName: string;
  status: BookingStatus;
  date: string;
  startTime: string;
  endTime: string;
  appointmentStartUtc: string;
  appointmentEndUtc: string;
  manageUrl?: string;
  googleCalendarUrl?: string;
}

export interface ManagedBooking {
  id: string;
  businessId: string;
  businessSlug: string;
  businessName: string;
  timezone: string;
  status: BookingStatus;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
  date: string;
  startTime: string;
  endTime: string;
  appointmentStartUtc: string;
  appointmentEndUtc: string;
  manageUrl: string;
  googleCalendarUrl: string;
  canCancel: boolean;
  canReschedule: boolean;
  createdAt: string;
  updatedAt: string;
}
