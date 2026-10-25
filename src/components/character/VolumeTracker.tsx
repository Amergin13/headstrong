import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  HYPERTROPHY_VOLUME_LANDMARKS,
  evaluateVolumeStatus,
  getRecommendedSetsForWeek,
} from '../../engine/hypertrophyVolume';
import { triggerHaptic } from '../../utils/haptics';

const fig = (px: number) => `calc(${px} * var(--f))`;

interface VolumeTrackerProps {
  weeklyVolume: Record<string, number>;
  /** Current week of the 6-week plan; weekly targets ramp up across the block. */
  mesoWeek?: number;
  goalPhase?: 'Lean Bulk' | 'Cut / Recomp' | 'Maingain';
}

type FilterCategory = 'All' | 'Fast Recovery' | 'Needs More Rest' | 'Worked in Presses';

export const VolumeTracker: React.FC<VolumeTrackerProps> = ({
  weeklyVolume,
  mesoWeek = 1,
  goalPhase = 'Lean Bulk',
}) => {
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [showScienceModal, setShowScienceModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('All');

  const muscleKeys = [
    'SideDelts',
    'Calves',
    'RearDelts',
    'Chest',
    'Back',
    'Quads',
    'Hamstrings',
    'Triceps',
    'Biceps',
    'Glutes',
    'Core',
  ];

  const handleToggleMuscle = (key: string) => {
    triggerHaptic('light');
    setSelectedMuscle(selectedMuscle === key ? null : key);
  };

  const handleFilterClick = (filter: FilterCategory) => {
    triggerHaptic('light');
    setActiveFilter(filter);
  };

  const filteredKeys = muscleKeys.filter((key) => {
    const lm = HYPERTROPHY_VOLUME_LANDMARKS[key];
    if (!lm) return true;
    if (activeFilter === 'Fast Recovery') return lm.category === 'High Volume Responder';
    if (activeFilter === 'Needs More Rest') return lm.category === 'Fatigue / Damage Sensitive';
    if (activeFilter === 'Worked in Presses')
      return lm.category === 'High Compound Crossover' || lm.category === 'Moderate Tolerance';
    return true;
  });

  // "On target" means this week's planned target is met (targets ramp up week by week).
  const optimalCount = muscleKeys.filter((k) => {
    const sets = weeklyVolume[k] || 0;
    const weekTarget = getRecommendedSetsForWeek(k, mesoWeek, goalPhase).targetSets;
    return sets >= weekTarget && evaluateVolumeStatus(k, sets).status !== 'above_mrv';
  }).length;

  const overallPct = Math.max(0, Math.min(100, (optimalCount / Math.max(1, muscleKeys.length)) * 100));

  return (
    <div className="flex flex-col" style={{ gap: fig(22) }}>
      {/* Summary Card — ProgramProgressCard anatomy */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setShowScienceModal(true);
        }}
        aria-label="Learn how weekly set targets work"
        className="wk-card w-full text-left block"
      >
        <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
          <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
            Weekly Sets by Muscle
          </h2>
          <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
        </div>
        <p
          style={{
            fontSize: fig(28),
            lineHeight: 1.21,
            color: 'var(--wk-muted)',
            marginTop: fig(20),
          }}
        >
          Target set ranges matched to each muscle&apos;s recovery speed
        </p>
        <div
          className="flex items-end justify-between"
          style={{ marginTop: fig(60), gap: fig(20) }}
        >
          <span className="wk-label" style={{ lineHeight: 1.21 }}>
            WEEK {mesoWeek}: MUSCLES ON TARGET
          </span>
          <span
            className="font-bold text-white shrink-0"
            style={{ fontSize: fig(40), lineHeight: 1 }}
          >
            {optimalCount}/{muscleKeys.length}
          </span>
        </div>
        <div
          className="wk-bar"
          style={{ marginTop: fig(30) }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={muscleKeys.length}
          aria-valuenow={optimalCount}
          aria-label="Muscles on target this week"
        >
          <div style={{ width: `${overallPct}%` }} />
        </div>
      </button>

      {/* Category Filter Segment Bar */}
      <div
        role="group"
        aria-label="Muscle recovery category"
        className="grid grid-cols-4"
        style={{
          padding: fig(8),
          gap: fig(8),
          borderRadius: fig(30),
          background: 'var(--wk-card)',
        }}
      >
        {(['All', 'Fast Recovery', 'Needs More Rest', 'Worked in Presses'] as FilterCategory[]).map(
          (cat) => {
            const active = activeFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={active}
                onClick={() => handleFilterClick(cat)}
                className="flex items-center justify-center font-bold uppercase text-center transition-colors px-1"
                style={{
                  minHeight: 44,
                  height: fig(84),
                  borderRadius: fig(22),
                  fontSize: fig(20),
                  background: active ? 'var(--wk-pill)' : 'transparent',
                  color: active ? '#fff' : 'var(--wk-muted)',
                }}
              >
                {cat === 'Fast Recovery'
                  ? 'Fast'
                  : cat === 'Needs More Rest'
                  ? 'Deep Rest'
                  : cat === 'Worked in Presses'
                  ? 'Presses'
                  : 'All'}
              </button>
            );
          }
        )}
      </div>

      {/* Individual Muscle Cards — each using the exact ProgramProgressCard layout */}
      {filteredKeys.map((key) => {
        const sets = weeklyVolume[key] || 0;
        const evaluation = evaluateVolumeStatus(key, sets);
        const weekTarget = getRecommendedSetsForWeek(key, mesoWeek, goalPhase).targetSets;
        const metWeekTarget = sets >= weekTarget;
        const { landmark, status } = evaluation;
        const isExpanded = selectedMuscle === key;
        const isAboveMrv = status === 'above_mrv';
        const pct = Math.max(0, Math.min(100, (sets / Math.max(1, weekTarget)) * 100));

        const statusSubtitle = isAboveMrv
          ? 'Above recovery limit • scale back sets'
          : metWeekTarget
          ? `Target reached • ${landmark.frequencyMin}–${landmark.frequencyMax}x a week`
          : sets === 0
          ? `Not trained yet • ${landmark.frequencyMin}–${landmark.frequencyMax}x a week`
          : `${weekTarget - sets} sets to go • ${landmark.frequencyMin}–${landmark.frequencyMax}x a week`;

        return (
          <section
            key={key}
            aria-label={landmark.displayName}
            className="wk-card w-full text-left block"
          >
            <button
              type="button"
              onClick={() => handleToggleMuscle(key)}
              aria-expanded={isExpanded}
              className="w-full text-left block"
            >
              <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
                <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
                  {landmark.displayName}
                </h3>
                <ChevronRight
                  className="wk-chevron transition-transform"
                  style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </div>
              <p
                style={{
                  fontSize: fig(28),
                  lineHeight: 1.21,
                  color: 'var(--wk-muted)',
                  marginTop: fig(20),
                }}
              >
                {statusSubtitle}
              </p>
              <div
                className="flex items-end justify-between"
                style={{ marginTop: fig(60), gap: fig(20) }}
              >
                <span className="wk-label" style={{ lineHeight: 1.21 }}>
                  WEEK {mesoWeek} TARGET ({landmark.mavMin}–{landmark.mavMax} OPTIMAL)
                </span>
                <span
                  className="font-bold text-white shrink-0"
                  style={{ fontSize: fig(40), lineHeight: 1 }}
                >
                  {sets}/{weekTarget}
                </span>
              </div>
              <div
                className="wk-bar"
                style={{ marginTop: fig(30) }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={weekTarget}
                aria-valuenow={sets}
                aria-label={`${landmark.displayName} weekly sets`}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    background: isAboveMrv ? '#FF3B4E' : undefined,
                  }}
                />
              </div>
            </button>

            {isExpanded && (
              <div
                style={{
                  marginTop: fig(40),
                  paddingTop: fig(36),
                  borderTop: `${fig(2)} solid rgba(255,255,255,0.08)`,
                }}
              >
                <div className="flex flex-wrap" style={{ gap: fig(12), marginBottom: fig(24) }}>
                  <span className="wk-pill">{landmark.fiberProfile}</span>
                  <span className="wk-pill">{landmark.recommendedRepRanges} REPS</span>
                </div>
                <p className="wk-body">{landmark.scientificRationale}</p>
              </div>
            )}
          </section>
        );
      })}

      {/* Plain-English Guide Modal */}
      {showScienceModal && (
        <div className="wk fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="wk-card w-full max-w-md max-h-[85vh] overflow-y-auto no-scrollbar shadow-2xl">
            <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
              <div>
                <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
                  Why Set Targets Vary by Muscle
                </h3>
                <p
                  style={{
                    fontSize: fig(28),
                    lineHeight: 1.21,
                    color: 'var(--wk-muted)',
                    marginTop: fig(16),
                  }}
                >
                  Different muscles recover at different speeds
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowScienceModal(false)}
                aria-label="Close guide modal"
                className="wk-pill min-h-[44px] text-white shrink-0"
              >
                Close
              </button>
            </div>

            <div className="flex flex-col" style={{ gap: fig(36), marginTop: fig(44) }}>
              <div>
                <span className="wk-label block">
                  1. Fast-Recovering Muscles (16–26 sets/wk)
                </span>
                <p className="wk-body" style={{ marginTop: fig(12) }}>
                  Smaller muscles like your side shoulders and calves don&apos;t tire out your lower
                  back or whole body. They recover in about 24 hours, so training them 3–5 times a
                  week with more sets gives the best growth.
                </p>
              </div>

              <div>
                <span className="wk-label block">
                  2. Deep-Stretch Muscles (10–18 sets/wk)
                </span>
                <p className="wk-body" style={{ marginTop: fig(12) }}>
                  Muscles like your hamstrings, chest, and quads work under heavy loads and deep
                  stretches. They need 2–3 days to fully repair between hard workouts, so quality
                  matters more than doing 20+ sets.
                </p>
              </div>

              <div>
                <span className="wk-label block">3. Muscles Worked During Presses</span>
                <p className="wk-body" style={{ marginTop: fig(12) }}>
                  Your front shoulders and triceps already work hard during bench press and shoulder
                  press. They need fewer extra isolation sets to grow without sore joints.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowScienceModal(false)}
              className="wk-button"
              style={{ marginTop: fig(44), background: 'var(--wk-accent)', color: '#13181C' }}
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
