import { format, parseISO } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import { Booking } from '@/types/booking';

interface GoogleEventResource {
  summary: string;
  description: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
}

export function createGoogleCalendarEvent(
  booking: Booking,
  businessName: string,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): GoogleEventResource {
  const { timeSlot } = booking;
  
  // Parse the date and times properly
  const startDateTime = new Date(`${timeSlot.date} ${timeSlot.startTime}`);
  const endDateTime = new Date(`${timeSlot.date} ${timeSlot.endTime}`);

  return {
    summary: `${businessName} - Appointment with ${booking.customerName}`,
    description: `
Appointment Details:
Customer: ${booking.customerName}
Email: ${booking.customerEmail}
Phone: ${booking.customerPhone || 'Not provided'}

Notes: ${booking.notes || 'No additional notes'}

This appointment was booked through your online booking system.
    `.trim(),
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone,
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone,
    },
    attendees: [
      {
        email: booking.customerEmail,
        displayName: booking.customerName,
      },
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 1 day before
        { method: 'popup', minutes: 30 }, // 30 minutes before
      ],
    },
  };
}

export async function insertGoogleCalendarEvent(
  accessToken: string,
  booking: Booking,
  businessName: string
): Promise<{ success: boolean; eventId?: string; error?: any }> {
  try {
    const event = createGoogleCalendarEvent(booking, businessName);
    
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to create calendar event');
    }

    const data = await response.json();
    return { success: true, eventId: data.id };
  } catch (error) {
    console.error('Google Calendar API error:', error);
    return { success: false, error };
  }
}

export function generateIcsFile(booking: Booking, businessName: string): string {
  const { timeSlot } = booking;
  
  // Create proper date objects
  const startDate = new Date(`${timeSlot.date} ${timeSlot.startTime}`);
  const endDate = new Date(`${timeSlot.date} ${timeSlot.endTime}`);
  
  // Format dates for ICS (YYYYMMDDTHHmmss)
  const formatIcsDate = (date: Date) => {
    return format(date, "yyyyMMdd'T'HHmmss");
  };
  
  const now = new Date();
  const uid = `${booking.id}-${now.getTime()}@${businessName.replace(/\s+/g, '-').toLowerCase()}.com`;
  
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    `PRODID:-//${businessName}//Booking System//EN`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(startDate)}`,
    `DTEND:${formatIcsDate(endDate)}`,
    `SUMMARY:Appointment at ${businessName}`,
    `DESCRIPTION:Your appointment with ${businessName} is confirmed.\\n\\nCustomer: ${booking.customerName}\\nEmail: ${booking.customerEmail}\\nPhone: ${booking.customerPhone || 'Not provided'}\\n\\nNotes: ${booking.notes || 'None'}`,
    `LOCATION:${businessName}`,
    `ORGANIZER:CN=${businessName}:mailto:noreply@${businessName.replace(/\s+/g, '-').toLowerCase()}.com`,
    `ATTENDEE;CN=${booking.customerName};RSVP=TRUE:mailto:${booking.customerEmail}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  
  return icsContent;
}

export function downloadIcsFile(booking: Booking, businessName: string) {
  const icsContent = generateIcsFile(booking, businessName);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `appointment-${booking.id}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}