import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Minus } from 'lucide-react';
import { MovementStandardsReport } from '../../services/movementStandards';
import {
  GoalRing,
  GoalsSummary,
  RingSegment,
  SingleGoalSummary,
  buildGoalCardSummaries,
  cacheGoalsSummary,
  generateGoalsSummary,
  getCachedGoalsSummary,
} from '../../services/progressOverview';
import { AthleteGoal } from '../../services/athleteGoals';
import { ProgressPoint } from '../../services/progressSeries';
import { CoachSummaryText } from '../common/CoachSummaryText';
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

const Ring: React.FC<{ ring: GoalRing; colour: string; size?: number }> = ({ ring, colour, size = 192 }) => {
  const threeRing = Boolean(ring.innermost?.length);
  const compactValue = ring.value.length > 5;
  const fontSize = compactValue ? 20 : 32;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <SegmentRing
          segments={ring.segments}
          radius={threeRing ? 44 : 43}
          width={threeRing ? 6 : 7}
          colour={colour}
          delay={160}
        />
        {ring.inner && (
          <SegmentRing
            segments={ring.inner}
            radius={threeRing ? 35.5 : 33.5}
            width={threeRing ? 3.8 : 4}
            colour="var(--color-text-primary)"
            delay={360}
          />
        )}
        {ring.innermost && (
          <SegmentRing
            segments={ring.innermost}
            radius={28}
            width={2.8}
            colour={colour}
            delay={520}
          />
        )}
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center tabular-numbers px-6 text-center font-semibold"
        style={{
          fontSize,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: ring.empty ? 'var(--wk-muted)' : 'var(--color-text-primary)',
        }}
      >
        {ring.value}
      </span>
    </div>
  );
};

function useGoalSummaryText(summary: GoalsSummary, active: boolean): string {
  const key = `${summary.systemPrompt ?? ''}|${summary.facts.join('|')}`;
  const [written, setWritten] = useState<string | null>(() => getCachedGoalsSummary(summary));
  useEffect(() => {
    const cached = getCachedGoalsSummary(summary);
    setWritten(cached);
    if (cached || !active || summary.sparse) return;
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
  }, [key, active]);
  return written ?? summary.fallback;
}

const GoalSlideCard: React.FC<{
  ring: GoalRing;
  cardSummary: SingleGoalSummary;
  active: boolean;
  index: number;
  total: number;
  onOpenGoal: (id: string) => void;
}> = ({ ring, cardSummary, active, index, total, onOpenGoal }) => {
  const summaryText = useGoalSummaryText(cardSummary, active);
  const colour = goalRingColour(ring);
  const achieved = colour === 'var(--color-status-positive)';
  return (
    <article
      role="group"
      aria-roledescription="slide"
      aria-label={`Goal ${index + 1} of ${total}: ${ring.title}`}
      className="shrink-0 w-full snap-center flex flex-col justify-between py-2"
    >
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onOpenGoal(ring.id);
        }}
        aria-label={`${ring.title}: ${ring.empty ? ring.detail : `${ring.value.replace('/', ' of ')} ${ring.caption}`}. Open this goal`}
        className="w-full text-left flex flex-col items-center focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 w-full min-h-[44px]">
          <div className="min-w-0">
            <span className="wk-label block" style={{ color: 'var(--wk-muted)' }}>
              {cardSummary.categoryLabel}
            </span>
            <span className="wk-title block mt-1">
              {ring.title}
            </span>
          </div>
          <ChevronRight className="wk-chevron shrink-0 mt-1" strokeWidth={2} aria-hidden="true" />
        </div>

        <div className="pt-4 pb-2 flex flex-col items-center w-full">
          <Ring ring={ring} colour={colour} size={192} />
          <span className="wk-meta-title text-center mt-3" aria-hidden="true">
            {ring.caption}
          </span>

          {cardSummary.loopLabels && cardSummary.loopLabels.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3 mt-2 wk-caption" aria-hidden="true">
              {cardSummary.loopLabels.map((label, i) => (
                <span key={label} className="inline-flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      background:
                        i === 0 ? colour : i === 1 ? 'var(--color-text-secondary)' : 'var(--color-border-strong)',
                    }}
                  />
                  {label}
                </span>
              ))}
            </div>
          )}

          {cardSummary.signStatuses && cardSummary.signStatuses.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3 mt-2 wk-caption" aria-hidden="true">
              {cardSummary.signStatuses.map((sign) => (
                <span key={sign.label} className="inline-flex items-center gap-1">
                  <span
                    className="w-4 h-4 rounded-full inline-flex items-center justify-center"
                    style={{
                      background:
                        sign.state === 'on'
                          ? achieved
                            ? 'var(--color-status-positive)'
                            : 'var(--color-text-primary)'
                          : sign.state === 'off'
                          ? 'var(--color-bg-surface-control)'
                          : 'transparent',
                      border:
                        sign.state === 'unknown'
                          ? '1px solid var(--color-border-strong)'
                          : sign.state === 'off'
                          ? '1px solid var(--color-border-subtle)'
                          : '1px solid transparent',
                    }}
                  >
                    {sign.state === 'on' ? (
                      <Check className="w-3 h-3" style={{ color: 'var(--color-text-on-accent)' }} strokeWidth={3} />
                    ) : sign.state === 'off' ? (
                      <Minus className="w-3 h-3" style={{ color: 'var(--color-text-secondary)' }} strokeWidth={3} />
                    ) : null}
                  </span>
                  <span style={{ color: sign.state === 'unknown' ? 'var(--color-text-muted)' : 'var(--color-text-secondary)' }}>
                    {sign.label}
                  </span>
                </span>
              ))}
            </div>
          )}

          {cardSummary.visContext && (
            <span className="wk-caption text-center mt-2" aria-hidden="true">
              {cardSummary.visContext}
            </span>
          )}
        </div>
      </button>

      <div className="mt-5 pt-4 border-t text-left" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <span className="wk-label block mb-2" style={{ color: 'var(--wk-muted)' }}>
          Goal takeaway
        </span>
        <CoachSummaryText
          text={summaryText}
          swapKey={`${ring.id}:${summaryText}`}
          splitBy="sentences"
        />
      </div>
    </article>
  );
};

export const GoalsHero: React.FC<{
  rings: GoalRing[];
  summary: GoalsSummary;
  goals?: AthleteGoal[];
  cardSummaries?: SingleGoalSummary[];
  onOpenGoal: (id: string) => void;
}> = ({ rings, goals, cardSummaries, onOpenGoal }) => {
  const slides = useMemo(
    () => cardSummaries ?? buildGoalCardSummaries(goals ?? [], rings),
    [cardSummaries, goals, rings]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeIndex >= rings.length) {
      setActiveIndex(Math.max(0, rings.length - 1));
    }
  }, [activeIndex, rings.length]);

  const goTo = (index: number) => {
    const clamped = Math.max(0, Math.min(rings.length - 1, index));
    const track = trackRef.current;
    if (track) {
      const child = track.children[clamped] as HTMLElement | undefined;
      if (child) track.scrollTo({ left: child.offsetLeft, behavior: 'smooth' });
    }
    setActiveIndex(clamped);
    triggerHaptic('light');
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track || track.children.length === 0) return;
    let nearest = 0;
    let bestDist = Infinity;
    for (let i = 0; i < track.children.length; i++) {
      const child = track.children[i] as HTMLElement;
      const dist = Math.abs(child.offsetLeft - track.scrollLeft);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = i;
      }
    }
    if (nearest !== activeIndex) setActiveIndex(nearest);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' && activeIndex < rings.length - 1) {
      e.preventDefault();
      goTo(activeIndex + 1);
    } else if (e.key === 'ArrowLeft' && activeIndex > 0) {
      e.preventDefault();
      goTo(activeIndex - 1);
    }
  };

  if (rings.length === 0) return null;

  return (
    <section
      aria-labelledby="goals-title"
      aria-roledescription="carousel"
      className="pt-4"
      onKeyDown={handleKeyDown}
    >
      <h2 id="goals-title" className="sr-only">
        Goals
      </h2>

      <div
        ref={trackRef}
        onScroll={handleScroll}
        tabIndex={0}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar focus:outline-none"
      >
        {rings.map((ring, idx) => (
          <GoalSlideCard
            key={ring.id}
            ring={ring}
            cardSummary={slides[idx]}
            active={idx === activeIndex}
            index={idx}
            total={rings.length}
            onOpenGoal={onOpenGoal}
          />
        ))}
      </div>

      {rings.length > 1 && (
        <div className="flex items-center justify-center gap-1 mt-2" role="tablist" aria-label="Choose a goal">
          {rings.map((ring, idx) => {
            const isSelected = idx === activeIndex;
            const isAchieved = !ring.empty && ring.segments.length > 0 && ring.segments.every((s) => s === 'on');
            return (
              <button
                key={ring.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-label={`Goal ${idx + 1}: ${ring.title}`}
                onClick={() => goTo(idx)}
                className="min-w-[28px] min-h-[44px] flex items-center justify-center focus:outline-none"
              >
                <span
                  aria-hidden="true"
                  className="transition-all"
                  style={{
                    width: isSelected ? 20 : 6,
                    height: 6,
                    borderRadius: 9999,
                    background: isSelected
                      ? isAchieved
                        ? 'var(--color-status-positive)'
                        : 'var(--color-text-primary)'
                      : 'var(--color-border-track)',
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
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
