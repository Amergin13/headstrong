import React, { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { GoalProgress, describeGoalStanding } from '../../services/athleteGoals';
import { WhoopWorkoutStrainSummary } from '../../services/whoopService';
import { FinishPersonalBest, WorkoutFinish } from '../../services/workoutFinish';
import { useWorkoutSummaryText } from './useWorkoutSummaryText';
import { WhoopStrainCard } from './FinishedWorkoutCards';
import { triggerHaptic } from '../../utils/haptics';
import { formatSentenceCase } from '../../utils/typography';
import { useUnits } from '../../utils/unitsContext';
import { CoachSummaryText } from '../common/CoachSummaryText';

interface WorkoutFinishScreenProps {
  finish: WorkoutFinish;
  onDone: () => void;
  whoopConfigured?: boolean;
  whoopTelemetry?: WhoopWorkoutStrainSummary | null;
  dayStrain?: number;
  hasLiveWhoopConnection?: boolean;
  isSyncingWhoop?: boolean;
  onRefreshWhoop?: () => void;
  onDebriefWithCoach?: () => void;
}

/** Semantic celebratory confetti: Positive Mint, Crisp White, and High-Contrast Slate. */
const CONFETTI_COLOURS = [
  'var(--color-accent-primary)',
  'var(--color-text-primary)',
  'var(--color-status-neutral)',
];
const CONFETTI_COUNT = 44;

const Confetti: React.FC = () => {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => {
        const angle = Math.PI * (1.05 + 0.9 * Math.random()) + (Math.random() - 0.5) * 0.5;
        const distance = 80 + Math.random() * 140;
        return {
          id: i,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          fall: 180 + Math.random() * 160,
          drift: (Math.random() - 0.5) * 64,
          spin: (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 480),
          delay: Math.random() * 180,
          duration: 1900 + Math.random() * 1100,
          size: 4 + Math.random() * 6,
          round: Math.random() < 0.3,
          colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
        };
      }),
    []
  );
  return (
    <div className="wk-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="wk-confetti-piece"
          style={
            {
              width: p.size,
              height: p.round ? p.size : p.size * 0.5,
              borderRadius: p.round ? '50%' : 1,
              background: p.colour,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--fall': `${p.fall}px`,
              '--drift': `${p.drift}px`,
              '--spin': `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
};

const CardTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="wk-title">
    {children}
  </h3>
);

const CardSubject: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="wk-meta-title mt-3">
    {children}
  </p>
);

const BigNumber: React.FC<{ value: string; unit?: string }> = ({ value, unit }) => (
  <p className="wk-display mt-2" style={{ color: 'var(--color-text-primary)' }}>
    {value}
    {unit && (
      <span className="wk-caption ml-1">
        {unit}
      </span>
    )}
  </p>
);

export const WorkoutFinishScreen: React.FC<WorkoutFinishScreenProps> = ({
  finish,
  onDone,
  whoopConfigured = false,
  whoopTelemetry,
  dayStrain,
  hasLiveWhoopConnection = false,
  isSyncingWhoop = false,
  onRefreshWhoop,
  onDebriefWithCoach,
}) => {
  const units = useUnits();
  const { report, personalBests, goalProgress, headline, continuity } = finish;
  const summary = useWorkoutSummaryText(finish);

  const plan = report.program.kind === 'plan' ? report.program : null;
  const planPct = plan ? Math.max(0, Math.min(100, (plan.workoutNumber / Math.max(1, plan.totalWorkouts)) * 100)) : 0;
  const volume = Math.round(units.toDisplay(report.session.volumeKg)).toLocaleString();

  const bestValue = (pb: FinishPersonalBest): { value: string; unit: string } => {
    if (pb.isBodyweight) return { value: `${pb.reps}`, unit: 'reps' };
    const [value, unit] = units.format(pb.weightKg).split(' ');
    return { value, unit: `${unit} × ${pb.reps}` };
  };
  const cardCount = personalBests.length + goalProgress.length;
  const span = (index: number) => (cardCount % 2 === 1 && index === cardCount - 1 ? 'col-span-2' : '');

  const goalLabel = (g: GoalProgress) => describeGoalStanding(g.goal, (kg) => units.formatPrecise(kg));

  const handleDone = () => {
    triggerHaptic('success');
    onDone();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Workout finished: ${report.session.name}`}
      className="wk fixed inset-0 z-50 overflow-y-auto"
      style={{
        backgroundColor: 'var(--color-bg-canvas)',
        backgroundImage: 'linear-gradient(180deg, rgb(var(--color-bg-surface-rgb) / 0.28) 0%, transparent 46%)',
      }}
    >
      <div className="relative mx-auto w-full max-w-md overflow-hidden min-h-full px-4 pt-12 pb-6">
        {/* Medal and confetti */}
        <div className="relative flex justify-center mb-12" style={{ height: 140 }}>
          <Confetti />
          <img
            src="/illustrations/workout-medal.png"
            alt=""
            aria-hidden="true"
            className="wk-medal-pop relative"
            style={{ width: 156, height: 140 }}
            width={345}
            height={310}
          />
        </div>

        {/* Workout and plan position */}
        <div className="flex items-end justify-between gap-2">
          <h2 className="wk-title">
            Workout finished: {formatSentenceCase(report.session.name)}
          </h2>
          {plan && (
            <span className="wk-number shrink-0">
              {plan.workoutNumber}/{plan.totalWorkouts}
            </span>
          )}
        </div>
        {plan && (
          <div
            className="wk-bar mt-3"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={plan.totalWorkouts}
            aria-valuenow={plan.workoutNumber}
            aria-label="Program progress"
          >
            <div className="wk-bar-grow" style={{ width: `${planPct}%` }} />
          </div>
        )}

        {/* Summary, volume and sets */}
        <section className="wk-card mt-5" aria-label="Workout summary">
          <span className="wk-label block mb-1" style={{ color: 'var(--wk-muted)' }}>
            Session takeaway
          </span>
          <CardTitle>{headline}</CardTitle>
          <CoachSummaryText text={summary} splitBy="sentences" className="mt-3" />
          <div className="flex gap-14 pt-5 mt-5 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <div>
              <p className="wk-label" style={{ color: 'var(--wk-muted)' }}>
                Volume ({units.unit})
              </p>
              <BigNumber value={volume} />
            </div>
            <div>
              <p className="wk-label" style={{ color: 'var(--wk-muted)' }}>
                Sets
              </p>
              <BigNumber value={`${report.session.workingSets}`} />
            </div>
          </div>
        </section>

        {/* Post-session Continuity Card (UI-5): win-lever badge + weekly muscle target + dual honest status */}
        {continuity && (
          <section className="wk-card mt-3 flex flex-col gap-3" aria-label="Training continuity summary">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span
                className="wk-pill"
                style={{
                  background: 'var(--color-status-positive-soft)',
                  color: 'var(--wk-accent)',
                  borderColor: 'var(--wk-accent)',
                }}
              >
                {continuity.winLeverBadge}
              </span>
              <span className="wk-caption">{continuity.environmentLabel}</span>
            </div>
            <CardTitle>{continuity.headline}</CardTitle>
            <div>
              <div className="flex items-center justify-between wk-caption tabular-nums mb-1">
                <span>
                  {continuity.primaryMuscle}: {continuity.weeklySetsCompleted} of {continuity.weeklyTargetMin}–{continuity.weeklyTargetMax} hard sets
                </span>
                <span style={{ color: 'var(--wk-accent)' }}>{continuity.weeklyTargetPct}%</span>
              </div>
              <div
                className="wk-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={continuity.weeklyTargetPct}
                aria-label={`${continuity.primaryMuscle} weekly volume target ${continuity.weeklyTargetPct}%`}
              >
                <div style={{ width: `${continuity.weeklyTargetPct}%` }} />
              </div>
            </div>
            <div
              className="pt-3 border-t flex flex-col gap-1"
              style={{ borderColor: 'var(--color-border-subtle)' }}
            >
              <p className="wk-caption m-0" style={{ color: 'var(--wk-accent)' }}>
                {continuity.muscleGrowthStatus}
              </p>
              <p className="wk-caption m-0" style={{ color: 'var(--color-text-secondary)' }}>
                {continuity.anchorStatusLine}
              </p>
            </div>
          </section>
        )}

        {/* Cardiovascular strain telemetry when configured */}
        {whoopConfigured && (
          <WhoopStrainCard
            workoutStrain={whoopTelemetry?.workoutStrain}
            dayStrain={whoopTelemetry?.dayStrain ?? dayStrain}
            avgHr={whoopTelemetry?.avgHeartRate}
            maxHr={whoopTelemetry?.maxHeartRate}
            isSyncing={isSyncingWhoop}
            isPendingScore={whoopTelemetry?.isPendingScore}
            hasLiveConnection={hasLiveWhoopConnection}
            onRetry={onRefreshWhoop}
            className="mt-3"
          />
        )}

        {/* Personal bests and goals moved by this workout */}
        {cardCount > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            {personalBests.map((r, i) => {
              const shown = bestValue(r);
              return (
                <section key={`pb-${r.exerciseName}`} className={`wk-card ${span(i)}`} aria-label={`Personal best: ${r.exerciseName}, ${shown.value} ${shown.unit}`}>
                  <CardTitle>Personal best</CardTitle>
                  <CardSubject>{r.exerciseName}</CardSubject>
                  <BigNumber value={shown.value} unit={shown.unit} />
                </section>
              );
            })}
            {goalProgress.map((g, i) => (
              <section key={`goal-${g.title}`} className={`wk-card flex flex-col ${span(personalBests.length + i)}`} aria-label={`Goal ${g.status}: ${g.title}, ${goalLabel(g)}`}>
                <CardTitle>{g.status === 'reached' ? 'Goal reached' : 'Goal progressed'}</CardTitle>
                <CardSubject>{g.title}</CardSubject>
                {g.kind === 'outcome' && (
                  <p className="wk-caption mt-2">
                    {goalLabel(g)}
                  </p>
                )}
                <div className="mt-auto pt-4">
                  <div
                    className="wk-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={g.progressPct}
                    aria-label={`${g.title} progress`}
                  >
                    <div className="wk-bar-grow" style={{ width: `${g.progressPct}%` }} />
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 mt-5">
          <button
            type="button"
            onClick={handleDone}
            aria-label="Close: done"
            className="wk-button transition-transform active:scale-[0.98]"
            style={{ background: 'var(--color-action-primary-bg)', color: 'var(--color-action-primary-fg)' }}
          >
            Done
          </button>
          {onDebriefWithCoach && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onDebriefWithCoach();
              }}
              className="wk-btn-secondary w-full min-h-[44px] justify-center gap-2"
              style={{ borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)' }}
            >
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--color-coach-accent)' }} strokeWidth={2.2} aria-hidden="true" />
              <span>Debrief with Treise</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
