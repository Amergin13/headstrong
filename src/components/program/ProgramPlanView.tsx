import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { BiometricLog, ExerciseDefinition, ReadinessState, UserProfile, WorkoutSession } from '../../engine/types';
import { buildAthleteKnowledgeGraph } from '../../engine/knowledgeGraph';
import { calculateWeeklyMuscleVolume } from '../../services/storage';
import { isOnDeviceModelReady } from '../../services/onDeviceModel';
import {
  acceptIdentityMessage,
  buildIdentityFacts,
  cacheIdentityMessage,
  generateIdentityMessage,
  getCachedIdentityMessage,
} from '../../services/identityMessage';
import {
  PROGRAM_PHASES,
  WORKOUT_TEMPLATES_24,
  PlanWorkoutOverview,
  buildPlanOverview,
  generate6WeekMuscleBuildingWorkout,
} from '../../engine/muscleBuildingProgram';
import { triggerHaptic } from '../../utils/haptics';
import { PastWorkoutModal } from './PastWorkoutModal';

/** One Figma pixel (1344 px frame) in screen pixels; see .wk in index.css. */
const fig = (px: number) => `calc(${px} * var(--f))`;
const TOTAL = WORKOUT_TEMPLATES_24.length;

/** One contour of the identity form: a finished workout, or the outline of the next one. */
interface IdentityRing {
  done: boolean;
  next: boolean;
  phase: number;
  /** Lobes of the contour: what the workout trained. */
  lobes: number;
  /** Working sets logged (0 when not done), which makes the contour bolder. */
  sets: number;
}

const PHASE_COLORS: Record<number, [string, string]> = {
  1: ['#7B5CFF', '#B08CFF'],
  2: ['#E04FD0', '#FF8AD8'],
  3: ['#FF9E6D', '#FFD0A8'],
};

function lobesFor(label: string): number {
  if (/shoulder/i.test(label)) return 3;
  if (/leg/i.test(label)) return 4;
  return 2;
}

/** Small seeded random generator, so an athlete's form is always drawn the same way. */
function seededRandom(seedText: string) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * The athlete's identity as a sphere of light. Every finished workout adds one ring of latitude,
 * from the equator out towards the poles: its shape comes from what was trained (chest and back, shoulders and
 * arms, legs), its weight from the sets logged and its colour from the phase. The sphere grows as the
 * plan goes on, and the next workout shows as a faint dotted ring. A slow pulse travels through the
 * rings in the order they were earned. Still frame with reduced motion.
 */
const IdentityForm: React.FC<{ rings: IdentityRing[]; seed: string }> = ({ rings, seed }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const completed = rings.filter((r) => r.done).length;
  const key = rings.map((r) => `${r.done ? 1 : 0}${r.next ? 1 : 0}${r.sets}`).join('') + seed;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const rand = seededRandom(seed);
    // Each contour's shape blends the one inside it with the new workout's own shape, so the
    // contours nest like growth rings while every workout still leaves its mark.
    const ORDERS = [2, 3, 4, 5];
    let coeffs = ORDERS.map(() => ({ re: 0, im: 0 }));
    const shapes = rings.map((ring, k) => {
      const angle = rand() * Math.PI * 2;
      const strength = 0.6 + 0.4 * Math.min(1, ring.sets / 20);
      coeffs = coeffs.map((c, i) => {
        const target = ORDERS[i] === ring.lobes ? strength : 0.15 * rand();
        const a = ORDERS[i] === ring.lobes ? angle : rand() * Math.PI * 2;
        return { re: 0.72 * c.re + 0.28 * target * Math.cos(a), im: 0.72 * c.im + 0.28 * target * Math.sin(a) };
      });
      return {
        ...ring,
        k,
        harmonics: coeffs.map((c, i) => ({ order: ORDERS[i], amp: Math.hypot(c.re, c.im), phase: Math.atan2(c.im, c.re) })),
      };
    });
    const progress = completed / TOTAL;
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // 3D sphere: each workout is one ring of latitude. The sphere turns slowly and leans towards the viewer; it is drawn in perspective
    // with the near side brighter and thicker than the far side.
    const tiltOf = (t: number) => 0.38 + 0.06 * Math.sin(t * 0.25);
    // Rings fill from the equator outwards, alternating above and below, so the first is the widest.
    const latitudeOf = (k: number) => (k % 2 === 0 ? 1 : -1) * (Math.floor(k / 2) + 0.5) * (Math.PI / TOTAL);
    const contour = (
      cx: number,
      cy: number,
      sphere: number,
      s: (typeof shapes)[number],
      t: number,
      offset: number
    ): [number, number, number][] => {
      const steps = 240;
      const spin = t * 0.18;
      const lat = latitudeOf(s.k);
      const ringRadius = sphere * Math.cos(lat);
      const ringY = -sphere * Math.sin(lat);
      const tilt = tiltOf(t);
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);
      const persp = height * 2.2;
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        let shape = 0;
        for (const h of s.harmonics) shape += h.amp * Math.sin(h.order * a + h.phase + 0.3 * Math.sin(t * 0.4 + h.order));
        const r = ringRadius * (1 + 0.1 * shape) + offset;
        const x = r * Math.cos(a + spin);
        const z = r * Math.sin(a + spin);
        const y2 = ringY * cosT - z * sinT;
        const z2 = ringY * sinT + z * cosT;
        const f = persp / (persp - z2);
        const near = Math.max(0, Math.min(1, z2 / (sphere * 2) + 0.5));
        pts.push([cx + x * f, cy + y2 * f, near]);
      }
      return pts;
    };

    /** Strokes a contour in short pieces so each piece can be lit by how near it is. */
    const strokeDepth = (pts: [number, number, number][], alpha: number, lineWidth: number) => {
      const piece = 8;
      for (let i = 0; i < pts.length - 1; i += piece) {
        const end = Math.min(pts.length - 1, i + piece);
        const near = pts[Math.min(pts.length - 1, i + piece / 2)][2];
        ctx.globalAlpha = Math.min(1, alpha * (0.3 + 0.6 * near));
        ctx.lineWidth = lineWidth * (0.6 + 0.8 * near);
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        for (let j = i + 1; j <= end; j++) ctx.lineTo(pts[j][0], pts[j][1]);
        ctx.stroke();
      }
    };

    const draw = (t: number) => {
      const cx = width / 2;
      const cy = height / 2;
      // The sphere grows as the plan goes on.
      const sphere = height * (0.24 + 0.13 * progress) * (1 + 0.012 * Math.sin(t * 0.9));
      const formRadius = sphere;
      const formY = cy;
      // A pulse of light travels through the rings in the order they were earned.
      const pulseK = ((t % 5) / 5) * (Math.max(1, completed) + 3) - 1;

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, width, height);

      // Ambient light: soft glows drifting behind the form, brighter and warmer as the plan goes on.
      ctx.globalCompositeOperation = 'screen';
      const ambient: [number, number, number, number][] = [
        [123, 92, 255, 0.42 + 0.16 * progress],
        [224, 79, 208, 0.2 + 0.24 * progress],
        [255, 158, 109, 0.06 + 0.28 * progress],
      ];
      ambient.forEach(([r, g, b, alpha], i) => {
        const a = t * 0.12 + i * 2.1;
        const gx = cx + Math.cos(a) * width * 0.14;
        const gy = cy + Math.sin(a * 1.3) * height * 0.07;
        // Stays inside the canvas vertically so the light never shows a hard edge.
        const radius = height * (0.38 + 0.05 * progress);
        ctx.save();
        ctx.translate(gx, gy);
        ctx.scale(2.2, 1);
        const light = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        light.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
        light.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);
        light.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = light;
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        ctx.restore();
      });
      ctx.globalCompositeOperation = 'source-over';

      // Core: grows and warms as the plan goes on.
      const core = ctx.createRadialGradient(cx, formY, 0, cx, formY, formRadius * 0.7 + height * 0.08);
      core.addColorStop(0, `rgba(255, 190, 240, ${0.06 + 0.12 * progress})`);
      core.addColorStop(0.35, `rgba(166, 60, 255, ${0.08 + 0.14 * progress})`);
      core.addColorStop(1, 'rgba(91, 71, 255, 0)');
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, width, height);

      // Faint glass body and rim, so the sphere reads as a whole before its rings are filled in.
      const body = ctx.createRadialGradient(cx - sphere * 0.35, formY - sphere * 0.4, sphere * 0.05, cx, formY, sphere);
      body.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
      body.addColorStop(0.6, 'rgba(166, 60, 255, 0.05)');
      body.addColorStop(1, 'rgba(166, 60, 255, 0.12)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, formY, sphere, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(200, 180, 255, 0.16)';
      ctx.stroke();

      ctx.globalCompositeOperation = 'lighter';
      for (const s of shapes) {
        if (s.next) {
          ctx.setLineDash([2, 5]);
          ctx.strokeStyle = '#FFFFFF';
          strokeDepth(contour(cx, formY, sphere, s, t, 0), 0.22 + 0.12 * Math.sin(t * 2.2), 1);
          ctx.setLineDash([]);
          continue;
        }
        if (!s.done) continue;
        const [c1, c2] = PHASE_COLORS[s.phase] ?? PHASE_COLORS[1];
        const grad =
          typeof ctx.createConicGradient === 'function'
            ? ctx.createConicGradient(s.harmonics[0].phase + t * 0.2, cx, formY)
            : null;
        if (grad) {
          grad.addColorStop(0, c1);
          grad.addColorStop(0.5, c2);
          grad.addColorStop(1, c1);
        }
        ctx.strokeStyle = grad ?? c1;
        const lit = Math.exp(-(((s.k - pulseK) / 1.4) ** 2));
        const newest = s.k === completed - 1 ? 0.25 + 0.15 * Math.sin(t * 3) : 0;
        const weight = 0.55 + 0.45 * Math.min(1, s.sets / 20);
        // Soft glow, then a bundle of three fine lines.
        strokeDepth(contour(cx, formY, sphere, s, t, 0), (0.05 + 0.12 * lit) * weight, 5);
        for (const [offset, alpha] of [[-1.6, 0.3], [0, 0.75], [1.6, 0.3]] as const) {
          strokeDepth(contour(cx, formY, sphere, s, t, offset), (alpha + 0.5 * lit + newest) * weight, 0.9);
        }
      }
    };

    const loop = (now: number) => {
      draw((now - start) / 1000);
      if (visible && !reduceMotion) frame = requestAnimationFrame(loop);
    };

    resize();
    draw(1.5);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && document.visibilityState === 'visible';
      cancelAnimationFrame(frame);
      if (visible && !reduceMotion) frame = requestAnimationFrame(loop);
    });
    observer.observe(canvas);
    const onResize = () => {
      resize();
      draw((performance.now() - start) / 1000);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Your athlete identity: ${completed} of ${TOTAL} workouts complete`}
      className="block w-full"
      style={{ height: fig(552) }}
    />
  );
};

interface ProgramPlanViewProps {
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  profile: UserProfile;
  exerciseCatalog: ExerciseDefinition[];
  readinessState: ReadinessState;
  bodyweightKg: number;
  /** Plan number of the workout already loaded on the Workout tab. */
  activeProgramWorkoutNumber?: number;
  onLaunchWorkoutNumber?: (workoutNumber: number) => void;
  onBackToWorkout?: () => void;
}

/** Program page for the 6-Week Muscle Building Plan: identity, progress, then the three phases. */
export const ProgramPlanView: React.FC<ProgramPlanViewProps> = ({
  workouts,
  biometrics,
  profile,
  exerciseCatalog,
  readinessState,
  bodyweightKg,
  activeProgramWorkoutNumber,
  onLaunchWorkoutNumber,
  onBackToWorkout,
}) => {
  const plan = useMemo(() => buildPlanOverview(workouts), [workouts]);
  const [openPhases, setOpenPhases] = useState<number[]>([plan.activePhase]);
  const [viewing, setViewing] = useState<PlanWorkoutOverview | null>(null);
  const next = plan.workouts.find((w) => w.workoutNumber === plan.nextWorkoutNumber)!;
  const isFirstRun = plan.cycleNumber === 1;

  // Identity message: facts from the plan, history and knowledge graph; written by the on-device
  // model when one is ready, otherwise the fact-based fallback.
  const identityFacts = useMemo(() => {
    const knowledgeGraph = buildAthleteKnowledgeGraph(
      workouts,
      biometrics,
      exerciseCatalog,
      profile,
      calculateWeeklyMuscleVolume(workouts, exerciseCatalog)
    );
    return buildIdentityFacts({
      plan,
      workouts,
      nextSession: generate6WeekMuscleBuildingWorkout(plan.nextWorkoutNumber, bodyweightKg),
      exerciseCatalog,
      knowledgeGraph,
      readinessState,
      bodyweightKg,
    });
    // Facts change with history and readiness, not with every profile edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, workouts, biometrics, exerciseCatalog, readinessState, bodyweightKg]);
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!isFirstRun) return;
    let cancelled = false;
    const cached = acceptIdentityMessage(getCachedIdentityMessage(identityFacts.key) ?? null, identityFacts);
    setIdentityMessage(cached);
    if (cached) return;
    (async () => {
      if (!(await isOnDeviceModelReady())) return;
      const message = await generateIdentityMessage(identityFacts);
      if (cancelled || !message) return;
      cacheIdentityMessage(identityFacts.key, message);
      setIdentityMessage(message);
    })();
    return () => {
      cancelled = true;
    };
  }, [identityFacts, isFirstRun]);
  const identityRings = useMemo<IdentityRing[]>(
    () =>
      plan.workouts.map((w) => ({
        done: w.status === 'done',
        next: w.status === 'next',
        phase: w.phase,
        lobes: lobesFor(w.label),
        sets: w.session
          ? w.session.exercises.reduce((n, ex) => n + ex.sets.filter((st) => st.completed && !st.isWarmup).length, 0)
          : 0,
      })),
    [plan]
  );
  // The form is unique to the athlete: seeded by when they started the plan.
  const identitySeed = plan.workouts.find((w) => w.session)?.session?.completedAt ?? 'treise';

  // Page background: #283339 at the top fading to #13181C where the plan progress starts (as on the Workout tab).
  const progressRef = useRef<HTMLElement>(null);
  const [gradientEnd, setGradientEnd] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      if (progressRef.current) setGradientEnd(progressRef.current.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isFirstRun]);

  const togglePhase = (phase: number) => {
    triggerHaptic('light');
    setOpenPhases((open) => (open.includes(phase) ? open.filter((p) => p !== phase) : [...open, phase]));
  };

  const openWorkout = (w: PlanWorkoutOverview) => {
    triggerHaptic('light');
    if (w.status === 'done' && w.session) {
      setViewing(w);
    } else if (w.status === 'next') {
      if (activeProgramWorkoutNumber === w.workoutNumber && onBackToWorkout) onBackToWorkout();
      else onLaunchWorkoutNumber?.(w.workoutNumber);
    }
  };

  const rowStyle: React.CSSProperties = {
    height: fig(77),
    borderRadius: fig(16),
    paddingLeft: fig(35),
    paddingRight: fig(31),
    fontSize: fig(28),
    gap: fig(22),
  };

  return (
    <>
      {gradientEnd !== null &&
        createPortal(
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: gradientEnd,
              background: 'linear-gradient(180deg, #283339 0%, #13181C 100%)',
              zIndex: -1,
              pointerEvents: 'none',
            }}
          />,
          document.body
        )}
      <header style={{ paddingTop: fig(20) }}>
        <h1 className="wk-page-title" style={{ fontSize: fig(28) }}>
          6 Week Muscle Plan
        </h1>
      </header>

      {isFirstRun && (
        <section aria-label="Your progress as an athlete" className="flex flex-col items-center text-center">
          <div className="self-stretch" style={{ marginLeft: fig(-38), marginRight: fig(-38), marginTop: fig(-11) }}>
            <IdentityForm rings={identityRings} seed={identitySeed} />
          </div>
          <h2 className="wk-h1" style={{ marginTop: fig(-30), lineHeight: 1.21 }}>
            Your new identity as an athlete is forming
          </h2>
          <p
            style={{
              marginTop: fig(28),
              maxWidth: fig(790),
              fontSize: fig(26),
              lineHeight: fig(34),
              color: 'var(--wk-muted)',
            }}
          >
            <span key={identityMessage ? 'model' : 'facts'} className="wk-text-swap">
              {identityMessage ?? identityFacts.fallback}
            </span>
          </p>
        </section>
      )}

      <section
        ref={progressRef}
        aria-label="Plan progress"
        style={{ marginTop: fig(isFirstRun ? 107 : 60), paddingLeft: fig(38), paddingRight: fig(38) }}
      >
        <div className="flex items-end justify-between" style={{ gap: fig(20) }}>
          <span className="wk-label" style={{ lineHeight: 1.21 }}>
            Next: {next.label}
          </span>
          <span className="font-bold text-white shrink-0" style={{ fontSize: fig(40), lineHeight: 1 }}>
            {plan.nextWorkoutNumber}/{TOTAL}
          </span>
        </div>
        <div
          className="wk-bar"
          style={{ marginTop: fig(21) }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={TOTAL}
          aria-valuenow={plan.nextWorkoutNumber}
          aria-label="Plan progress"
        >
          <div style={{ width: `${(plan.nextWorkoutNumber / TOTAL) * 100}%` }} />
        </div>
      </section>

      <div className="flex flex-col" style={{ marginTop: fig(75), gap: fig(34) }}>
        {PROGRAM_PHASES.map((phase) => {
          const isOpen = openPhases.includes(phase.phaseNumber);
          const phaseWorkouts = plan.workouts.filter((w) => w.phase === phase.phaseNumber);
          return (
            <div key={phase.phaseNumber}>
              <button
                type="button"
                onClick={() => togglePhase(phase.phaseNumber)}
                aria-expanded={isOpen}
                className="w-full text-left block"
                style={{
                  background: 'var(--wk-card)',
                  borderRadius: fig(30),
                  padding: `${fig(34)} ${fig(38)} ${fig(51)}`,
                }}
              >
                <h2 className="wk-h1" style={{ lineHeight: 1.21 }}>
                  Phase {phase.phaseNumber}
                </h2>
                <p style={{ marginTop: fig(12), fontSize: fig(26), lineHeight: fig(34), color: 'var(--wk-muted)' }}>
                  {phase.planSummary}
                </p>
              </button>

              {isOpen && (
                <ol
                  className="flex flex-col"
                  style={{ marginTop: fig(46), marginBottom: fig(27), gap: fig(21), paddingLeft: fig(38), paddingRight: fig(38) }}
                >
                  {phaseWorkouts.map((w) => {
                    const done = w.status === 'done';
                    const isNext = w.status === 'next';
                    const name = `${w.workoutNumber}. ${w.label}`;
                    const content = (
                      <>
                        <span className="font-bold uppercase text-white truncate">{name}</span>
                        {isNext && (
                          <span className="uppercase shrink-0" style={{ color: 'var(--wk-muted)' }}>
                            Up next
                          </span>
                        )}
                        {done && (
                          <ChevronRight
                            className="ml-auto shrink-0 text-white"
                            style={{ width: fig(36), height: fig(36) }}
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                        )}
                      </>
                    );
                    return (
                      <li key={w.workoutNumber}>
                        {done || isNext ? (
                          <button
                            type="button"
                            onClick={() => openWorkout(w)}
                            aria-label={done ? `${name}, completed. View workout` : `${name}, up next. Open workout`}
                            className="wk-hit w-full flex items-center text-left"
                            style={{ ...rowStyle, background: done ? '#05A670' : 'var(--wk-card)' }}
                          >
                            {content}
                          </button>
                        ) : (
                          <div className="flex items-center" style={{ ...rowStyle, background: 'var(--wk-card)' }}>
                            {content}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
      </div>

      {viewing?.session && (
        <PastWorkoutModal
          workoutNumber={viewing.workoutNumber}
          title={viewing.label}
          session={viewing.session}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
};
