import { GoalPhase } from '../engine/types';

/** The goal names athletes see everywhere (internal phase names stay out of the UI). */
export const GOAL_DISPLAY_NAME: Record<GoalPhase, string> = {
  'Lean Bulk': 'Build Muscle',
  'Cut / Recomp': 'Lose Fat',
  Maingain: 'Stay Lean',
};
