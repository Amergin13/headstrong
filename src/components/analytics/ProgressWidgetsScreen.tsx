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

const fig = (px: number) => `calc(${px} * var(--f))`;

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
  <li style={{ borderTop: `${fig(2)} solid rgba(255,255,255,0.08)` }}>
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => {
        triggerHaptic('light');
        onToggle();
      }}
      className="w-full text-left flex items-center justify-between"
      style={{ gap: fig(24), padding: `${fig(26)} 0`, minHeight: 44 }}
    >
      <span className="min-w-0">
        <span className="flex items-center flex-wrap" style={{ gap: fig(14) }}>
          <span className="wk-label" style={{ lineHeight: 1.21 }}>
            {title}
          </span>
          {tag && <span className="wk-pill">{tag}</span>}
        </span>
        <span className="wk-caption block" style={{ marginTop: fig(8) }}>
          {description}
        </span>
      </span>
      <span
        className="rounded-full flex items-center justify-center shrink-0"
        style={{
          width: fig(52),
          height: fig(52),
          background: enabled ? 'var(--wk-accent)' : 'transparent',
          border: enabled ? 'none' : `${fig(3)} solid var(--wk-pill)`,
        }}
        aria-hidden="true"
      >
        {enabled && <Check style={{ width: fig(30), height: fig(30), color: 'var(--color-text-on-accent)' }} strokeWidth={3} />}
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
        <div className="flex items-center justify-between" style={{ gap: fig(20) }}>
          <h2 className="wk-label">Shown on Progress</h2>
          <span className="wk-pill">{activeWidgets.length} active</span>
        </div>
        <p className="wk-body" style={{ marginTop: fig(14) }}>
          Pin individual exercise progressions, arm and waist measurements, or overview cards. You can also ask Treise in chat.
        </p>
        {customPinned.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: fig(12), marginTop: fig(24) }}>
            {customPinned.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onToggle(id);
                }}
                aria-label={`Remove ${labelForProgressWidget(id, exerciseCatalog)} from Progress`}
                className="wk-pill wk-tap"
                style={{ background: 'rgba(0,241,159,0.16)', color: 'var(--wk-accent)' }}
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
              className="wk-segment"
              style={{
                background: selected ? 'var(--wk-raised)' : 'transparent',
                color: selected ? 'var(--color-text-primary)' : 'var(--wk-muted)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <>
          <section className="wk-card" aria-label="Overview cards">
            <h2 className="wk-label">Overview cards</h2>
            <ul className="flex flex-col" style={{ marginTop: fig(20) }}>
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
              <h2 className="wk-label">Whoop charts</h2>
              <p className="wk-caption" style={{ marginTop: fig(8) }}>
                Pin optional Whoop recovery, strain, HRV, resting HR and sleep trends onto Progress.
              </p>
              <ul className="flex flex-col" style={{ marginTop: fig(20) }}>
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
          <h2 className="wk-label">Exercise progressions</h2>
          <p className="wk-caption" style={{ marginTop: fig(8) }}>
            Track estimated max or reps over time for any specific lift.
          </p>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises (e.g. bench, curl, squat)"
            aria-label="Search exercises to add"
            className="wk-field"
            style={{ marginTop: fig(20), textAlign: 'left', fontSize: `max(12px, ${fig(28)})` }}
          />
          <ul className="flex flex-col" style={{ marginTop: fig(16) }}>
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
              <li style={{ padding: `${fig(26)} 0`, borderTop: `${fig(2)} solid rgba(255,255,255,0.08)` }}>
                <p className="wk-body">No exercises match "{query}".</p>
              </li>
            )}
          </ul>
        </section>
      )}

      {tab === 'measurements' && (
        <>
          <section className="wk-card" aria-label="Tape measurement widgets">
            <h2 className="wk-label">Tape measurements</h2>
            <p className="wk-caption" style={{ marginTop: fig(8) }}>
              Pin arms, waist, chest or any tape site straight onto Progress.
            </p>
            <ul className="flex flex-col" style={{ marginTop: fig(20) }}>
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
            <h2 className="wk-label">Body composition and volume</h2>
            <ul className="flex flex-col" style={{ marginTop: fig(20) }}>
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
          className="wk-button"
          style={{ background: 'var(--wk-raised)', color: 'var(--color-text-primary)' }}
        >
          Reset to default widgets
        </button>
      )}
    </>
  );
};
