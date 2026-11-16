import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { ExerciseDefinition, ProgressWidgetId, WorkoutSession } from '../../engine/types';
import {
  PROGRESS_CHART_WIDGETS,
  PROGRESS_WIDGETS,
  exerciseWidgetId,
  labelForProgressWidget,
  parseProgressWidgetId,
} from '../../services/progressWidgets';
import { triggerHaptic } from '../../utils/haptics';

type PickerTab = 'overview' | 'exercises' | 'measurements';

interface ProgressWidgetsScreenProps {
  activeWidgets: ProgressWidgetId[];
  exerciseCatalog: ExerciseDefinition[];
  workouts: WorkoutSession[];
  whoopConfigured?: boolean;
  isDefault: boolean;
  onToggle: (id: ProgressWidgetId) => void;
  onReset: () => void;
}

const WidgetRow: React.FC<{
  title: string;
  description: string;
  tag?: string;
  enabled: boolean;
  onToggle: () => void;
}> = ({ title, description, tag, enabled, onToggle }) => (
  <li style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => {
        triggerHaptic('light');
        onToggle();
      }}
      className="w-full text-left flex items-center justify-between gap-3 py-3"
      style={{ minHeight: 44 }}
    >
      <span className="min-w-0">
        <span className="flex items-center flex-wrap gap-2">
          <span className="wk-subhead leading-tight">
            {title}
          </span>
          {tag && <span className="wk-pill">{tag}</span>}
        </span>
        <span className="wk-caption block mt-1">
          {description}
        </span>
      </span>
      <span
        className="rounded-full flex items-center justify-center shrink-0 w-6 h-6"
        style={{
          background: enabled ? 'var(--wk-accent)' : 'transparent',
          border: enabled ? 'none' : '1.5px solid var(--color-border-strong)',
        }}
        aria-hidden="true"
      >
        {enabled && <Check className="w-3.5 h-3.5" style={{ color: 'var(--color-text-on-accent)' }} strokeWidth={3} />}
      </span>
    </button>
  </li>
);

/**
 * Customise which cards, exercise progressions and body measurements appear on Progress. Changes
 * save straight away and can be reset to defaults in one tap.
 */
export const ProgressWidgetsScreen: React.FC<ProgressWidgetsScreenProps> = ({
  activeWidgets,
  exerciseCatalog,
  workouts,
  whoopConfigured = false,
  isDefault,
  onToggle,
  onReset,
}) => {
  const [tab, setTab] = useState<PickerTab>('overview');
  const [query, setQuery] = useState('');
  const activeSet = new Set(activeWidgets);

  const customPinned = useMemo(
    () => activeWidgets.filter((id) => parseProgressWidgetId(id).kind !== 'core'),
    [activeWidgets]
  );

  // Logged exercises sorted most-recent/most-trained first, then remaining catalog exercises alphabetically.
  const sortedExercises = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of workouts) {
      if (!w.completed) continue;
      for (const ex of w.exercises) {
        if (ex.sets.some((s) => s.completed && !s.isWarmup && s.setType !== 'warmup')) {
          counts.set(ex.exerciseId, (counts.get(ex.exerciseId) ?? 0) + 1);
        }
      }
    }
    const q = query.trim().toLowerCase();
    return [...exerciseCatalog]
      .filter((ex) => {
        if (!q) return true;
        return (
          ex.name.toLowerCase().includes(q) ||
          ex.primaryMuscle.toLowerCase().includes(q) ||
          ex.pillar.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aPinned = activeSet.has(exerciseWidgetId(a.id)) ? 1 : 0;
        const bPinned = activeSet.has(exerciseWidgetId(b.id)) ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        const aCount = counts.get(a.id) ?? 0;
        const bCount = counts.get(b.id) ?? 0;
        if (aCount !== bCount) return bCount - aCount;
        return a.name.localeCompare(b.name);
      })
      .map((ex) => ({ ex, sessionsLogged: counts.get(ex.id) ?? 0 }));
  }, [exerciseCatalog, workouts, query, activeWidgets]);

  const tapeCharts = PROGRESS_CHART_WIDGETS.filter((c) => c.group === 'tape');
  const bodyAndTrainingCharts = PROGRESS_CHART_WIDGETS.filter((c) => c.group === 'body' || c.group === 'training');
  const whoopWidgets = whoopConfigured ? PROGRESS_CHART_WIDGETS.filter((c) => c.group === 'whoop') : [];
  const overviewWidgets = PROGRESS_WIDGETS.filter((w) => !w.requiresWhoop || whoopConfigured);

  return (
    <>
      <section className="wk-card" aria-label="Progress widgets summary">
        <div className="flex items-center justify-between gap-2">
          <h2 className="wk-title">Shown on Progress</h2>
          <span className="wk-pill shrink-0">{activeWidgets.length} active</span>
        </div>
        <p className="wk-body mt-2 max-w-prose">
          Pin individual exercise progressions, arm and waist measurements, or overview cards. You can also ask Treise in chat.
        </p>
        {customPinned.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {customPinned.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onToggle(id);
                }}
                aria-label={`Remove ${labelForProgressWidget(id, exerciseCatalog)} from Progress`}
                className="wk-btn-secondary wk-tap"
                style={{
                  borderColor: 'var(--color-text-primary)',
                }}
              >
                {labelForProgressWidget(id, exerciseCatalog)} ×
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="wk-segments grid-cols-3" role="tablist" aria-label="Widget categories">
        {(
          [
            ['overview', 'Overview'],
            ['exercises', 'Exercises'],
            ['measurements', 'Measures'],
          ] as const
        ).map(([id, label]) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                triggerHaptic('light');
                setTab(id);
              }}
              className={`wk-segment ${selected ? 'is-active' : ''}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <>
          <section className="wk-card" aria-label="Overview cards">
            <h2 className="wk-title">Overview cards</h2>
            <ul className="flex flex-col mt-3">
              {overviewWidgets.map((widget) => (
                <WidgetRow
                  key={widget.id}
                  title={widget.label}
                  description={widget.description}
                  tag={!widget.defaultEnabled ? 'Optional' : undefined}
                  enabled={activeSet.has(widget.id)}
                  onToggle={() => onToggle(widget.id)}
                />
              ))}
            </ul>
          </section>

          {whoopWidgets.length > 0 && (
            <section className="wk-card" aria-label="Whoop metric widgets">
              <h2 className="wk-title">Whoop charts</h2>
              <p className="wk-caption mt-1">
                Pin optional Whoop recovery, strain, HRV, resting HR and sleep trends onto Progress.
              </p>
              <ul className="flex flex-col mt-3">
                {whoopWidgets.map((chart) => (
                  <WidgetRow
                    key={chart.id}
                    title={chart.label}
                    description={chart.description}
                    tag="Optional"
                    enabled={activeSet.has(chart.id)}
                    onToggle={() => onToggle(chart.id)}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {tab === 'exercises' && (
        <section className="wk-card" aria-label="Exercise progression widgets">
          <h2 className="wk-title">Exercise progressions</h2>
          <p className="wk-caption mt-1">
            Track estimated max or reps over time for any specific lift.
          </p>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises (e.g. bench, curl, squat)"
            aria-label="Search exercises to add"
            className="wk-field mt-3 text-left text-base"
          />
          <ul className="flex flex-col mt-2">
            {sortedExercises.length > 0 ? (
              sortedExercises.map(({ ex, sessionsLogged }) => {
                const wid = exerciseWidgetId(ex.id);
                const desc =
                  sessionsLogged > 0
                    ? `${sessionsLogged} ${sessionsLogged === 1 ? 'session' : 'sessions'} logged`
                    : `${ex.primaryMuscle} progression`;
                return (
                  <WidgetRow
                    key={ex.id}
                    title={ex.name}
                    description={desc}
                    tag={sessionsLogged > 0 ? 'Logged' : undefined}
                    enabled={activeSet.has(wid)}
                    onToggle={() => onToggle(wid)}
                  />
                );
              })
            ) : (
              <li className="py-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                <p className="wk-body">No exercises match &quot;{query}&quot;.</p>
              </li>
            )}
          </ul>
        </section>
      )}

      {tab === 'measurements' && (
        <>
          <section className="wk-card" aria-label="Tape measurement widgets">
            <h2 className="wk-title">Tape measurements</h2>
            <p className="wk-caption mt-1">
              Pin arms, waist, chest or any tape site straight onto Progress.
            </p>
            <ul className="flex flex-col mt-3">
              {tapeCharts.map((chart) => (
                <WidgetRow
                  key={chart.id}
                  title={chart.label}
                  description={chart.description}
                  enabled={activeSet.has(chart.id)}
                  onToggle={() => onToggle(chart.id)}
                />
              ))}
            </ul>
          </section>

          <section className="wk-card" aria-label="Body composition and volume widgets">
            <h2 className="wk-title">Body composition and volume</h2>
            <ul className="flex flex-col mt-3">
              {bodyAndTrainingCharts.map((chart) => (
                <WidgetRow
                  key={chart.id}
                  title={chart.label}
                  description={chart.description}
                  enabled={activeSet.has(chart.id)}
                  onToggle={() => onToggle(chart.id)}
                />
              ))}
            </ul>
          </section>
        </>
      )}

      {!isDefault && (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onReset();
          }}
          className="wk-btn-secondary w-full"
        >
          Reset to default widgets
        </button>
      )}
    </>
  );
};
