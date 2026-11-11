import React, { useMemo } from 'react';
import { GoalProgress } from '../../services/athleteGoals';
import { FinishPersonalBest, WorkoutFinish } from '../../services/workoutFinish';
import { useWorkoutSummaryText } from './useWorkoutSummaryText';
import { triggerHaptic } from '../../utils/haptics';
import { useUnits } from '../../utils/unitsContext';

const fig = (px: number) => `calc(${px} * var(--f))`;
const text = (px: number) => `max(12px, ${fig(px)})`;

interface WorkoutFinishScreenProps {
  finish: WorkoutFinish;
  onDone: () => void;
}

/** Mint, white and deeper green: the medal's own colours. */
const CONFETTI_COLOURS = ['#00F19F', '#7CF7CF', '#FFFFFF', '#19C98A', '#B8FBE3'];
const CONFETTI_COUNT = 44;

/**
 * A burst of confetti from behind the medal that then drifts down. Decorative only: hidden from
 * screen readers, never blocks taps, and skipped entirely with reduced motion (see index.css).
 */
const Confetti: React.FC = () => {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => {
        // Spread around the upper half so pieces fly up and out, then fall.
        const angle = Math.PI * (1.05 + 0.9 * Math.random()) + (Math.random() - 0.5) * 0.5;
        const distance = 170 + Math.random() * 300;
        return {
          id: i,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          fall: 380 + Math.random() * 360,
          drift: (Math.random() - 0.5) * 140,
          spin: (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 480),
          delay: Math.random() * 180,
          duration: 1900 + Math.random() * 1100,
          size: 10 + Math.random() * 12,
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
              width: fig(p.size),
              height: fig(p.round ? p.size : p.size * 0.5),
              borderRadius: p.round ? '50%' : fig(2),
              background: p.colour,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
              '--dx': fig(p.dx),
              '--dy': fig(p.dy),
              '--fall': fig(p.fall),
              '--drift': fig(p.drift),
              '--spin': `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
};

const CardTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="wk-label" style={{ lineHeight: 1.21 }}>
    {children}
  </h3>
);

const CardSubject: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="uppercase" style={{ fontSize: text(26), lineHeight: 1.21, color: 'var(--wk-muted)', marginTop: fig(26) }}>
    {children}
  </p>
);

const BigNumber: React.FC<{ value: string; unit?: string }> = ({ value, unit }) => (
  <p className="font-bold text-white tabular-numbers" style={{ fontSize: text(64), lineHeight: 1, marginTop: fig(12) }}>
    {value}
    {unit && (
      <span className="font-semibold" style={{ fontSize: text(26), color: 'var(--wk-muted)', marginLeft: fig(10) }}>
        {unit}
      </span>
    )}
  </p>
);

export const WorkoutFinishScreen: React.FC<WorkoutFinishScreenProps> = ({ finish, onDone }) => {
  const units = useUnits();
  const { report, personalBests, goalProgress, headline } = finish;
  const summary = useWorkoutSummaryText(finish);

  const plan = report.program.kind === 'plan' ? report.program : null;
  const planPct = plan ? Math.max(0, Math.min(100, (plan.workoutNumber / Math.max(1, plan.totalWorkouts)) * 100)) : 0;
  const volume = Math.round(units.toDisplay(report.session.volumeKg)).toLocaleString();

  // A bodyweight best is its reps ("15 reps"); a loaded one is the set ("25 kg × 18").
  const bestValue = (pb: FinishPersonalBest): { value: string; unit: string } => {
    if (pb.isBodyweight) return { value: `${pb.reps}`, unit: 'reps' };
    const [value, unit] = units.format(pb.weightKg).split(' ');
    return { value, unit: `${unit} × ${pb.reps}` };
  };
  const cardCount = personalBests.length + goalProgress.length;
  // A card on its own in the last row takes the full width.
  const span = (index: number) => (cardCount % 2 === 1 && index === cardCount - 1 ? 'col-span-2' : '');

  const goalLabel = (g: GoalProgress) =>
    g.unit === 'kg'
      ? `${units.formatPrecise(g.current)} of ${units.formatPrecise(g.target)} estimated max`
      : `${g.current} of ${g.target} sessions this week`;

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
      style={{ background: 'linear-gradient(180deg, #283339 0%, #13181C 46%)' }}
    >
      <div className="relative mx-auto w-full max-w-md overflow-hidden" style={{ minHeight: '100%', padding: `${fig(120)} ${fig(38)} ${fig(48)}` }}>
        {/* Medal and confetti */}
        <div className="relative flex justify-center" style={{ height: fig(310), marginBottom: fig(120) }}>
          <Confetti />
          <img
            src="/illustrations/workout-medal.png"
            alt=""
            aria-hidden="true"
            className="wk-medal-pop relative"
            style={{ width: fig(345), height: fig(310) }}
            width={345}
            height={310}
          />
        </div>

        {/* Workout and plan position */}
        <div className="flex items-end justify-between" style={{ gap: fig(20) }}>
          <h2 className="wk-label" style={{ lineHeight: 1.21 }}>
            Workout finished: {report.session.name}
          </h2>
          {plan && (
            <span className="font-bold text-white shrink-0 tabular-numbers" style={{ fontSize: text(40), lineHeight: 1 }}>
              {plan.workoutNumber}/{plan.totalWorkouts}
            </span>
          )}
        </div>
        {plan && (
          <div
            className="wk-bar"
            style={{ marginTop: fig(30) }}
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
        <section className="wk-card" style={{ marginTop: fig(40) }} aria-label="Workout summary">
          <CardTitle>{headline}</CardTitle>
          <p className="wk-body" style={{ marginTop: fig(12) }} aria-live="polite">
            <span key={summary} className="wk-text-swap">
              {summary}
            </span>
          </p>
          <div className="flex" style={{ gap: fig(126), marginTop: fig(60) }}>
            <div>
              <p className="uppercase" style={{ fontSize: text(26), lineHeight: 1.21, color: 'var(--wk-muted)' }}>
                Volume ({units.unit})
              </p>
              <BigNumber value={volume} />
            </div>
            <div>
              <p className="uppercase" style={{ fontSize: text(26), lineHeight: 1.21, color: 'var(--wk-muted)' }}>
                Sets
              </p>
              <BigNumber value={`${report.session.workingSets}`} />
            </div>
          </div>
        </section>

        {/* Personal bests and goals moved by this workout */}
        {cardCount > 0 && (
          <div className="grid grid-cols-2" style={{ gap: fig(20), marginTop: fig(20) }}>
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
                {g.unit === 'kg' && (
                  <p className="wk-caption" style={{ marginTop: fig(12) }}>
                    {goalLabel(g)}
                  </p>
                )}
                <div style={{ marginTop: 'auto', paddingTop: fig(34) }}>
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

        <button
          type="button"
          onClick={handleDone}
          aria-label="Close: done"
          className="wk-button transition-transform active:scale-95"
          style={{ background: 'var(--wk-accent)', color: '#13181C', marginTop: fig(40) }}
        >
          Done
        </button>
      </div>
    </div>
  );
};
