import { UserProfile } from './types';

export type LeaderboardDivision =
  | 'Elite'
  | 'Diamond'
  | 'Platinum'
  | 'Gold'
  | 'Silver'
  | 'Bronze';

export interface LeaderboardEntry {
  rank: number;
  athleteId: string;
  displayName: string;
  xp: number;
  division: LeaderboardDivision;
  level: number;
  streakDays: number;
  isCurrentUser?: boolean;
  avatarInitial: string;
  primaryPillar?: string;
}

export interface LeaderboardSummary {
  entries: LeaderboardEntry[];
  currentUserEntry: LeaderboardEntry | null;
  userDivision: LeaderboardDivision;
  userRank: number | null;
  totalAthletes: number;
  xpToNextRank: number;
  xpToNextDivision: number;
  nextDivision: LeaderboardDivision | null;
  isOptedIn: boolean;
}

export const DIVISION_THRESHOLDS: { division: LeaderboardDivision; minXp: number; maxXp: number }[] = [
  { division: 'Elite', minXp: 5000, maxXp: Infinity },
  { division: 'Diamond', minXp: 3500, maxXp: 4999 },
  { division: 'Platinum', minXp: 2500, maxXp: 3499 },
  { division: 'Gold', minXp: 1500, maxXp: 2499 },
  { division: 'Silver', minXp: 750, maxXp: 1499 },
  { division: 'Bronze', minXp: 0, maxXp: 749 },
];

export function getDivisionForXp(xp: number): LeaderboardDivision {
  for (const t of DIVISION_THRESHOLDS) {
    if (xp >= t.minXp) return t.division;
  }
  return 'Bronze';
}

export function getNextDivisionInfo(currentXp: number): { nextDivision: LeaderboardDivision | null; gapXp: number } {
  const currentDiv = getDivisionForXp(currentXp);
  const currentIndex = DIVISION_THRESHOLDS.findIndex((d) => d.division === currentDiv);

  if (currentIndex <= 0) {
    // Already in top division (Elite)
    return { nextDivision: null, gapXp: 0 };
  }

  const targetDiv = DIVISION_THRESHOLDS[currentIndex - 1];
  return {
    nextDivision: targetDiv.division,
    gapXp: Math.max(0, targetDiv.minXp - currentXp),
  };
}

export interface DivisionProgress {
  division: LeaderboardDivision;
  currentXp: number;
  divisionMinXp: number;
  nextDivision: LeaderboardDivision | null;
  xpToNextDivision: number;
  progressPercent: number; // 0-100 progress through the current division
}

/**
 * Personal XP division progress. There is no community backend yet, so Treise only
 * shows the athlete's own standing and never fabricates other athletes.
 */
export function getDivisionProgress(currentXp: number): DivisionProgress {
  const division = getDivisionForXp(currentXp);
  const tier = DIVISION_THRESHOLDS.find((d) => d.division === division)!;
  const { nextDivision, gapXp } = getNextDivisionInfo(currentXp);
  const span = Number.isFinite(tier.maxXp) ? tier.maxXp + 1 - tier.minXp : 1;
  const progressPercent = nextDivision
    ? Math.max(0, Math.min(100, Math.round(((currentXp - tier.minXp) / span) * 100)))
    : 100;
  return {
    division,
    currentXp,
    divisionMinXp: tier.minXp,
    nextDivision,
    xpToNextDivision: gapXp,
    progressPercent,
  };
}

/**
 * Builds the leaderboard summary. Until a real, verified community service exists the
 * board only ever contains the current athlete (when opted in) — no sample athletes.
 */
export function buildLeaderboardSummary(profile: UserProfile): LeaderboardSummary {
  const isOptedIn = Boolean(profile.leaderboardOptIn);
  const userXp = profile.currentXp;
  const nextDivInfo = getNextDivisionInfo(userXp);

  const userEntry: LeaderboardEntry | null = isOptedIn
    ? {
        rank: 1,
        athleteId: 'current-user',
        displayName: profile.leaderboardDisplayName || profile.name || 'You',
        xp: userXp,
        division: getDivisionForXp(userXp),
        level: profile.level,
        streakDays: profile.streakDays,
        isCurrentUser: true,
        avatarInitial: (profile.name || 'A').charAt(0).toUpperCase(),
      }
    : null;

  return {
    entries: userEntry ? [userEntry] : [],
    currentUserEntry: userEntry,
    userDivision: getDivisionForXp(userXp),
    userRank: userEntry ? 1 : null,
    totalAthletes: userEntry ? 1 : 0,
    xpToNextRank: 0,
    xpToNextDivision: nextDivInfo.gapXp,
    nextDivision: nextDivInfo.nextDivision,
    isOptedIn,
  };
}
