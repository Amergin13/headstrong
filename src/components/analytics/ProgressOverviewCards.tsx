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

const fig = (px: number) => `calc(${px} * var(--f))`;
const text = (px: number) => `max(12px, ${fig(px)})`;

/** Process goal, strength level, chosen goal: the same order as the rings. */
const RING_COLOURS = ['#8FD3FF', '#00F19F', '#3FA7C9', '#B8FBE3', '#4FC3D9'];
const TRACK = 'rgba(255,255,255,0.12)';

/** One ring of equal segments. 'unknown' (not measured yet) is drawn as a thin line, not as a miss. */
const SegmentRing: React.FC<{ segments: RingSegment[]; radius: number; width: number; colour: string; delay?: number }> = ({ segments, radius, width, colour, delay = 0 }) => {
  const length = 2 * Math.PI * radius;
  const count = segments.length;
  // The round ends take up part of the gap, so it is sized from the stroke.
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
          // Not measured yet: a thin line, so it doesn't read as a miss.
          strokeWidth={state === 'unknown' ? width * 0.3 : width}
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

/**
 * One goal as a ring of segments, one per thing counted (sessions, reps, signs). A process goal has
 * a second ring inside for its long loop: one segment per recent week. The count is in the centre
 * and in the label, so the drawing itself is decorative for screen readers.
 */
const Ring: React.FC<{ ring: GoalRing; colour: string }> = ({ ring, colour }) => (
  <div className="relative" style={{ width: fig(206), height: fig(206) }}>
    <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
      <SegmentRing segments={ring.segments} radius={43} width={7} colour={colour} delay={200} />
      {ring.inner && <SegmentRing segments={ring.inner} radius={33.5} width={3.6} colour="#FFFFFF" delay={500} />}
    </svg>
    <span
      className="absolute inset-0 flex items-center justify-center font-bold tabular-numbers"
      style={{ fontSize: text(ring.value.length > 4 ? 40 : ring.inner ? 48 : 56), color: ring.empty ? 'var(--wk-muted)' : '#fff' }}
    >
      {ring.value}
    </span>
  </div>
);

/** The fact-based goals summary straight away, replaced by the on-device model's version when one is saved or written. */
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

/** The snapshot: the athlete's goals as rings (each opens its goal), then a short summary of where they stand. */
export const GoalsHero: React.FC<{ rings: GoalRing[]; summary: GoalsSummary; onOpenGoal: (id: string) => void; onChangeGoals: () => void }> = ({ rings, summary, onOpenGoal, onChangeGoals }) => {
  const summaryText = useGoalsSummaryText(summary);
  return (
    <section aria-labelledby="goals-title" style={{ paddingTop: fig(90) }}>
      {/* Three to a row; a fourth and fifth goal sit centred beneath. */}
      <ul className="flex flex-wrap justify-center" style={{ rowGap: fig(48) }}>
        {rings.map((ring, i) => (
          <li key={ring.id} className="min-w-0" style={{ width: '33.333%', padding: `0 ${fig(8)}` }}>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenGoal(ring.id);
              }}
              aria-label={`${ring.title}: ${ring.empty ? ring.detail : `${ring.value.replace('/', ' of ')} ${ring.caption}`}. Open this goal`}
              className="flex flex-col items-center w-full"
            >
              <Ring ring={ring} colour={RING_COLOURS[i % RING_COLOURS.length]} />
              <span className="wk-label text-center" style={{ marginTop: fig(26), lineHeight: 1.21 }} aria-hidden="true">
                {ring.title}
              </span>
              <span className="wk-caption text-center" style={{ marginTop: fig(8) }} aria-hidden="true">
                {ring.caption}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: fig(56), padding: `0 ${fig(28)}` }}>
        <div className="flex items-center justify-between" style={{ gap: fig(20) }}>
          <h2 id="goals-title" className="wk-label" style={{ lineHeight: 1.21 }}>
            Goals
          </h2>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onChangeGoals();
            }}
            aria-label="Change goals"
            className="wk-pill wk-tap"
          >
            Change
          </button>
        </div>
        <p className="wk-body" style={{ marginTop: fig(12) }} aria-live="polite">
          <span key={summaryText} className="wk-text-swap">
            {summaryText}
          </span>
        </p>
      </div>
    </section>
  );
};

/** A card on the overview that opens its detail screen. */
export const OverviewCard: React.FC<{
  title: string;
  /** What opening it shows, for screen readers: "all personal bests". */
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
    <div className="flex items-start justify-between" style={{ gap: fig(20) }}>
      <h2 className="wk-label" style={{ lineHeight: 1.21 }}>
        {title}
      </h2>
      <ChevronRight className="wk-chevron" strokeWidth={2} aria-hidden="true" />
    </div>
    {children}
  </button>
);

/** A row of up to three labelled figures, as on the workout summary. */
export const StatRow: React.FC<{ stats: { label: string; value: string; unit?: string; note?: string }[] }> = ({ stats }) => (
  <dl className="grid grid-cols-3" style={{ gap: fig(24), marginTop: fig(44) }}>
    {stats.map((s) => (
      <div key={s.label} className="min-w-0">
        <dt className="uppercase" style={{ fontSize: text(24), lineHeight: 1.21, color: 'var(--wk-muted)', overflowWrap: 'anywhere' }}>
          {s.label}
        </dt>
        <dd className="font-bold text-white tabular-numbers" style={{ fontSize: text(s.value.length > 6 ? 46 : 56), lineHeight: 1.05, marginTop: fig(10) }}>
          {s.value}
          {s.unit && (
            <span className="font-semibold" style={{ fontSize: text(22), color: 'var(--wk-muted)', marginLeft: fig(6) }}>
              {s.unit}
            </span>
          )}
        </dd>
        {s.note && (
          <dd className="wk-caption" style={{ marginTop: fig(8) }}>
            {s.note}
          </dd>
        )}
      </div>
    ))}
  </dl>
);

/** A small trend line with its latest point marked; no axes, the card states the figure. */
export const Sparkline: React.FC<{ points: ProgressPoint[]; label: string }> = ({ points, label }) => {
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
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: fig(300), height: fig(110) }} className="shrink-0">
      <line x1={lastX} x2={lastX} y1={4} y2={H - 4} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeDasharray="3 5" />
      <path d={d} fill="none" stroke="#00F19F" strokeOpacity={0.85} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={6} fill="#fff" />
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

/**
 * Each standard lift's level on one shape: further out is a higher level. The same scale as the
 * detail screen (each level 20 points, each sub-level 5); a lift not logged yet sits at the centre.
 */
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
    <svg viewBox={`0 16 ${size} ${size - 40}`} role="img" aria-label={`Strength levels. ${described}`} style={{ width: fig(560), height: fig(490), maxWidth: '100%' }} className="shrink-0">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={polygon(() => radius * f)} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      ))}
      {rated.map((_, i) => {
        const [px, py] = point(i, radius);
        return <line key={i} x1={centre} y1={centre} x2={px} y2={py} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />;
      })}
      <polygon points={polygon((i) => (score(rated[i]) / 100) * radius)} fill="rgba(0,241,159,0.2)" stroke="#00F19F" strokeWidth={2} strokeLinejoin="round" />
      {rated.map((l, i) => {
        const [px, py] = point(i, (score(l) / 100) * radius);
        const [lx, ly] = point(i, radius + 30);
        return (
          <g key={l.pillar}>
            {l.logged && <circle cx={px} cy={py} r={3.5} fill="#00F19F" />}
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.6)" style={{ fontSize: 19.5, fontWeight: 600 }}>
              {RADAR_SHORT_NAME[l.pillar] ?? l.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/** The header of a drill-in screen: back to the overview, and the screen's title. */
export const DetailHeader: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (
  <header className="relative flex items-center justify-center" style={{ paddingTop: fig(20), minHeight: 44 }}>
    <button
      type="button"
      onClick={() => {
        triggerHaptic('light');
        onBack();
      }}
      aria-label="Back to Progress"
      className="absolute left-0 flex items-center justify-center"
      style={{ width: 44, height: 44, marginLeft: -10, color: '#fff' }}
    >
      <ChevronLeft style={{ width: fig(44), height: fig(44) }} strokeWidth={2} aria-hidden="true" />
    </button>
    <h1 className="wk-page-title">{title}</h1>
  </header>
);
