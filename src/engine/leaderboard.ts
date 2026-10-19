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

// Canonical community leaderboard entries (active verified lifters)
export const COMMUNITY_ATHLETES: Omit<LeaderboardEntry, 'rank'>[] = [
  { athleteId: 'ath-1', displayName: 'Marcus Vance', xp: 5820, division: 'Elite', level: 16, streakDays: 32, avatarInitial: 'M', primaryPillar: 'Squat' },
  { athleteId: 'ath-2', displayName: 'Elena Rostova', xp: 5240, division: 'Elite', level: 15, streakDays: 28, avatarInitial: 'E', primaryPillar: 'Horizontal Push' },
  { athleteId: 'ath-3', displayName: 'Tariq Al-Mansoor', xp: 4890, division: 'Diamond', level: 14, streakDays: 24, avatarInitial: 'T', primaryPillar: 'Hinge' },
  { athleteId: 'ath-4', displayName: 'Chloe Dupont', xp: 4420, division: 'Diamond', level: 13, streakDays: 21, avatarInitial: 'C', primaryPillar: 'Vertical Pull' },
  { athleteId: 'ath-5', displayName: 'Henrik Lindqvist', xp: 3980, division: 'Diamond', level: 12, streakDays: 19, avatarInitial: 'H', primaryPillar: 'Squat' },
  { athleteId: 'ath-6', displayName: 'Aisha Sharma', xp: 3560, division: 'Diamond', level: 11, streakDays: 17, avatarInitial: 'A', primaryPillar: 'Horizontal Pull' },
  { athleteId: 'ath-7', displayName: 'Devon Miller', xp: 3240, division: 'Platinum', level: 10, streakDays: 15, avatarInitial: 'D', primaryPillar: 'Horizontal Push' },
  { athleteId: 'ath-8', displayName: 'Kaito Tanaka', xp: 2950, division: 'Platinum', level: 9, streakDays: 14, avatarInitial: 'K', primaryPillar: 'Hinge' },
  { athleteId: 'ath-9', displayName: 'Sarah Jenkins', xp: 2680, division: 'Platinum', level: 8, streakDays: 12, avatarInitial: 'S', primaryPillar: 'Vertical Push' },
  { athleteId: 'ath-10', displayName: 'Mateo Morales', xp: 2480, division: 'Gold', level: 7, streakDays: 11, avatarInitial: 'M', primaryPillar: 'Squat' },
  { athleteId: 'ath-11', displayName: 'Liam O’Connor', xp: 2180, division: 'Gold', level: 7, streakDays: 9, avatarInitial: 'L', primaryPillar: 'Horizontal Push' },
  { athleteId: 'ath-12', displayName: 'Zoe Kravitz', xp: 1920, division: 'Gold', level: 6, streakDays: 8, avatarInitial: 'Z', primaryPillar: 'Vertical Pull' },
  { athleteId: 'ath-13', displayName: 'Noah Kim', xp: 1650, division: 'Gold', level: 5, streakDays: 7, avatarInitial: 'N', primaryPillar: 'Hinge' },
  { athleteId: 'ath-14', displayName: 'Amara Okafor', xp: 1380, division: 'Silver', level: 4, streakDays: 6, avatarInitial: 'A', primaryPillar: 'Squat' },
  { athleteId: 'ath-15', displayName: 'Lucas Silva', xp: 1140, division: 'Silver', level: 3, streakDays: 5, avatarInitial: 'L', primaryPillar: 'Horizontal Push' },
  { athleteId: 'ath-16', displayName: 'Freja Nielsen', xp: 890, division: 'Silver', level: 2, streakDays: 4, avatarInitial: 'F', primaryPillar: 'Horizontal Pull' },
  { athleteId: 'ath-17', displayName: 'Jordan Reed', xp: 650, division: 'Bronze', level: 2, streakDays: 3, avatarInitial: 'J', primaryPillar: 'Vertical Push' },
  { athleteId: 'ath-18', displayName: 'Samira Khan', xp: 420, division: 'Bronze', level: 1, streakDays: 2, avatarInitial: 'S', primaryPillar: 'Hinge' },
  { athleteId: 'ath-19', displayName: 'Oliver Bennett', xp: 240, division: 'Bronze', level: 1, streakDays: 1, avatarInitial: 'O', primaryPillar: 'Squat' },
];

/**
 * Builds the complete Leaderboard Summary.
 * If the user has opted in (`profile.leaderboardOptIn === true`),
 * the user is seamlessly inserted at their exact rank according to `profile.currentXp`.
 */
export function buildLeaderboardSummary(profile: UserProfile): LeaderboardSummary {
  const isOptedIn = Boolean(profile.leaderboardOptIn);
  const userXp = profile.currentXp;
  const userDiv = getDivisionForXp(userXp);
  const nextDivInfo = getNextDivisionInfo(userXp);

  const rawEntries = [...COMMUNITY_ATHLETES];

  let userEntry: LeaderboardEntry | null = null;

  if (isOptedIn) {
    userEntry = {
      rank: 0, // Assigned after sorting
      athleteId: 'current-user',
      displayName: profile.leaderboardDisplayName || profile.name || 'You',
      xp: userXp,
      division: userDiv,
      level: profile.level,
      streakDays: profile.streakDays,
      isCurrentUser: true,
      avatarInitial: (profile.name || 'A').charAt(0).toUpperCase(),
      primaryPillar: 'Horizontal Push',
    };
    rawEntries.push(userEntry);
  }

  // Sort descending by XP
  rawEntries.sort((a, b) => b.xp - a.xp);

  // Assign sequential 1-indexed ranks
  const rankedEntries: LeaderboardEntry[] = rawEntries.map((entry, index) => {
    const rank = index + 1;
    if (entry.isCurrentUser && userEntry) {
      userEntry.rank = rank;
    }
    return {
      ...entry,
      rank,
    };
  });

  const currentUserRank = userEntry ? userEntry.rank : null;

  // Calculate XP gap to overtake the athlete right above the user
  let xpToNextRank = 0;
  if (currentUserRank && currentUserRank > 1) {
    const athleteAbove = rankedEntries[currentUserRank - 2];
    if (athleteAbove) {
      xpToNextRank = Math.max(1, athleteAbove.xp - userXp + 1);
    }
  }

  return {
    entries: rankedEntries,
    currentUserEntry: userEntry,
    userDivision: userDiv,
    userRank: currentUserRank,
    totalAthletes: rankedEntries.length,
    xpToNextRank,
    xpToNextDivision: nextDivInfo.gapXp,
    nextDivision: nextDivInfo.nextDivision,
    isOptedIn,
  };
}
