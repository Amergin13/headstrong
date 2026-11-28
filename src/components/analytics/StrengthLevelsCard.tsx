import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { BiometricLog } from '../../engine/types';
import { calculateEngineVitalityScore } from '../../engine/vitality';
import { MovementStandardsReport, levelLabel } from '../../services/movementStandards';
import { formatSentenceCase } from '../../utils/typography';
import { triggerHaptic } from '../../utils/haptics';
import { StandardsRadar } from './ProgressOverviewCards';

interface StrengthLevelsCardProps {
  report: MovementStandardsReport;
  latestBiometrics: BiometricLog;
  onSelectExercise?: (exerciseId: string) => void;
  onAskCoach?: () => void;
}

/**
 * Strength levels (Progress → Strength standards). Each movement against published standards: Kilgore (ExRx)
 * for squat, deadlift, bench and press by sex, bodyweight and age; Poliquin's chin-up ratio for
 * pulling. Rows have no published standard, so no level. A movement never logged shows
 * "Not logged yet", never a level. Built by buildMovementStandards (services/movementStandards.ts).
 */
export const StrengthLevelsCard: React.FC<StrengthLevelsCardProps> = ({
  report,
  latestBiometrics,
  onSelectExercise,
  onAskCoach,
}) => {
  const [showMethodology, setShowMethodology] = useState(false);
  const rated = report.levels.filter((l) => l.source !== 'none');
  const loggedRated = rated.filter((l) => l.logged && l.step !== undefined);

  if (!report.levels.some((l) => l.logged)) {
    return (
      <section aria-label="Strength levels" className="wk-card w-full text-left block">
        <h2 className="wk-h1">
          Strength levels
        </h2>
        <p className="wk-body mt-2">
          Finish a workout to see your level on each movement, compared with lifters of your sex, bodyweight and age.
        </p>
      </section>
    );
  }

  const overall = loggedRated.length
    ? levelLabel(loggedRated.reduce((t, l) => t + (l.step ?? 0), 0) / loggedRated.length)
    : null;
  const cardio = calculateEngineVitalityScore(latestBiometrics);
  const rows = report.levels.find((l) => l.pillar === 'Horizontal Pull');

  return (
    <section aria-label="Strength levels" className="wk-card w-full text-left flex flex-col gap-4">
      {/* Header + Overall Standing Focal Anchor */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="wk-h1">
            Strength levels
          </h2>
          <p className="wk-caption mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Benchmarked for {report.tableLabel}
          </p>
        </div>
        {overall && (
          <span
            className="wk-pill shrink-0 tabular-nums"
            style={{
              background: 'var(--color-status-positive-soft)',
              color: 'var(--color-status-positive)',
              borderColor: 'var(--color-border-accent)',
            }}
          >
            {overall}
          </span>
        )}
      </div>

      {/* Elevated Inset Radar Telemetry Stage (single canonical StandardsRadar SVG) */}
      <div
        className="wk-raised"
        style={{
          background:
            'radial-gradient(circle at 50% 54%, rgb(var(--color-accent-primary-rgb) / 0.08) 0%, transparent 62%), var(--wk-raised)',
        }}
      >
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="wk-label">5-movement profile</span>
          <span className="wk-caption tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
            {loggedRated.length} of {rated.length} rated
          </span>
        </div>
        <div className="flex justify-center mt-2">
          <StandardsRadar report={report} variant="detail" />
        </div>
      </div>

      {/* Structured Movement Level Tiles */}
      <ul className="flex flex-col gap-2" aria-label="Level for each movement">
        {rated.map((l) => {
          const canDrillIn = Boolean(l.logged && l.bestFromExerciseId && onSelectExercise);
          const content = (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="wk-subhead"
                  style={{ color: l.logged ? 'var(--color-text-primary)' : 'var(--wk-muted)' }}
                >
                  {formatSentenceCase(l.name)}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={l.logged ? 'wk-subhead tabular-nums shrink-0' : 'wk-caption shrink-0'}
                    style={{
                      color: l.logged ? 'var(--color-text-primary)' : 'var(--wk-muted)',
                    }}
                  >
                    {l.logged ? `${l.tier} ${l.subDivision}` : 'Not logged yet'}
                  </span>
                  {canDrillIn && (
                    <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
                  )}
                </div>
              </div>

              {l.logged && (
                <>
                  <div
                    className="wk-bar mt-2"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={l.progress ?? 0}
                    aria-label={l.next ? `${l.name}: ${l.progress}% of the way to ${l.next}` : `${l.name}: top level`}
                  >
                    <div style={{ width: `${l.next ? l.progress ?? 0 : 100}%` }} />
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
                    <span
                      className="wk-caption"
                      style={{ color: l.next ? 'var(--color-text-secondary)' : 'var(--color-status-positive)' }}
                    >
                      {l.next ? `Next: ${l.next}` : 'Top level'}
                      {l.firstLevel && l.firstLoggedOn
                        ? ` · Started ${l.firstLevel}`
                        : ''}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {l.allometricScore && (
                        <span className="wk-caption tabular-nums">
                          Index {l.allometricScore.toFixed(1)}
                        </span>
                      )}
                      <span
                        className="wk-pill"
                        style={
                          l.tested
                            ? {
                                background: 'var(--color-status-positive-soft)',
                                color: 'var(--color-status-positive)',
                                borderColor: 'var(--color-border-accent)',
                              }
                            : undefined
                        }
                      >
                        {l.tested ? 'Tested' : 'Estimated'}
                      </span>
                    </div>
                  </div>

                  {l.caveat && (
                    <p className="wk-caption mt-2" style={{ color: 'var(--wk-muted)' }}>
                      {l.caveat}
                    </p>
                  )}
                </>
              )}
            </>
          );
          return (
            <li key={l.pillar} className="wk-raised">
              {canDrillIn ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onSelectExercise?.(l.bestFromExerciseId!);
                  }}
                  aria-label={`Open details for ${formatSentenceCase(l.bestFrom ?? l.name)}`}
                  className="w-full min-h-[44px] text-left block"
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>

      {/* Dedicated Engine / Cardio & Recovery Telemetry Tile */}
      <div className="wk-raised flex flex-col gap-2">
        <span className="wk-label">Engine · Cardio &amp; recovery</span>
        <div className="flex items-baseline justify-between gap-3">
          <span className="wk-caption" style={{ color: 'var(--color-text-secondary)' }}>
            {cardio > 0 && (latestBiometrics?.restingHr || 0) > 0
              ? `${latestBiometrics.restingHr} bpm resting heart rate`
              : 'Connect a wearable to score engine vitality'}
          </span>
          <span className="wk-number shrink-0">
            {cardio > 0 ? `${cardio}/100` : '—'}
          </span>
        </div>
        <div
          className="wk-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={cardio}
          aria-label="Cardio and recovery score"
        >
          <div style={{ width: `${Math.max(0, Math.min(100, cardio))}%` }} />
        </div>
      </div>

      {/* Progressive Disclosure: Standards & Methodology */}
      <div className="border-t pt-2" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <button
          type="button"
          aria-expanded={showMethodology}
          onClick={() => {
            triggerHaptic('light');
            setShowMethodology((v) => !v);
          }}
          className="w-full min-h-[44px] flex items-center justify-between gap-2 text-left"
        >
          <span className="wk-meta-title" style={{ color: 'var(--color-text-secondary)' }}>
            How standards &amp; allometric scaling work
          </span>
          <ChevronDown
            className="w-4 h-4 shrink-0 transition-transform"
            style={{
              color: 'var(--color-text-muted)',
              transform: showMethodology ? 'rotate(180deg)' : undefined,
            }}
            aria-hidden="true"
          />
        </button>

        {showMethodology && (
          <div className="wk-raised mt-2 flex flex-col gap-2">
            <p className="wk-caption max-w-prose" style={{ color: 'var(--color-text-secondary)' }}>
              &quot;Tested&quot; means your best came from the standard lift (back squat, deadlift, bench press, standing press or chin-up) for 5 reps or fewer.
              Other lifts and higher reps give an estimate.
            </p>
            <p className="wk-caption max-w-prose" style={{ color: 'var(--color-text-secondary)' }}>
              Standards use Dr Lon Kilgore&apos;s weight-class tables (ExRx) with allometric scaling index (size-neutral across bodyweights) and Charles Poliquin&apos;s chin-up ratios. Strength tiers benchmark relative strength—your weekly progression pace is driven purely by your logged sets, not your tier label.
            </p>
            {rows?.logged && (
              <p className="wk-caption max-w-prose">
                Rows have no published strength standard, so they have no level.
              </p>
            )}
          </div>
        )}
      </div>

      {onAskCoach && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onAskCoach();
          }}
          className="wk-btn-secondary w-full min-h-[44px] inline-flex items-center justify-center gap-2"
          style={{ borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.35)' }}
        >
          <Sparkles
            className="w-4 h-4 shrink-0"
            style={{ color: 'var(--color-coach-accent)' }}
            strokeWidth={2.2}
            aria-hidden="true"
          />
          <span>Ask Treise about your standards</span>
        </button>
      )}
    </section>
  );
};
