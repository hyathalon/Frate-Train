// Calendar maths in a given IANA time zone, using Intl only (no dependencies).
// Dates without a time are 'YYYY-MM-DD' strings.

const DAY_MS = 86_400_000;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

// How far local time in timeZone is ahead of UTC at this instant.
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return localAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The instant of local midnight at the start of year-month-day in timeZone. */
export function zonedMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day);
  let instant = guess - offsetMs(new Date(guess), timeZone);
  // Second pass corrects for a daylight-saving change between the guess and the answer.
  instant = guess - offsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** Today's date in timeZone. */
export function localDate(now: Date, timeZone: string): string {
  const p = zonedParts(now, timeZone);
  return isoDate(p.year, p.month, p.day);
}

/** The calendar month containing `now` in timeZone, and the date it resets. */
export function monthWindow(now: Date, timeZone: string) {
  const p = zonedParts(now, timeZone);
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  return {
    start: zonedMidnight(p.year, p.month, 1, timeZone),
    end: zonedMidnight(nextYear, nextMonth, 1, timeZone),
    resetsOn: isoDate(nextYear, nextMonth, 1),
  };
}

/** The start of today in timeZone. */
export function dayStart(now: Date, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  return zonedMidnight(p.year, p.month, p.day, timeZone);
}

function toUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const back = new Date(Date.UTC(y, m - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

/** The first Monday after `today`. */
export function nextMonday(today: string): string {
  const add = (8 - weekday(today)) % 7 || 7;
  return addDays(today, add);
}

/**
 * Fits a program between startDate and raceDate. The race falls in the last
 * week. Programs longer than maxWeeks start later instead; shorter than
 * minWeeks is refused by the caller.
 */
export function planWindow(startDate: string, raceDate: string, maxWeeks: number) {
  const days = daysBetween(startDate, raceDate);
  let weeks = Math.floor(days / 7) + 1;
  let start = startDate;
  if (weeks > maxWeeks) {
    start = addDays(startDate, (weeks - maxWeeks) * 7);
    weeks = maxWeeks;
  }
  return { startDate: start, totalWeeks: weeks, daysToRace: days };
}
