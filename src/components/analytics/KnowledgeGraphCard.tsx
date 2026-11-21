import React, { useState, useMemo } from 'react';
import {
  BiometricLog,
  ExerciseDefinition,
  UserProfile,
  WorkoutSession,
} from '../../engine/types';
import {
  AthleteKnowledgeGraph,
  buildAthleteKnowledgeGraph,
  EXERCISE_SCIENCE_KNOWLEDGE_BASE,
  searchExerciseScienceKnowledgeBase,
} from '../../engine/knowledgeGraph';
import { triggerHaptic } from '../../utils/haptics';

// Internal engineering and design-governance entries are not shown in the athlete's science browser.
const INTERNAL_PRINCIPLE_IDS = [
  'sp-tensor-ai',
  'sp-ai-coach-single-entry-invariant',
  'sp-design-system-4-tier-typography',
  'sp-design-system-semantic-colors',
  'sp-design-system-touch-targets',
];

interface KnowledgeGraphCardProps {
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  exerciseCatalog: ExerciseDefinition[];
  profile: UserProfile;
  weeklyVolume: Record<string, number>;
  /** Pre-computed knowledge graph passed from parent to avoid duplicate rebuilds. */
  knowledgeGraph?: AthleteKnowledgeGraph;
  focusExerciseId?: string;
}

type InsightTabMode = 'overview' | 'joints' | 'science';

export const KnowledgeGraphCard: React.FC<KnowledgeGraphCardProps> = ({
  workouts,
  biometrics,
  exerciseCatalog,
  profile,
  weeklyVolume,
  knowledgeGraph,
  focusExerciseId,
}) => {
  const pkg = useMemo(
    () =>
      knowledgeGraph ??
      buildAthleteKnowledgeGraph(
        workouts,
        biometrics,
        exerciseCatalog,
        profile,
        weeklyVolume
      ),
    [knowledgeGraph, workouts, biometrics, exerciseCatalog, profile, weeklyVolume]
  );

  const [viewMode, setViewMode] = useState<InsightTabMode>('overview');
  const [scienceSearch, setScienceSearch] = useState('');

  return (
    <div className="flex flex-col gap-3">
      {/* Top Summary Card */}
      <div className="wk-card w-full text-left block">
        <div className="flex items-start justify-between gap-3">
          <h2 className="wk-h1 leading-tight">
            Recovery &amp; body insights
          </h2>
          <span className="wk-pill shrink-0">
            {pkg.recoveryEfficiencyScore > 0 ? `${pkg.recoveryEfficiencyScore}/100` : 'Ready'}
          </span>
        </div>

        <p className="wk-body mt-2 max-w-prose">
          How your sleep, joints, and weekly workouts work together
        </p>

        <div className="flex items-end justify-between gap-2 mt-6">
          <span className="wk-meta-title leading-tight">
            Full-stretch sets
          </span>
          <span className="wk-number shrink-0 leading-none">
            {pkg.lengthenedStimulusRatio}%
          </span>
        </div>

        <div className="wk-bar mt-3">
          <div style={{ width: `${Math.min(100, pkg.lengthenedStimulusRatio)}%` }} />
        </div>

        <div className="flex items-end justify-between gap-2 mt-5">
          <span className="wk-meta-title leading-tight">
            Lower back load
          </span>
          <span className="wk-number shrink-0 leading-none">
            {pkg.systemicAxialLoadScore}%
          </span>
        </div>

        <div className="wk-bar mt-3">
          <div style={{ width: `${Math.min(100, pkg.systemicAxialLoadScore)}%` }} />
        </div>

        {/* View Mode Switcher */}
        <div className="wk-segments grid-cols-3 mt-4">
          {(
            [
              { id: 'overview', label: 'Recovery' },
              { id: 'joints', label: 'Joints' },
              { id: 'science', label: 'Science & logic' },
            ] as const
          ).map((tab) => {
            const isSelected = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  triggerHaptic('light');
                  setViewMode(tab.id);
                }}
                className={`wk-tap wk-segment ${isSelected ? 'is-active' : ''}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: RECOVERY INSIGHTS */}
      {viewMode === 'overview' && (
        <>
          {pkg.insights.map((ins) => (
            <div key={ins.id} className="wk-card w-full text-left block">
              <div className="flex items-start justify-between gap-3">
                <h3 className="wk-h1 leading-tight">
                  {ins.title}
                </h3>
                <span className="wk-pill shrink-0">
                  {ins.impactMetric}
                </span>
              </div>

              <p className="wk-body mt-2 max-w-prose">
                {ins.narrative}
              </p>

              <p className="wk-body mt-3 max-w-prose" style={{ color: 'var(--color-text-primary)' }}>
                {ins.actionableStep}
              </p>
            </div>
          ))}

          {pkg.exerciseNotesHistory.length > 0 && (
            <div className="wk-card w-full text-left block">
              <div className="flex items-start justify-between gap-3">
                <h3 className="wk-h1 leading-tight">
                  Exercise notes timeline
                </h3>
                <span className="wk-pill shrink-0 tabular-nums">
                  {pkg.exerciseNotesHistory.length}{' '}
                  {pkg.exerciseNotesHistory.length === 1 ? 'note' : 'notes'}
                </span>
              </div>
              <ul className="mt-3 space-y-3">
                {(() => {
                  const sortedNotes = focusExerciseId
                    ? [
                        ...pkg.exerciseNotesHistory.filter((e) => e.exerciseId === focusExerciseId),
                        ...pkg.exerciseNotesHistory.filter((e) => e.exerciseId !== focusExerciseId),
                      ]
                    : pkg.exerciseNotesHistory;
                  return sortedNotes.slice(0, 8).map((entry) => {
                    const isFocused = Boolean(focusExerciseId && entry.exerciseId === focusExerciseId);
                    return (
                      <li
                        key={`${entry.workoutId}-${entry.exerciseId}`}
                        className="pt-2 border-t"
                        style={{
                          borderColor: isFocused ? 'var(--color-accent-primary)' : 'var(--color-border-subtle)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="wk-subhead truncate">
                            {entry.exerciseName}
                          </span>
                          <span className="wk-caption tabular-nums shrink-0">
                            {entry.date}
                          </span>
                        </div>
                        <p className="wk-body mt-1 max-w-prose">
                          {entry.note}
                        </p>
                      </li>
                    );
                  });
                })()}
              </ul>
            </div>
          )}
        </>
      )}

      {/* TAB 2: JOINT HEALTH */}
      {viewMode === 'joints' &&
        pkg.joints.map((j) => (
          <div key={j.joint} className="wk-card w-full text-left block">
            <div className="flex items-start justify-between gap-3">
              <h3 className="wk-h1 leading-tight">
                {j.joint}
              </h3>
              <span className="wk-pill shrink-0">
                {j.status}
              </span>
            </div>

            <p className="wk-body mt-2 max-w-prose">
              {j.biomechanicalAdvice}
            </p>

            <div className="flex items-end justify-between gap-2 mt-6">
              <span className="wk-meta-title leading-tight">
                Main exercises: {j.topContributors.join(', ') || 'Balanced'}
              </span>
              <span className="wk-number shrink-0 leading-none">
                {j.strainScore}%
              </span>
            </div>

            <div className="wk-bar mt-3">
              <div style={{ width: `${Math.min(100, j.strainScore)}%` }} />
            </div>
          </div>
        ))}

      {/* TAB 3: EXERCISE SCIENCE & LOGIC */}
      {viewMode === 'science' && (
        <>
          <div className="wk-card w-full text-left block">
            <div className="flex items-start justify-between gap-3">
              <h3 className="wk-h1 leading-tight">
                Science &amp; logic
              </h3>
              <span className="wk-pill shrink-0">Formulas</span>
            </div>
            <p className="wk-body mt-2 max-w-prose">
              Authoritative formulas, volume landmarks, and recovery rules driving Treise
            </p>
            <input
              type="text"
              value={scienceSearch}
              onChange={(e) => setScienceSearch(e.target.value)}
              placeholder="Search principles, formulas, citations..."
              className="wk-field w-full mt-3"
            />
          </div>

          {(scienceSearch.trim()
            ? searchExerciseScienceKnowledgeBase(scienceSearch, EXERCISE_SCIENCE_KNOWLEDGE_BASE.length)
            : (pkg.scientificKnowledgeBase || EXERCISE_SCIENCE_KNOWLEDGE_BASE)
          )
            .filter((p) => !INTERNAL_PRINCIPLE_IDS.includes(p.id))
            .map((p) => (
              <div key={p.id} className="wk-card w-full text-left block">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="wk-h1 leading-tight">
                    {p.title}
                  </h3>
                  <span className="wk-pill shrink-0">
                    {p.topic}
                  </span>
                </div>

                <p className="wk-body mt-2 max-w-prose">
                  {p.scientificRationale}
                </p>

                {p.formula && (
                  <p className="wk-caption mt-3 tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                    {p.formula}
                  </p>
                )}

                <p className="wk-body mt-2 max-w-prose">
                  {p.practicalApplication}
                </p>

                <p className="wk-caption mt-2">
                  {p.academicCitation}
                </p>
              </div>
            ))}
        </>
      )}
    </div>
  );
};
