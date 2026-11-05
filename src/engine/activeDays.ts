import { localDateString } from '../utils/date';
import { WorkoutSession } from './types';

/**
 * Active days: the non-lifting sessions in the "lift 3 days + 1 active day" plan.
 *
 * Research with new gym members found that exercising at least 4 times a week for 6 weeks was the
 * minimum linked to forming an exercise habit (Kaushal & Rhodes, 2015), and any session counted,
 * not only lifting. So the plan's fourth weekly session can be a ride, run, walk, swim or class.
 * A session is deliberate exercise of at least 20 minutes; daily steps never count (they include
 * everyday walking, so they can't show that a session happened).
 *
 * Activities are stored apart from lifting workouts, so they can never change weekly sets,
 * estimated maxes or any strength number.
 */

export type ActivityType = 'walk' | 'run' | 'cycle' | 'swim' | 'row' | 'elliptical' | 'hike' | 'class' | 'sport' | 'other';

/** Where an activity came from. Every automatic one names its source; nothing is guessed. */
export type ActivitySource = 'manual' | 'fitbit' | 'whoop' | 'strava' | 'health_connect';

export interface ActivityLog {
  id: string;
  /** Local date the activity started (YYYY-MM-DD). */
  date: string;
  /** ISO start time. */
  startedAt: string;
  minutes: number;
  type: ActivityType;
  source: ActivitySource;
  /** The source's own id, so the same workout is never imported twice. */
  externalId?: string;
  /** The source's name for it, e.g. "Morning Ride". */
  name?: string;
  distanceKm?: number;
  avgHeartRate?: number;
}

/** An activity reported by a watch, Strava or Health Connect, before it is saved. */
export type DetectedActivity = Omit<ActivityLog, 'id' | 'date'> & { externalId: string };

export const MIN_ACTIVE_MINUTES = 20;

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  walk: 'Walk',
  run: 'Run',
  cycle: 'Bike ride',
  swim: 'Swim',
  row: 'Row',
  elliptical: 'Cross-trainer',
  hike: 'Hike',
  class: 'Class',
  sport: 'Sport',
  other: 'Workout',
};

export const SOURCE_LABELS: Record<ActivitySource, string> = {
  manual: 'Logged by you',
  fitbit: 'From Fitbit',
  whoop: 'From Whoop',
  strava: 'From Strava',
  health_connect: 'From Health Connect',
};

/**
 * Maps a source's activity name or type to ours. Returns 'strength' for lifting, which never
 * counts as an active day (it is the lifting session itself).
 */
export function classifyActivity(raw: string | undefined): ActivityType | 'strength' {
  // Split Strava's camel case ("VirtualRide", "MountainBikeRide") and Health Connect's snake case.
  const s = (raw || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[_-]+/g, ' ');
  if (/weight|strength|lift|crossfit|functional|powerlifting|bodybuilding|resistance/.test(s)) return 'strength';
  if (/\b(e ?bike|bik|ride|cycl|spin|velo)/.test(s)) return 'cycle';
  if (/\b(run|jog|treadmill|trail run)/.test(s)) return 'run';
  if (/\b(hike|hiking)/.test(s)) return 'hike';
  if (/\b(walk)/.test(s)) return 'walk';
  if (/\b(swim)/.test(s)) return 'swim';
  if (/\b(row|kayak|canoe|paddl)/.test(s)) return 'row';
  if (/\b(ellipt|cross ?trainer|stair|step ?mill)/.test(s)) return 'elliptical';
  if (/\b(class|aerobic|dance|zumba|yoga|pilates|barre|hiit|boxing|kickbox|circuit|bootcamp)/.test(s)) return 'class';
  if (/\b(football|soccer|tennis|basketball|squash|padel|rugby|hockey|badminton|climb|golf|ski|snowboard|surf|martial)/.test(s)) return 'sport';
  return 'other';
}

/** True when an activity is a real active-day session (deliberate, at least 20 minutes). */
export function qualifiesAsActiveDay(a: Pick<ActivityLog, 'minutes'>): boolean {
  return a.minutes >= MIN_ACTIVE_MINUTES;
}

/** Local dates with a qualifying activity, oldest first. One active day per date. */
export function activeDayDates(logs: ActivityLog[]): string[] {
  return [...new Set(logs.filter(qualifiesAsActiveDay).map((l) => l.date))].sort();
}

const OVERLAP_MS = 15 * 60 * 1000;

/**
 * Adds newly detected activities: skips ones already saved (same source id), ones the athlete
 * removed (dismissed ids), lifting, and any that overlap a saved activity (the same ride from two
 * apps counts once).
 */
export function mergeDetectedActivities(
  existing: ActivityLog[],
  detected: DetectedActivity[],
  dismissedIds: string[] = []
): { merged: ActivityLog[]; added: ActivityLog[] } {
  const merged = [...existing];
  const added: ActivityLog[] = [];
  const key = (source: ActivitySource, id: string) => `${source}:${id}`;
  const known = new Set(existing.filter((e) => e.externalId).map((e) => key(e.source, e.externalId as string)));
  const dismissed = new Set(dismissedIds);
  for (const d of [...detected].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const k = key(d.source, d.externalId);
    if (known.has(k) || dismissed.has(k)) continue;
    if (!(d.minutes > 0) || Number.isNaN(new Date(d.startedAt).getTime())) continue;
    const start = new Date(d.startedAt).getTime();
    const dEnd = start + d.minutes * 60000;
    const overlaps = merged.some((e) => {
      const s = new Date(e.startedAt).getTime();
      const end = s + e.minutes * 60000;
      return start < end + OVERLAP_MS && s < dEnd + OVERLAP_MS;
    });
    if (overlaps) continue;
    const log: ActivityLog = {
      ...d,
      id: `act-${d.source}-${d.externalId}`,
      date: localDateString(new Date(d.startedAt)),
      minutes: Math.round(d.minutes),
    };
    merged.push(log);
    added.push(log);
    known.add(k);
  }
  merged.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return { merged, added };
}

/** A manually logged activity, ending now. */
export function createManualActivity(type: ActivityType, minutes: number, now: Date = new Date()): ActivityLog {
  const start = new Date(now.getTime() - minutes * 60000);
  return {
    id: `act-manual-${now.getTime()}`,
    date: localDateString(start),
    startedAt: start.toISOString(),
    minutes: Math.round(minutes),
    type,
    source: 'manual',
  };
}

/** Short plain description, e.g. "32 min bike ride". */
export function describeActivity(a: ActivityLog): string {
  return `${a.minutes} min ${ACTIVITY_LABELS[a.type].toLowerCase()}`;
}

/** A detected workout that happened during a logged lifting session is that session, not an active day. */
export function overlapsLifting(a: Pick<ActivityLog, 'startedAt' | 'minutes'>, workouts: WorkoutSession[]): boolean {
  const start = new Date(a.startedAt).getTime();
  const end = start + a.minutes * 60000;
  return workouts.some((w) => {
    if (!w.completed || !w.completedAt) return false;
    const wEnd = new Date(w.completedAt).getTime();
    const wStart = w.startedAt ? new Date(w.startedAt).getTime() : wEnd - (w.durationMinutes || 60) * 60000;
    return start < wEnd && wStart < end;
  });
}
