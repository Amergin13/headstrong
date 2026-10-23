/**
 * Local calendar date helpers.
 *
 * `new Date().toISOString().split('T')[0]` returns the UTC date, which is "tomorrow" for
 * evening workouts west of UTC. Every user-facing day boundary must use the device's local date.
 */

/** YYYY-MM-DD in the device's local time zone. */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local date string offset by a number of days. */
export function localDateOffset(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

/** Parses a YYYY-MM-DD string as local midnight (not UTC midnight). */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Whole calendar days between two local dates (b - a). */
export function daysBetweenLocalDates(a: string, b: string): number {
  const ms = parseLocalDate(b).getTime() - parseLocalDate(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
