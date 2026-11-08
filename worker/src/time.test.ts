import { describe, expect, it } from 'vitest';
import {
  generateAvailabilitySlots,
  getZonedParts,
  validateCanonicalSlot,
  zonedTimeToUtc,
  type WorkingHourRecord,
} from './time';

const workingHours: WorkingHourRecord[] = [
  { weekday: 1, enabled: 1, start_time: '09:00', end_time: '10:00' },
];

describe('Cloudflare D1 slot time helpers', () => {
  it('converts Africa/Johannesburg business time to UTC', () => {
    expect(zonedTimeToUtc('2026-08-10', '09:00', 'Africa/Johannesburg').toISOString()).toBe(
      '2026-08-10T07:00:00.000Z',
    );
  });

  it('formats UTC appointment starts in the business timezone', () => {
    expect(getZonedParts(new Date('2026-08-10T07:00:00.000Z'), 'Africa/Johannesburg')).toMatchObject({
      date: '2026-08-10',
      time: '09:00',
      weekday: 1,
    });
  });

  it('generates canonical fixed-duration slots and marks booked starts', () => {
    const slots = generateAvailabilitySlots(
      '2026-08-10',
      '2026-08-10',
      'Africa/Johannesburg',
      30,
      workingHours,
      new Set(['2026-08-10T07:30:00.000Z']),
    );

    expect(slots).toEqual([
      expect.objectContaining({
        startUtc: '2026-08-10T07:00:00.000Z',
        startTime: '09:00',
        isBooked: false,
      }),
      expect.objectContaining({
        startUtc: '2026-08-10T07:30:00.000Z',
        startTime: '09:30',
        isBooked: true,
      }),
    ]);
  });

  it('rejects non-canonical slot starts outside the configured cadence', () => {
    expect(() =>
      validateCanonicalSlot(
        '2026-08-10T07:15:00.000Z',
        'Africa/Johannesburg',
        30,
        workingHours,
      ),
    ).toThrow('Slot is outside working hours');
  });
});
