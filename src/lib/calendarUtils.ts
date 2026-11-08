import { Booking } from '@/types/booking';

export function generateIcsFile(booking: Booking, businessName: string): string {
  const startDate = new Date(booking.appointmentStartUtc);
  const endDate = new Date(booking.appointmentEndUtc);
  const now = new Date();
  const uid = `${booking.id}-${now.getTime()}@${businessName.replace(/\s+/g, '-').toLowerCase()}.com`;

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    `PRODID:-//${escapeIcsText(businessName)}//ZeroBooker//EN`,
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(startDate)}`,
    `DTEND:${formatIcsDate(endDate)}`,
    `SUMMARY:${escapeIcsText(`Appointment at ${businessName}`)}`,
    `DESCRIPTION:${escapeIcsText(
      `Your appointment with ${businessName} is confirmed.\n\nCustomer: ${booking.customerName}\nEmail: ${booking.customerEmail}\nPhone: ${booking.customerPhone || 'Not provided'}\n\nNotes: ${booking.notes || 'None'}`,
    )}`,
    `LOCATION:${escapeIcsText(businessName)}`,
    `ATTENDEE;CN=${escapeIcsText(booking.customerName)};RSVP=TRUE:mailto:${booking.customerEmail}`,
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

function formatIcsDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    'T',
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
    'Z',
  ].join('');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}
