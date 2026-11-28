import React, { useEffect, useState } from 'react';
import { Pause, Play, VolumeX } from 'lucide-react';
import { ExerciseFormClip, FormPoseKeyframe, JointPoint } from '../../services/exerciseFormClips';
import { triggerHaptic } from '../../utils/haptics';

interface ExerciseFormClipPlayerProps {
  clip: ExerciseFormClip;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: JointPoint, b: JointPoint, t: number): JointPoint {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function interpolatePose(a: FormPoseKeyframe, b: FormPoseKeyframe, t: number): FormPoseKeyframe {
  return {
    head: lerpPoint(a.head, b.head, t),
    shoulder: lerpPoint(a.shoulder, b.shoulder, t),
    elbow: lerpPoint(a.elbow, b.elbow, t),
    wrist: lerpPoint(a.wrist, b.wrist, t),
    hip: lerpPoint(a.hip, b.hip, t),
    knee: lerpPoint(a.knee, b.knee, t),
    ankle: lerpPoint(a.ankle, b.ankle, t),
    implement: a.implement && b.implement ? lerpPoint(a.implement, b.implement, t) : undefined,
  };
}

/** Smoothly maps a [0, 1) cycle fraction into eccentric -> bottom pause -> concentric -> top reset. */
function easeCycle(cycleFraction: number): { t: number; phaseIndex: 0 | 1 | 2 } {
  if (cycleFraction < 0.45) {
    // Eccentric / drive to peak (smooth ease-in-out)
    const u = cycleFraction / 0.45;
    const eased = 0.5 - 0.5 * Math.cos(Math.PI * u);
    return { t: eased, phaseIndex: 0 };
  }
  if (cycleFraction < 0.6) {
    // Brief controlled pause at depth / peak
    return { t: 1, phaseIndex: 1 };
  }
  if (cycleFraction < 0.92) {
    // Concentric return
    const u = (cycleFraction - 0.6) / 0.32;
    const eased = 0.5 + 0.5 * Math.cos(Math.PI * u);
    return { t: eased, phaseIndex: 2 };
  }
  return { t: 0, phaseIndex: 2 };
}

/**
 * Offline-cached, strictly muted, looping exercise form clip player.
 * Never embeds external YouTube iframes and never touches OS audio focus so gym music keeps playing.
 */
export const ExerciseFormClipPlayer: React.FC<ExerciseFormClipPlayerProps> = ({ clip }) => {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [playing, setPlaying] = useState(!prefersReducedMotion);
  const [fraction, setFraction] = useState(prefersReducedMotion ? 0.5 : 0);

  useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    let startTs: number | null = null;
    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const elapsed = ts - startTs;
      setFraction((elapsed % clip.cycleMs) / clip.cycleMs);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, clip.cycleMs]);

  const { t, phaseIndex } = easeCycle(fraction);
  const pose = interpolatePose(clip.startPose, clip.peakPose, t);
  const mirrorFront = clip.viewLabel === 'Front view';

  const mirrorX = (x: number) => 240 - x;

  return (
    <div
      className="wk-raised flex flex-col gap-3"
      role="region"
      aria-label={`${clip.title} muted looping offline form clip`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="wk-pill gap-1">
            <VolumeX className="w-3 h-3 stroke-[2]" aria-hidden="true" />
            <span>Offline · Muted loop</span>
          </span>
          <span className="wk-caption truncate">{clip.viewLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setPlaying((p) => !p);
          }}
          aria-label={playing ? 'Pause form clip' : 'Play form clip'}
          className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border flex items-center justify-center shrink-0 transition-colors"
          style={{
            background: 'var(--wk-card)',
            borderColor: 'var(--color-border-strong)',
            color: 'var(--color-text-primary)',
          }}
        >
          {playing ? (
            <Pause className="w-4 h-4 stroke-[2]" aria-hidden="true" />
          ) : (
            <Play className="w-4 h-4 stroke-[2]" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Vector biomechanical clip canvas (zero network, zero audio focus) */}
      <div
        className="rounded-xl border overflow-hidden flex items-center justify-center"
        style={{
          background: 'var(--color-bg-canvas)',
          borderColor: 'var(--color-border-subtle)',
          height: 156,
        }}
      >
        <svg
          viewBox="0 0 240 140"
          width="100%"
          height="140"
          role="img"
          aria-label={`Animated form guide for ${clip.title}: ${clip.phases[phaseIndex]}`}
        >
          {/* Ground line */}
          <line
            x1="20"
            y1="130"
            x2="220"
            y2="130"
            stroke="var(--color-border-strong)"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Apparatus */}
          {clip.apparatus === 'flat_bench' && (
            <g stroke="var(--color-border-strong)" strokeWidth="4" strokeLinecap="round">
              <line x1="64" y1="98" x2="154" y2="98" />
              <line x1="80" y1="98" x2="80" y2="128" strokeWidth="3" />
              <line x1="142" y1="98" x2="142" y2="128" strokeWidth="3" />
            </g>
          )}
          {clip.apparatus === 'incline_bench' && (
            <g stroke="var(--color-border-strong)" strokeWidth="4" strokeLinecap="round">
              <line x1="76" y1="68" x2="122" y2="104" />
              <line x1="122" y1="104" x2="152" y2="104" />
              <line x1="94" y1="84" x2="94" y2="128" strokeWidth="3" />
              <line x1="142" y1="104" x2="142" y2="128" strokeWidth="3" />
            </g>
          )}
          {clip.apparatus === 'pullup_bar' && (
            <g stroke="var(--color-border-strong)" strokeWidth="4" strokeLinecap="round">
              <line x1="68" y1="16" x2="172" y2="16" />
              <line x1="72" y1="16" x2="72" y2="128" strokeWidth="2" strokeDasharray="4 4" />
              <line x1="168" y1="16" x2="168" y2="128" strokeWidth="2" strokeDasharray="4 4" />
            </g>
          )}
          {clip.apparatus === 'cable_high' && (
            <g stroke="var(--color-border-strong)" strokeWidth="2">
              <line x1="64" y1="14" x2="64" y2="128" strokeWidth="3" />
              {pose.implement && (
                <line x1="64" y1="18" x2={pose.implement.x} y2={pose.implement.y} strokeDasharray="3 3" />
              )}
            </g>
          )}
          {clip.apparatus === 'cable_mid' && (
            <g stroke="var(--color-border-strong)" strokeWidth="2">
              <line x1="48" y1="24" x2="48" y2="128" strokeWidth="3" />
              {pose.implement && (
                <line x1="48" y1="74" x2={pose.implement.x} y2={pose.implement.y} strokeDasharray="3 3" />
              )}
            </g>
          )}
          {clip.apparatus === 'step' && (
            <rect
              x="104"
              y="122"
              width="28"
              height="8"
              rx="2"
              fill="var(--color-bg-surface-control)"
              stroke="var(--color-border-strong)"
              strokeWidth="1.5"
            />
          )}

          {/* Faint travel path trace for the load / wrist */}
          {clip.startPose.implement && clip.peakPose.implement && (
            <line
              x1={clip.startPose.implement.x}
              y1={clip.startPose.implement.y}
              x2={clip.peakPose.implement.x}
              y2={clip.peakPose.implement.y}
              stroke="var(--wk-accent)"
              strokeOpacity="0.35"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          )}

          {/* Skeleton / limbs */}
          <g stroke="var(--color-text-primary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
            {/* Torso */}
            <line x1={pose.shoulder.x} y1={pose.shoulder.y} x2={pose.hip.x} y2={pose.hip.y} />
            {/* Legs */}
            <line x1={pose.hip.x} y1={pose.hip.y} x2={pose.knee.x} y2={pose.knee.y} />
            <line x1={pose.knee.x} y1={pose.knee.y} x2={pose.ankle.x} y2={pose.ankle.y} />
            {/* Primary arm */}
            <line x1={pose.shoulder.x} y1={pose.shoulder.y} x2={pose.elbow.x} y2={pose.elbow.y} />
            <line x1={pose.elbow.x} y1={pose.elbow.y} x2={pose.wrist.x} y2={pose.wrist.y} />
            {/* Mirrored right side for front-view movements (pull-ups, lateral raises) */}
            {mirrorFront && (
              <>
                <line
                  x1={mirrorX(pose.shoulder.x)}
                  y1={pose.shoulder.y}
                  x2={mirrorX(pose.elbow.x)}
                  y2={pose.elbow.y}
                />
                <line
                  x1={mirrorX(pose.elbow.x)}
                  y1={pose.elbow.y}
                  x2={mirrorX(pose.wrist.x)}
                  y2={pose.wrist.y}
                />
                <line
                  x1={mirrorX(pose.hip.x)}
                  y1={pose.hip.y}
                  x2={mirrorX(pose.knee.x)}
                  y2={pose.knee.y}
                />
                <line
                  x1={mirrorX(pose.knee.x)}
                  y1={pose.knee.y}
                  x2={mirrorX(pose.ankle.x)}
                  y2={pose.ankle.y}
                />
              </>
            )}
          </g>

          {/* Head */}
          <circle
            cx={pose.head.x}
            cy={pose.head.y}
            r="8"
            fill="var(--wk-raised)"
            stroke="var(--color-text-primary)"
            strokeWidth="3"
          />

          {/* Highlighted load / implement */}
          {pose.implement && clip.equipmentStyle !== 'bodyweight' && (
            <g>
              <circle
                cx={pose.implement.x}
                cy={pose.implement.y}
                r={clip.equipmentStyle === 'barbell' ? 8 : 6}
                fill="var(--wk-accent)"
              />
              {mirrorFront && clip.equipmentStyle === 'dumbbell' && (
                <circle
                  cx={mirrorX(pose.implement.x)}
                  cy={pose.implement.y}
                  r="6"
                  fill="var(--wk-accent)"
                />
              )}
            </g>
          )}
        </svg>
      </div>

      {/* Synchronized phase bar */}
      <div className="grid grid-cols-3 gap-2">
        {clip.phases.map((label, idx) => {
          const active = idx === phaseIndex;
          return (
            <div
              key={label}
              className="rounded-lg px-2 py-2 text-center border transition-colors"
              style={{
                background: active ? 'var(--color-status-positive-soft)' : 'var(--wk-card)',
                borderColor: active ? 'var(--wk-accent)' : 'var(--color-border-subtle)',
              }}
            >
              <span
                className={`${active ? 'wk-meta-title' : 'wk-caption'} block truncate`}
                style={{
                  color: active ? 'var(--wk-accent)' : 'var(--color-text-secondary)',
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="wk-caption max-w-prose" style={{ color: 'var(--color-text-secondary)' }}>
        {clip.cueSummary}
      </p>
    </div>
  );
};
