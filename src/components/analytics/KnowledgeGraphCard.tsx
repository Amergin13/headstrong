import React, { useState, useMemo } from 'react';
import {
  BiometricLog,
  ExerciseDefinition,
  UserProfile,
  WorkoutSession,
} from '../../engine/types';
import {
  buildAthleteKnowledgeGraph,
  EXERCISE_SCIENCE_KNOWLEDGE_BASE,
} from '../../engine/knowledgeGraph';
import { triggerHaptic } from '../../utils/haptics';

// Internal engineering and design-governance entries are not shown in the athlete's science browser.
const INTERNAL_PRINCIPLE_IDS = [
  'sp-tensor-ai',
  'sp-tensor-ai-acceleration',
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
}

type InsightTabMode = 'overview' | 'joints' | 'science';

const fig = (px: number) => `calc(${px} * var(--f))`;

export const KnowledgeGraphCard: React.FC<KnowledgeGraphCardProps> = ({
  workouts,
  biometrics,
  exerciseCatalog,
  profile,
  weeklyVolume,
}) => {
  const pkg = useMemo(
    () =>
      buildAthleteKnowledgeGraph(
        workouts,
        biometrics,
        exerciseCatalog,
        profile,
        weeklyVolume
      ),
    [workouts, biometrics, exerciseCatalog, profile, weeklyVolume]
  );

  const [viewMode, setViewMode] = useState<InsightTabMode>('overview');
  const [scienceSearch, setScienceSearch] = useState('');

  return (
    <div className="flex flex-col" style={{ gap: fig(22) }}>
      {/* Top Summary Card */}
      <div className="wk-card w-full text-left block">
        <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
          <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
            Recovery &amp; Body Insights
          </h2>
          <span className="wk-pill shrink-0">
            {pkg.recoveryEfficiencyScore > 0 ? `${pkg.recoveryEfficiencyScore}/100` : 'READY'}
          </span>
        </div>

        <p
          style={{
            fontSize: fig(28),
            lineHeight: 1.21,
            color: 'var(--wk-muted)',
            marginTop: fig(20),
          }}
        >
          How your sleep, joints, and weekly workouts work together
        </p>

        <div
          className="flex items-end justify-between"
          style={{ marginTop: fig(60), gap: fig(20) }}
        >
          <span className="wk-label" style={{ lineHeight: 1.21 }}>
            FULL-STRETCH SETS
          </span>
          <span
            className="font-bold text-white shrink-0"
            style={{ fontSize: fig(40), lineHeight: 1 }}
          >
            {pkg.lengthenedStimulusRatio}%
          </span>
        </div>

        <div className="wk-bar" style={{ marginTop: fig(30) }}>
          <div style={{ width: `${Math.min(100, pkg.lengthenedStimulusRatio)}%` }} />
        </div>

        <div
          className="flex items-end justify-between"
          style={{ marginTop: fig(40), gap: fig(20) }}
        >
          <span className="wk-label" style={{ lineHeight: 1.21 }}>
            LOWER BACK LOAD
          </span>
          <span
            className="font-bold text-white shrink-0"
            style={{ fontSize: fig(40), lineHeight: 1 }}
          >
            {pkg.systemicAxialLoadScore}%
          </span>
        </div>

        <div className="wk-bar" style={{ marginTop: fig(30) }}>
          <div style={{ width: `${Math.min(100, pkg.systemicAxialLoadScore)}%` }} />
        </div>

        {/* View Mode Switcher */}
        <div
          className="grid grid-cols-3 items-center"
          style={{
            marginTop: fig(30),
            height: fig(84),
            padding: fig(8),
            borderRadius: fig(22),
            background: 'var(--wk-raised)',
          }}
        >
          {(
            [
              { id: 'overview', label: 'Recovery' },
              { id: 'joints', label: 'Joints' },
              { id: 'science', label: 'Science & Logic' },
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
                className="h-full flex items-center justify-center font-bold uppercase transition-colors"
                style={{
                  borderRadius: fig(16),
                  fontSize: fig(24),
                  letterSpacing: '0.02em',
                  background: isSelected ? 'var(--wk-pill)' : 'transparent',
                  color: isSelected ? '#fff' : 'var(--wk-muted)',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: RECOVERY INSIGHTS */}
      {viewMode === 'overview' &&
        pkg.insights.map((ins) => (
          <div key={ins.id} className="wk-card w-full text-left block">
            <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
              <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
                {ins.title}
              </h3>
              <span className="wk-pill shrink-0">
                {ins.impactMetric}
              </span>
            </div>

            <p
              style={{
                fontSize: fig(28),
                lineHeight: 1.21,
                color: 'var(--wk-muted)',
                marginTop: fig(20),
              }}
            >
              {ins.narrative}
            </p>

            <p className="wk-body" style={{ marginTop: fig(24) }}>
              {ins.actionableStep}
            </p>
          </div>
        ))}

      {/* TAB 2: JOINT HEALTH */}
      {viewMode === 'joints' &&
        pkg.joints.map((j) => (
          <div key={j.joint} className="wk-card w-full text-left block">
            <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
              <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
                {j.joint}
              </h3>
              <span className="wk-pill shrink-0">
                {j.status}
              </span>
            </div>

            <p
              style={{
                fontSize: fig(28),
                lineHeight: 1.21,
                color: 'var(--wk-muted)',
                marginTop: fig(20),
              }}
            >
              {j.biomechanicalAdvice}
            </p>

            <div
              className="flex items-end justify-between"
              style={{ marginTop: fig(60), gap: fig(20) }}
            >
              <span className="wk-label" style={{ lineHeight: 1.21 }}>
                MAIN EXERCISES: {j.topContributors.join(', ') || 'BALANCED'}
              </span>
              <span
                className="font-bold text-white shrink-0"
                style={{ fontSize: fig(40), lineHeight: 1 }}
              >
                {j.strainScore}%
              </span>
            </div>

            <div className="wk-bar" style={{ marginTop: fig(30) }}>
              <div style={{ width: `${Math.min(100, j.strainScore)}%` }} />
            </div>
          </div>
        ))}

      {/* TAB 3: EXERCISE SCIENCE & LOGIC */}
      {viewMode === 'science' && (
        <>
          <div className="wk-card w-full text-left block">
            <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
              <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
                Science &amp; Logic
              </h3>
              <span className="wk-pill shrink-0">FORMULAS</span>
            </div>
            <p
              style={{
                fontSize: fig(28),
                lineHeight: 1.21,
                color: 'var(--wk-muted)',
                marginTop: fig(20),
              }}
            >
              Authoritative formulas, volume landmarks, and recovery rules driving Treise
            </p>
            <input
              type="text"
              value={scienceSearch}
              onChange={(e) => setScienceSearch(e.target.value)}
              placeholder="Search principles, formulas, citations..."
              className="wk-field w-full"
              style={{ marginTop: fig(28) }}
            />
          </div>

          {(pkg.scientificKnowledgeBase || EXERCISE_SCIENCE_KNOWLEDGE_BASE)
            .filter((p) => !INTERNAL_PRINCIPLE_IDS.includes(p.id))
            .filter((p) => {
              if (!scienceSearch.trim()) return true;
              const q = scienceSearch.toLowerCase();
              return (
                p.title.toLowerCase().includes(q) ||
                p.topic.toLowerCase().includes(q) ||
                p.scientificRationale.toLowerCase().includes(q) ||
                p.keywords.some((k) => k.includes(q))
              );
            })
            .map((p) => (
              <div key={p.id} className="wk-card w-full text-left block">
                <div className="flex items-start justify-between" style={{ gap: fig(24) }}>
                  <h3 className="wk-h1" style={{ lineHeight: 1.21 }}>
                    {p.title}
                  </h3>
                  <span className="wk-pill shrink-0">
                    {p.topic}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: fig(28),
                    lineHeight: 1.21,
                    color: 'var(--wk-muted)',
                    marginTop: fig(20),
                  }}
                >
                  {p.scientificRationale}
                </p>

                {p.formula && (
                  <p className="wk-label" style={{ marginTop: fig(24) }}>
                    {p.formula}
                  </p>
                )}

                <p className="wk-body" style={{ marginTop: fig(16) }}>
                  {p.practicalApplication}
                </p>

                <p className="wk-caption" style={{ marginTop: fig(16) }}>
                  {p.academicCitation}
                </p>
              </div>
            ))}
        </>
      )}
    </div>
  );
};
