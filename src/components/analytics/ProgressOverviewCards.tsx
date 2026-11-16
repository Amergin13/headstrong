import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MovementStandardsReport } from '../../services/movementStandards';
import {
  GoalRing,
  GoalsSummary,
  RingSegment,
  cacheGoalsSummary,
  generateGoalsSummary,
  getCachedGoalsSummary,
} from '../../services/progressOverview';
import { ProgressPoint } from '../../services/progressSeries';
import { triggerHaptic } from '../../utils/haptics';

/**
 * Semantic ring colour rule:
 * - Achieved goal (every segment 'on'): Positive Mint (`--color-status-positive`)
 * - In-flight or baseline goal: Crisp White (`--color-text-primary`) — never different colours per goal type
 */
function goalRingColour(ring: GoalRing): string {
  if (!ring.empty && ring.segments.length > 0 && ring.segments.every((s) => s === 'on')) {
    return 'var(--color-status-positive)';
  }
  return 'var(--color-text-primary)';
}

const TRACK = 'var(--color-border-track)';

const SegmentRing: React.FC<{ segments: RingSegment[]; radius: number; width: number; colour: string; delay?: number }> = ({ segments, radius, width, colour, delay = 0 }) => {
  const length = 2 * Math.PI * radius;
  const count = segments.length;
  const gapDeg = count === 1 ? 0 : Math.min(360 / count / 2, (width / radius) * 57.3 + (count > 12 ? 3 : 8));
  const sweep = ((360 / count - gapDeg) / 360) * length;
  return (
    <>
      {segments.map((state, i) => (
        <circle
          key={i}
          cx={50}
          cy={50}
          r={radius}
          fill="none"
          stroke={state === 'on' ? colour : TRACK}
          strokeWidth={state === 'unknown' ? Math.max(width * 0.32, 1.05) : width}
          strokeLinecap="round"
          strokeDasharray={`${sweep} ${length - sweep}`}
          strokeDashoffset={-((i * 360) / count + gapDeg / 2) * (length / 360)}
          className={state === 'on' ? 'wk-ring-pop' : undefined}
          style={state === 'on' ? { animationDelay: `${delay + i * (count > 8 ? 45 : 110)}ms` } : undefined}
        />
      ))}
    </>
  );
};

const Ring: React.FC<{ ring: GoalRing; colour: string }> = ({ ring, colour }) => {
  const threeRing = Boolean(ring.innermost?.length);
  return (
    <div className="relative" style={{ width: 104, height: 104 }}>
      <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <SegmentRing
          segments={ring.segments}
          radius={threeRing ? 44 : 43}
          width={threeRing ? 6 : 7}
          colour={colour}
          delay={200}
        />
        {ring.inner && (
          <SegmentRing
            segments={ring.inner}
            radius={threeRing ? 35.5 : 33.5}
            width={threeRing ? 3.5 : 3.6}
            colour="var(--color-text-primary)"
            delay={450}
          />
        )}
        {ring.innermost && (
          <SegmentRing
            segments={ring.innermost}
            radius={28.5}
            width={2.6}
            colour={colour}
            delay={650}
          />
        )}
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center tabular-numbers px-3 text-center ${
          ring.value.length > 4 || threeRing || ring.inner ? 'font-medium' : 'font-semibold'
        }`}
        style={{
          fontSize: ring.value.length > 4 || threeRing ? 12 : ring.inner ? 16 : 20,
          lineHeight: 1.1,
          color: ring.empty ? 'var(--wk-muted)' : 'var(--color-text-primary)',
        }}
      >
        {ring.value}
      </span>
    </div>
  );
};

function useGoalsSummaryText(summary: GoalsSummary): string {
  const key = summary.facts.join('|');
  const [written, setWritten] = useState<string | null>(() => getCachedGoalsSummary(summary));
  useEffect(() => {
    const cached = getCachedGoalsSummary(summary);
    setWritten(cached);
    if (cached) return;
    let cancelled = false;
    generateGoalsSummary(summary)
      .then((answer) => {
        if (!answer) return;
        cacheGoalsSummary(summary, answer);
        if (!cancelled) setWritten(answer);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return written ?? summary.fallback;
}

export const GoalsHero: React.FC<{ rings: GoalRing[]; summary: GoalsSummary; onOpenGoal: (id: string) => void }> = ({ rings, summary, onOpenGoal }) => {
  const summaryText = useGoalsSummaryText(summary);
  return (
    <section aria-labelledby="goals-title" className="pt-8">
      <ul className="flex flex-wrap justify-center gap-y-6">
        {rings.map((ring) => (
          <li key={ring.id} className="min-w-0 px-1" style={{ width: '33.333%' }}>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenGoal(ring.id);
              }}
              aria-label={`${ring.title}: ${ring.empty ? ring.detail : `${ring.value.replace('/', ' of ')} ${ring.caption}`}. Open this goal`}
              className="flex flex-col items-center w-full"
            >
              <Ring ring={ring} colour={goalRingColour(ring)} />
              <span className="wk-meta-title text-center mt-3" aria-hidden="true">
                {ring.title}
              </span>
              <span className="wk-caption text-center mt-1" aria-hidden="true">
                {ring.caption}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6 px-3">
        <h2 id="goals-title" className="wk-title">
          Goals
        </h2>
        <p className="wk-body mt-2 max-w-prose" aria-live="polite">
          <span key={summaryText} className="wk-text-swap">
            {summaryText}
          </span>
        </p>
      </div>
    </section>
  );
};

export const OverviewCard: React.FC<{
  title: string;
  opens: string;
  onOpen: () => void;
  children?: React.ReactNode;
}> = ({ title, opens, onOpen, children }) => (
  <button
    type="button"
    onClick={() => {
      triggerHaptic('light');
      onOpen();
    }}
    aria-label={`${title}. Open ${opens}`}
    className="wk-card w-full text-left block"
  >
    <div className="flex items-start justify-between gap-2">
      <h2 className="wk-title">
        {title}
      </h2>
      <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
    </div>
    {children}
  </button>
);

export const StatRow: React.FC<{
  stats: { label: string; value: string; unit?: string; note?: string }[];
  sentenceLabels?: boolean;
}> = ({ stats, sentenceLabels = false }) => (
  <dl className="grid grid-cols-3 gap-3 mt-4">
    {stats.map((s) => (
      <div key={s.label} className="min-w-0 flex flex-col justify-between">
        <dt className={sentenceLabels ? 'wk-meta-title' : 'wk-label'} style={{ overflowWrap: 'anywhere' }}>
          {s.label}
        </dt>
        <dd className="wk-number mt-1" style={s.value.length > 6 ? { fontSize: 16, lineHeight: '24px' } : undefined}>
          {s.value}
          {s.unit && (
            <span className="wk-caption ml-1">
              {s.unit}
            </span>
          )}
        </dd>
        {s.note && (
          <dd className="wk-caption mt-1">
            {s.note}
          </dd>
        )}
      </div>
    ))}
  </dl>
);

export const Sparkline: React.FC<{
  points: ProgressPoint[];
  label: string;
  positiveProgress?: boolean;
  tone?: 'progress' | 'telemetry';
}> = ({
  points,
  label,
  positiveProgress = false,
  tone = 'progress',
}) => {
  if (points.length < 2) return null;
  const W = 300;
  const H = 110;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => 6 + (i / (points.length - 1)) * (W - 18);
  const y = (v: number) => H - 12 - ((v - min) / span) * (H - 24);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${(max === min ? H / 2 : y(p.value)).toFixed(1)}`).join(' ');
  const lastX = x(points.length - 1);
  const lastY = max === min ? H / 2 : y(values[values.length - 1]);
  const strokeColor = positiveProgress
    ? 'var(--color-accent-primary)'
    : tone === 'telemetry'
    ? 'var(--color-data-telemetry)'
    : 'var(--color-text-primary)';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: 136, height: 48 }} className="shrink-0">
      <line x1={lastX} x2={lastX} y1={4} y2={H - 4} stroke="var(--color-border-strong)" strokeWidth={1.5} strokeDasharray="3 5" />
      <path d={d} fill="none" stroke={strokeColor} strokeOpacity={0.85} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={6} fill="var(--color-text-primary)" />
    </svg>
  );
};

const RADAR_SHORT_NAME: Record<string, string> = {
  Squat: 'Squat',
  Hinge: 'Deadlift',
  'Horizontal Push': 'Bench',
  'Vertical Push': 'Press',
  'Vertical Pull': 'Chin-up',
};

export const StandardsRadar: React.FC<{ report: MovementStandardsReport }> = ({ report }) => {
  const rated = report.levels.filter((l) => l.source !== 'none');
  if (rated.length < 3) return null;
  const size = 320;
  const centre = size / 2;
  const radius = 96;
  const score = (l: (typeof rated)[number]) => (l.logged && l.step !== undefined ? Math.min(100, l.step * 5 + ((l.progress ?? 0) / 100) * 5) : 0);
  const point = (i: number, r: number) => {
    const angle = -Math.PI / 2 + (i / rated.length) * Math.PI * 2;
    return [centre + Math.cos(angle) * r, centre + Math.sin(angle) * r] as const;
  };
  const polygon = (r: (i: number) => number) => rated.map((_, i) => point(i, r(i)).map((n) => n.toFixed(1)).join(',')).join(' ');
  const described = rated
    .map((l) => `${RADAR_SHORT_NAME[l.pillar] ?? l.name}: ${l.logged && l.tier ? `${l.tier} ${l.subDivision}` : 'not logged yet'}`)
    .join('. ');
  return (
    <svg viewBox={`0 16 ${size} ${size - 40}`} role="img" aria-label={`Strength levels. ${described}`} style={{ width: 248, height: 220, maxWidth: '100%' }} className="shrink-0">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={polygon(() => radius * f)} fill="none" stroke="var(--color-border-track)" strokeWidth={1} />
      ))}
      {rated.map((_, i) => {
        const [px, py] = point(i, radius);
        return <line key={i} x1={centre} y1={centre} x2={px} y2={py} stroke="var(--color-border-subtle)" strokeWidth={1} />;
      })}
      <polygon points={polygon((i) => (score(rated[i]) / 100) * radius)} fill="rgb(var(--color-accent-primary-rgb) / 0.2)" stroke="var(--color-accent-primary)" strokeWidth={2} strokeLinejoin="round" />
      {rated.map((l, i) => {
        const [px, py] = point(i, (score(l) / 100) * radius);
        const [lx, ly] = point(i, radius + 30);
        return (
          <g key={l.pillar}>
            {l.logged && <circle cx={px} cy={py} r={3.5} fill="var(--color-accent-primary)" />}
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill="var(--color-text-secondary)" style={{ fontSize: 12, fontWeight: 500 }}>
              {RADAR_SHORT_NAME[l.pillar] ?? l.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export const DetailHeader: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (
  <header className="relative flex items-center justify-center pt-2 min-h-[44px]">
    <button
      type="button"
      onClick={() => {
        triggerHaptic('light');
        onBack();
      }}
      aria-label="Back to Progress"
      className="absolute left-0 flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] -ml-2"
      style={{ color: 'var(--color-text-primary)' }}
    >
      <ChevronLeft className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
    </button>
    <h1 className="wk-nav-title">{title}</h1>
  </header>
);
