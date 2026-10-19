import React, { useState } from 'react';
import {
  HYPERTROPHY_VOLUME_LANDMARKS,
  evaluateVolumeStatus,
} from '../../engine/hypertrophyVolume';
import { triggerHaptic } from '../../utils/haptics';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Flame,
} from 'lucide-react';

interface VolumeTrackerProps {
  weeklyVolume: Record<string, number>;
}

type FilterCategory = 'All' | 'Fast Recovery' | 'Needs More Rest' | 'Worked in Presses';

export const VolumeTracker: React.FC<VolumeTrackerProps> = ({ weeklyVolume }) => {
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

  const optimalCount = muscleKeys.filter((k) => {
    const sets = weeklyVolume[k] || 0;
    const status = evaluateVolumeStatus(k, sets).status;
    return status === 'optimal_mav' || status === 'near_mrv';
  }).length;

  return (
    <div className="biometric-card p-5 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="font-extrabold text-base text-white tracking-tight">
              Weekly Sets by Muscle
            </h3>
            <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-brand-primary/15 text-brand-primary">
              {optimalCount}/{muscleKeys.length} on target
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Target set ranges matched to each muscle&apos;s recovery speed
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setShowScienceModal(true);
          }}
          aria-label="Learn how weekly set targets work"
          className="px-3.5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-slate-200 hover:text-white transition-all flex items-center space-x-1.5 text-xs font-semibold min-h-[44px]"
        >
          <BookOpen className="w-3.5 h-3.5 text-brand-primary stroke-[2]" />
          <span>How it works</span>
        </button>
      </div>

      {/* Category Filter Pills */}
      <div className="flex space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
        {(['All', 'Fast Recovery', 'Needs More Rest', 'Worked in Presses'] as FilterCategory[]).map(
          (cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleFilterClick(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all min-h-[36px] flex items-center justify-center ${
                activeFilter === cat
                  ? 'bg-white text-slate-950 font-bold shadow-sm'
                  : 'bg-[#151A24] text-slate-400 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              {cat}
            </button>
          )
        )}
      </div>

      {/* Muscle Volume Cards */}
      <div className="space-y-3 pt-1">
        {filteredKeys.map((key) => {
          const sets = weeklyVolume[key] || 0;
          const evaluation = evaluateVolumeStatus(key, sets);
          const { landmark, status } = evaluation;
          const isExpanded = selectedMuscle === key;

          const isOptimal = status === 'optimal_mav';
          const isNearMrv = status === 'near_mrv';
          const isAboveMrv = status === 'above_mrv';
          const isEffective = status === 'effective';

          const barScaleMax = Math.max(landmark.mrv + 4, 30);
          const mavLeftPercent = (landmark.mavMin / barScaleMax) * 100;
          const mavWidthPercent = ((landmark.mavMax - landmark.mavMin) / barScaleMax) * 100;
          const actualFillPercent = Math.min(100, (sets / barScaleMax) * 100);

          return (
            <div
              key={key}
              className={`p-4 rounded-2xl transition-all duration-200 ${
                isExpanded
                  ? 'bg-[#151921] shadow-lg'
                  : 'bg-[#0B0E14] hover:bg-[#11141B]'
              }`}
            >
              {/* Row Header */}
              <div
                onClick={() => handleToggleMuscle(key)}
                className="cursor-pointer select-none space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">
                    {landmark.displayName}
                  </span>

                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs">
                      <span
                        className={`font-bold text-sm ${
                          isOptimal
                            ? 'text-brand-primary'
                            : isAboveMrv
                            ? 'text-rose-400'
                            : isNearMrv
                            ? 'text-amber-400'
                            : 'text-white'
                        }`}
                      >
                        {sets}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">
                        / {landmark.mavMin}–{landmark.mavMax} sets
                      </span>
                    </span>

                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 stroke-[2]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 stroke-[2]" />
                    )}
                  </div>
                </div>

                {/* Progress Bar with Target Zone */}
                <div className="relative w-full bg-[#141824] h-2.5 rounded-full overflow-hidden">
                  <div
                    className="absolute top-0 bottom-0 bg-brand-primary/20 z-0"
                    style={{
                      left: `${mavLeftPercent}%`,
                      width: `${mavWidthPercent}%`,
                    }}
                    title={`Target Zone: ${landmark.mavMin}–${landmark.mavMax} sets`}
                  />

                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out relative z-10 ${
                      isOptimal
                        ? 'bg-brand-primary'
                        : isAboveMrv
                        ? 'bg-rose-500'
                        : isNearMrv
                        ? 'bg-amber-400'
                        : isEffective
                        ? 'bg-cyan-400'
                        : 'bg-slate-500'
                    }`}
                    style={{ width: `${actualFillPercent}%` }}
                  />
                </div>

                {/* Status Indicator Line */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">
                    Target: {landmark.mavMin}–{landmark.mavMax} sets/wk
                  </span>

                  <span className={`font-semibold flex items-center space-x-1 ${evaluation.statusColor}`}>
                    {isOptimal && <CheckCircle2 className="w-3.5 h-3.5 text-brand-primary stroke-[2]" />}
                    {isAboveMrv && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 stroke-[2]" />}
                    {isNearMrv && <Flame className="w-3.5 h-3.5 text-amber-400 stroke-[2]" />}
                    <span>{evaluation.statusLabel}</span>
                  </span>
                </div>
              </div>

              {/* Expandable Plain-English Explanation */}
              {isExpanded && (
                <div className="mt-3 pt-3 space-y-2.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 rounded-xl bg-[#090C12]">
                      <span className="text-slate-400 block text-xs">
                        Recovery Speed
                      </span>
                      <span className="text-white font-semibold mt-0.5 block">
                        {landmark.fiberProfile}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#090C12]">
                      <span className="text-slate-400 block text-xs">
                        Best Frequency
                      </span>
                      <span className="text-white font-semibold mt-0.5 block">
                        {landmark.frequencyMin}–{landmark.frequencyMax} days / week
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#090C12] space-y-1">
                    <span className="text-xs text-brand-primary font-semibold block">
                      Why this target?
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {landmark.scientificRationale}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs px-1 text-slate-400">
                    <span>Best Rep Range:</span>
                    <span className="font-mono text-slate-200 font-semibold">
                      {landmark.recommendedRepRanges}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Plain-English Guide Modal */}
      {showScienceModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0E1219] rounded-3xl p-5 sm:p-6 space-y-5 max-h-[85vh] overflow-y-auto no-scrollbar shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.04] pb-3">
              <div>
                <h3 className="font-bold text-white text-base tracking-tight">
                  Why Set Targets Vary by Muscle
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Different muscles recover at different speeds
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowScienceModal(false)}
                aria-label="Close guide modal"
                className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="p-4 rounded-2xl bg-[#090C12] space-y-1">
                <span className="font-bold text-white text-sm block">
                  1. Fast-Recovering Muscles (16–26 sets/wk)
                </span>
                <p className="text-xs text-slate-300">
                  Smaller muscles like your <strong>side shoulders and calves</strong> don&apos;t tire out your lower back or whole body. They recover in about 24 hours, so training them 3–5 times a week with more sets gives the best growth.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#090C12] space-y-1">
                <span className="font-bold text-white text-sm block">
                  2. Deep-Stretch Muscles (10–18 sets/wk)
                </span>
                <p className="text-xs text-slate-300">
                  Muscles like your <strong>hamstrings, chest, and quads</strong> work under heavy loads and deep stretches. They need 2–3 days to fully repair between hard workouts, so quality matters more than doing 20+ sets.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#090C12] space-y-1">
                <span className="font-bold text-white text-sm block">
                  3. Muscles Worked During Presses
                </span>
                <p className="text-xs text-slate-300">
                  Your <strong>front shoulders and triceps</strong> already work hard during bench press and shoulder press. They need fewer extra isolation sets to grow without sore joints.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowScienceModal(false)}
              className="w-full py-3 min-h-[44px] rounded-2xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-sm shadow-md active:scale-95"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
