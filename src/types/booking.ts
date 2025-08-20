export interface BookingSettings {
  slotDuration: number;
  workingHours: WorkingHours[];
  businessName: string;
  description: string;
  ownerEmail?: string; // Add this field
}

export interface TimeSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  isBooked: boolean;
  bookedBy?: string;
  bookedAt?: Date;
}

export interface WorkingHours {
  day: number; // 0 = Sunday, 1 = Monday, etc.
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export interface BookingSettings {
  slotDuration: number; // in minutes
  workingHours: WorkingHours[];
  businessName: string;
  description: string;
}

export interface Booking {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  timeSlot: TimeSlot;
  notes?: string;
  createdAt: Date;
}