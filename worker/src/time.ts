export interface WorkingHourRecord {
  weekday: number;
  enabled: number | boolean;
  start_time: string;
  end_time: string;
}

export interface GeneratedSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  startUtc: string;
  endUtc: string;
  isBooked: boolean;
}

export interface ZonedParts {
  date: string;
  time: string;
  weekday: number;
  hour: number;
  minute: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Invalid ISO date");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error("Invalid ISO date");
  }

  return { year, month, day };
}

export function addDaysIsoDate(value: string, days: number): string {
  const { year, month, day } = parseIsoDate(value);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return formatUtcDate(next);
}

export function daysBetweenInclusive(fromDate: string, toDate: string): number {
  const from = parseIsoDate(fromDate);
  const to = parseIsoDate(toDate);
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.floor((toMs - fromMs) / 86_400_000) + 1;
}

export function weekdayForIsoDate(value: string): number {
  const { year, month, day } = parseIsoDate(value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function parseTimeToMinutes(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new Error("Invalid HH:mm time");
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatMinutes(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatUtcDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const values = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const year = values.year;
  const month = values.month;
  const day = values.day;
  const hour = Number(values.hour);
  const minute = Number(values.minute);

  return {
    date: `${year}-${month}-${day}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    weekday: WEEKDAY_INDEX[values.weekday] ?? weekdayForIsoDate(`${year}-${month}-${day}`),
    hour,
    minute,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const values = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return asUtc - date.getTime();
}

export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const { year, month, day } = parseIsoDate(date);
  const minutes = parseTimeToMinutes(time);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offset = getTimeZoneOffsetMs(new Date(localAsUtc), timeZone);
  let utc = new Date(localAsUtc - offset);

  const nextOffset = getTimeZoneOffsetMs(utc, timeZone);
  if (nextOffset !== offset) {
    utc = new Date(localAsUtc - nextOffset);
  }

  return utc;
}

export function normalizeUtcIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid UTC timestamp");
  }

  return date.toISOString();
}

export function generateAvailabilitySlots(
  fromDate: string,
  toDate: string,
  timeZone: string,
  slotDurationMinutes: number,
  workingHours: WorkingHourRecord[],
  bookedStartsUtc: Set<string>,
): GeneratedSlot[] {
  const totalDays = daysBetweenInclusive(fromDate, toDate);
  const slots: GeneratedSlot[] = [];

  for (let dayOffset = 0; dayOffset < totalDays; dayOffset += 1) {
    const date = addDaysIsoDate(fromDate, dayOffset);
    const weekday = weekdayForIsoDate(date);
    const workingHour = workingHours.find((entry) => entry.weekday === weekday);

    if (!workingHour || !workingHour.enabled) {
      continue;
    }

    const startMinutes = parseTimeToMinutes(workingHour.start_time);
    const endMinutes = parseTimeToMinutes(workingHour.end_time);

    for (
      let slotStartMinutes = startMinutes;
      slotStartMinutes + slotDurationMinutes <= endMinutes;
      slotStartMinutes += slotDurationMinutes
    ) {
      const startTime = formatMinutes(slotStartMinutes);
      const endTime = formatMinutes(slotStartMinutes + slotDurationMinutes);
      const startUtc = zonedTimeToUtc(date, startTime, timeZone).toISOString();
      const endUtc = new Date(
        new Date(startUtc).getTime() + slotDurationMinutes * 60_000,
      ).toISOString();

      slots.push({
        id: startUtc,
        date,
        startTime,
        endTime,
        startUtc,
        endUtc,
        isBooked: bookedStartsUtc.has(startUtc),
      });
    }
  }

  return slots;
}

export function validateCanonicalSlot(
  slotStartUtc: string,
  timeZone: string,
  slotDurationMinutes: number,
  workingHours: WorkingHourRecord[],
): { startUtc: string; endUtc: string; localDate: string; localStartTime: string; localEndTime: string } {
  const startUtc = normalizeUtcIso(slotStartUtc);
  const local = getZonedParts(new Date(startUtc), timeZone);
  const workingHour = workingHours.find((entry) => entry.weekday === local.weekday);

  if (!workingHour || !workingHour.enabled) {
    throw new Error("Slot is outside working hours");
  }

  const requestedMinutes = local.hour * 60 + local.minute;
  const dayStart = parseTimeToMinutes(workingHour.start_time);
  const dayEnd = parseTimeToMinutes(workingHour.end_time);

  if (
    requestedMinutes < dayStart ||
    requestedMinutes + slotDurationMinutes > dayEnd ||
    (requestedMinutes - dayStart) % slotDurationMinutes !== 0
  ) {
    throw new Error("Slot is outside working hours");
  }

  const canonicalUtc = zonedTimeToUtc(local.date, local.time, timeZone).toISOString();
  if (canonicalUtc !== startUtc) {
    throw new Error("Slot is not canonical");
  }

  const localEndMinutes = requestedMinutes + slotDurationMinutes;
  return {
    startUtc,
    endUtc: new Date(new Date(startUtc).getTime() + slotDurationMinutes * 60_000).toISOString(),
    localDate: local.date,
    localStartTime: local.time,
    localEndTime: formatMinutes(localEndMinutes % 1440),
  };
}
