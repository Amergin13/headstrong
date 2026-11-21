import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Sparkles, X } from 'lucide-react';
import { PageTopGradient } from '../common/PageTopGradient';
import { BiometricLog, ExerciseDefinition, ReadinessState, UserProfile, WorkoutSession } from '../../engine/types';
import { CoachIntervention, detectCoachInterventions } from '../../services/coachInterventions';
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
  PlanWorkoutOverview,
  TrainingPlan,
  buildPlanOverview,
  generatePlanWorkout,
} from '../../engine/muscleBuildingProgram';
import { ActivityLog, describeActivity } from '../../engine/activeDays';
import { triggerHaptic } from '../../utils/haptics';
import { formatSentenceCase } from '../../utils/typography';
import { PastWorkoutModal } from './PastWorkoutModal';
import { WeeklyVolumeCard } from './WeeklyVolumeCard';
import { ProgramAdaptationCarousel } from './ProgramAdaptationCarousel';
import { ExerciseDetailModal } from '../train/ExerciseDetailModal';
import { buildInspectExerciseSession } from '../../services/exerciseDetails';
import { CoachSummaryText } from '../common/CoachSummaryText';
import { resolveCssToken } from '../../styles/semanticTokens';

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
const parseRgbTuple = (token: string, fallback: [number, number, number]): [number, number, number] => {
  const parts = resolveCssToken(token, fallback.join(' '))
    .trim()
    .split(/\s+/)
    .map((n) => Number(n));
  return parts.length === 3 && parts.every(Number.isFinite) ? [parts[0], parts[1], parts[2]] : fallback;
};

const IdentityForm: React.FC<{ rings: IdentityRing[]; seed: string; total: number; readinessState: ReadinessState }> = ({
  rings,
  seed,
  total,
  readinessState,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const completed = rings.filter((r) => r.done).length;
  const key = rings.map((r) => `${r.done ? 1 : 0}${r.next ? 1 : 0}${r.sets}`).join('') + seed + readinessState;

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
    const progress = completed / total;
    const isCaution = readinessState === 'Amber Shield';
    const isPrimed = readinessState === 'Primed';
    const accentRgbTuple = parseRgbTuple('--color-accent-primary-rgb', [26, 227, 160]);
    const warningRgbTuple = parseRgbTuple('--color-status-warning-rgb', [245, 185, 74]);
    const activeAuraTuple = isCaution ? warningRgbTuple : accentRgbTuple;
    const auraAlpha = isCaution ? 0.10 + 0.14 * progress : isPrimed ? 0.12 + 0.16 * progress : 0.08 + 0.12 * progress;
    const progressStroke = isCaution
      ? resolveCssToken('--color-status-warning', 'rgb(245, 185, 74)')
      : resolveCssToken('--color-accent-primary', 'rgb(26, 227, 160)');
    const neutralRgb = '188, 195, 200';
    const progressRgb = activeAuraTuple.join(', ');
    const brightStroke = resolveCssToken('--color-text-primary', 'rgb(245, 248, 251)');
    const nextContourStroke = brightStroke;
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
    const latitudeOf = (k: number) => (k % 2 === 0 ? 1 : -1) * (Math.floor(k / 2) + 0.5) * (Math.PI / total);
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

      // Ambient light: neutral slate mist and subtle progression aura drifting behind the form.
      ctx.globalCompositeOperation = 'screen';
      const ambient: [number, number, number, number][] = [
        progress > 0 ? [...activeAuraTuple, auraAlpha] : [188, 195, 200, 0.18],
        [245, 248, 251, 0.10 + 0.12 * progress],
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

      // Core: grows cleanly with plan progress.
      const core = ctx.createRadialGradient(cx, formY, 0, cx, formY, formRadius * 0.7 + height * 0.08);
      const auraRgb = progress > 0 ? progressRgb : neutralRgb;
      core.addColorStop(0, `rgba(255, 255, 255, ${0.06 + 0.12 * progress})`);
      core.addColorStop(0.35, `rgba(${auraRgb}, ${0.07 + 0.12 * progress})`);
      core.addColorStop(1, `rgba(${auraRgb}, 0)`);
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, width, height);

      // Faint glass body and rim, so the sphere reads as a whole before its rings are filled in.
      const body = ctx.createRadialGradient(cx - sphere * 0.35, formY - sphere * 0.4, sphere * 0.05, cx, formY, sphere);
      body.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
      body.addColorStop(0.6, `rgba(${neutralRgb}, 0.05)`);
      body.addColorStop(1, `rgba(${neutralRgb}, 0.12)`);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, formY, sphere, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${neutralRgb}, 0.22)`;
      ctx.stroke();

      ctx.globalCompositeOperation = 'lighter';
      for (const s of shapes) {
        if (s.next) {
          ctx.setLineDash([2, 5]);
          ctx.strokeStyle = nextContourStroke;
          strokeDepth(contour(cx, formY, sphere, s, t, 0), 0.22 + 0.12 * Math.sin(t * 2.2), 1);
          ctx.setLineDash([]);
          continue;
        }
        if (!s.done) continue;
        const grad =
          typeof ctx.createConicGradient === 'function'
            ? ctx.createConicGradient(s.harmonics[0].phase + t * 0.2, cx, formY)
            : null;
        if (grad) {
          grad.addColorStop(0, progressStroke);
          grad.addColorStop(0.5, brightStroke);
          grad.addColorStop(1, progressStroke);
        }
        ctx.strokeStyle = grad ?? progressStroke;
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
      aria-label={`Your athlete identity: ${completed} of ${total} workouts complete (${readinessState} readiness)`}
      className="block w-full"
      style={{ height: 248 }}
    />
  );
};

function describeProgramOverride(
  ov: NonNullable<UserProfile['programOverrides']>[number],
  exerciseNameById: Map<string, string>
): string {
  const target =
    ov.targetExerciseName ||
    (ov.targetExerciseId ? exerciseNameById.get(ov.targetExerciseId) : undefined) ||
    ov.targetExerciseId ||
    'Exercise';
  const replacement =
    ov.replacementExerciseName ||
    (ov.replacementExerciseId ? exerciseNameById.get(ov.replacementExerciseId) : undefined) ||
    ov.replacementExerciseId;
  const scope = ov.workoutFilter ? ` (${ov.workoutFilter})` : '';
  switch (ov.kind) {
    case 'swap_exercise':
      return `${target} → ${replacement ?? 'replacement'}${scope}`;
    case 'add_exercise':
      return `Added ${replacement ?? target}${ov.sets ? ` (${ov.sets} sets)` : ''}${scope}`;
    case 'remove_exercise':
      return `Removed ${target}${scope}`;
    case 'adjust_sets':
      if (ov.sets !== undefined) return `${target}: ${ov.sets} working sets${scope}`;
      return `${target}: ${(ov.setDelta ?? 0) >= 0 ? `+${ov.setDelta ?? 0}` : ov.setDelta} sets${scope}`;
    case 'prioritize_first':
      return `Prioritized ${target} first${scope}`;
    default:
      return `${target}${scope}`;
  }
}

interface ProgramPlanViewProps {
  /** The athlete's plan: the goal-based starter plan, or the muscle plan on the owner's account. */
  trainingPlan: TrainingPlan;
  /** Active days, for plans with a weekly active day. */
  activities?: ActivityLog[];
  onLogActivity?: () => void;
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
  /** Opens Treise coach with a pre-filled HITL program adaptation prompt. */
  onOpenCoachIntervention?: (prompt: string) => void;
  /** Opens Treise coach in the Program context (optional pre-filled prompt). */
  onOpenCoach?: (prompt?: string) => void;
  /** Directly executes and persists an accepted adaptation suggestion across the entire product. */
  onAcceptIntervention?: (intervention: CoachIntervention) => void;
  /** Dismisses an adaptation suggestion and persists dismissal across the entire product. */
  onDismissIntervention?: (intervention: CoachIntervention) => void;
  /** Removes a single accepted program override cleanly. */
  onRemoveProgramOverride?: (overrideId: string) => void;
  /** Clears all accepted program overrides for the current plan. */
  onClearProgramOverrides?: (planId: string) => void;
  /** Saves inline edits to a completed past workout. */
  onUpdatePastWorkout?: (updated: WorkoutSession) => void;
  /** Deletes a completed past workout from history. */
  onDeletePastWorkout?: (workoutId: string) => void;
  headerAction?: React.ReactNode;
}

/** Program page for the 6-Week Muscle Building Plan: identity, progress, then the three phases. */
export const ProgramPlanView: React.FC<ProgramPlanViewProps> = ({
  trainingPlan,
  activities = [],
  onLogActivity,
  workouts,
  biometrics,
  profile,
  exerciseCatalog,
  readinessState,
  bodyweightKg,
  activeProgramWorkoutNumber,
  onLaunchWorkoutNumber,
  onBackToWorkout,
  onOpenCoachIntervention,
  onOpenCoach,
  onAcceptIntervention,
  onDismissIntervention,
  onRemoveProgramOverride,
  onClearProgramOverrides,
  onUpdatePastWorkout,
  onDeletePastWorkout,
  headerAction,
}) => {
  const plan = useMemo(
    () => buildPlanOverview(workouts, trainingPlan, activities, profile.planCycleStarts, profile.planStartWorkouts),
    [workouts, trainingPlan, activities, profile.planCycleStarts, profile.planStartWorkouts]
  );
  const TOTAL = trainingPlan.templates.length;
  const [openPhases, setOpenPhases] = useState<number[]>([plan.activePhase]);
  const [viewing, setViewing] = useState<PlanWorkoutOverview | null>(null);
  const [inspectedExerciseId, setInspectedExerciseId] = useState<string | null>(null);
  const inspectedExercise = useMemo(() => {
    if (!inspectedExerciseId) return null;
    return buildInspectExerciseSession({
      exerciseId: inspectedExerciseId,
      exerciseCatalog,
      workouts,
    });
  }, [inspectedExerciseId, exerciseCatalog, workouts]);
  const next = plan.workouts.find((w) => w.workoutNumber === plan.nextWorkoutNumber)!;
  const isFirstRun = plan.cycleNumber === 1;
  const exerciseNameById = useMemo(
    () => new Map(exerciseCatalog.map((ex) => [ex.id, ex.name])),
    [exerciseCatalog]
  );
  const activeOverrides = useMemo(
    () =>
      (profile.programOverrides ?? []).filter(
        (ov) => !ov.planId || ov.planId === trainingPlan.id
      ),
    [profile.programOverrides, trainingPlan.id]
  );
  const weeklyVolume = useMemo(
    () => calculateWeeklyMuscleVolume(workouts, exerciseCatalog),
    [workouts, exerciseCatalog]
  );
  const knowledgeGraph = useMemo(
    () =>
      buildAthleteKnowledgeGraph(
        workouts,
        biometrics,
        exerciseCatalog,
        profile,
        weeklyVolume,
        activities
      ),
    [workouts, biometrics, exerciseCatalog, profile, weeklyVolume, activities]
  );
  const coachInterventions = useMemo(
    () =>
      detectCoachInterventions({
        profile,
        workouts,
        biometrics,
        exerciseCatalog,
        bodyweightEmaKg: bodyweightKg,
        readinessState,
        weeklyVolume,
        activities,
        knowledgeGraph,
        trainingPlan,
      }),
    [profile, workouts, biometrics, exerciseCatalog, bodyweightKg, readinessState, weeklyVolume, activities, knowledgeGraph, trainingPlan]
  );

  // Identity message: facts from the plan, history and knowledge graph; written by the on-device
  // model when one is ready, otherwise the fact-based fallback.
  const identityFacts = useMemo(
    () =>
      buildIdentityFacts({
        plan,
        trainingPlan,
        workouts,
        nextSession: generatePlanWorkout(trainingPlan, plan.nextWorkoutNumber),
        exerciseCatalog,
        knowledgeGraph,
        readinessState,
        bodyweightKg,
      }),
    [plan, trainingPlan, workouts, exerciseCatalog, knowledgeGraph, readinessState, bodyweightKg]
  );
  const [identityMessage, setIdentityMessage] = useState<string | null>(() =>
    acceptIdentityMessage(getCachedIdentityMessage(identityFacts.key) ?? null, identityFacts)
  );
  useEffect(() => {
    if (!isFirstRun) return;
    let cancelled = false;
    const cached = acceptIdentityMessage(getCachedIdentityMessage(identityFacts.key) ?? null, identityFacts);
    setIdentityMessage(cached);
    if (cached) return;
    const timer = setTimeout(() => {
      (async () => {
        if (cancelled || !(await isOnDeviceModelReady())) return;
        const message = await generateIdentityMessage(identityFacts);
        if (cancelled || !message) return;
        cacheIdentityMessage(identityFacts.key, message);
        setIdentityMessage(message);
        // Any failure leaves the fact-based message in place.
      })().catch(() => undefined);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [identityFacts, isFirstRun]);
  const identityRings = useMemo<IdentityRing[]>(
    () =>
      plan.workouts.map((w) => ({
        done: w.status === 'done',
        next: w.status === 'next',
        phase: w.phase,
        lobes: lobesFor(w.label),
        // An active day draws a light ring (no lifting sets); a lifting workout is bolder with more sets.
        sets: w.session
          ? w.session.exercises.reduce((n, ex) => n + ex.sets.filter((st) => st.completed && !st.isWarmup).length, 0)
          : w.activity
          ? 4
          : 0,
      })),
    [plan]
  );
  // The form is unique to the athlete: seeded by when they started the plan.
  const identitySeed = plan.workouts.find((w) => w.session)?.session?.completedAt ?? 'treise';

  // Page background: canvas top tint fading to canvas base where the plan progress (first run) or phase cards start.
  const progressRef = useRef<HTMLElement>(null);
  const phasesTopRef = useRef<HTMLDivElement>(null);

  const togglePhase = (phase: number) => {
    triggerHaptic('light');
    setOpenPhases((open) => (open.includes(phase) ? open.filter((p) => p !== phase) : [...open, phase]));
  };

  const openWorkout = (w: PlanWorkoutOverview) => {
    triggerHaptic('light');
    if (w.isActive) {
      if (w.status === 'due') onLogActivity?.();
      return;
    }
    if (w.status === 'done' && w.session) {
      setViewing(w);
    } else if (w.status === 'next') {
      if (activeProgramWorkoutNumber === w.workoutNumber && onBackToWorkout) onBackToWorkout();
      else onLaunchWorkoutNumber?.(w.workoutNumber);
    }
  };

  const rowStyle: React.CSSProperties = {
    minHeight: 44,
    borderRadius: 12,
    paddingLeft: 16,
    paddingRight: 16,
    fontSize: 16,
    gap: 12,
  };

  return (
    <>
      <PageTopGradient
        markerRef={isFirstRun ? progressRef : phasesTopRef}
        fallbackRef={progressRef}
        deps={[isFirstRun]}
      />
      <header className="relative pt-2">
        <div className="relative flex items-center justify-start pr-12">
          <h1 className="wk-page-title">{formatSentenceCase(trainingPlan.name)}</h1>
          {headerAction}
        </div>
      </header>

      {isFirstRun && (
        <section aria-label="Your progress as an athlete" className="flex flex-col items-center">
          <div className="self-stretch -mx-4 -mt-1">
            <IdentityForm rings={identityRings} seed={identitySeed} total={TOTAL} readinessState={readinessState} />
          </div>
          <h2 className="wk-h1 -mt-3 text-center">
            Your new identity as an athlete is forming
          </h2>
          <div className="wk-card w-full mt-4 text-left">
            <span className="wk-label block mb-2" style={{ color: 'var(--wk-muted)' }}>
              Plan momentum
            </span>
            <CoachSummaryText
              text={identityMessage ?? identityFacts.fallback}
              swapKey={identityMessage ? 'model' : 'facts'}
              splitBy="sentences"
            />
          </div>
        </section>
      )}

      <section
        ref={progressRef}
        aria-label="Plan progress"
        className={isFirstRun ? 'mt-12' : 'mt-6'}
      >
        <div className="flex items-end justify-between gap-2">
          <span className="wk-title">
            Next: {formatSentenceCase(next.label)}
          </span>
          <span className="wk-number shrink-0 tabular-numbers" style={{ lineHeight: 1 }}>
            {plan.nextWorkoutNumber}/{TOTAL}
          </span>
        </div>
        <div
          className="wk-bar mt-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={TOTAL}
          aria-valuenow={plan.nextWorkoutNumber}
          aria-label="Plan progress"
        >
          <div style={{ width: `${(plan.nextWorkoutNumber / TOTAL) * 100}%` }} />
        </div>
        {onOpenCoach && activeOverrides.length === 0 && coachInterventions.length === 0 && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onOpenCoach();
            }}
            className="wk-btn-secondary w-full mt-4 min-h-[44px] inline-flex items-center justify-center gap-2"
            style={{ borderColor: 'rgb(var(--color-coach-accent-rgb) / 0.3)' }}
          >
            <Sparkles
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--color-coach-accent)' }}
              strokeWidth={2.2}
              aria-hidden="true"
            />
            <span>Adapt plan with Treise</span>
          </button>
        )}
      </section>

      {(onAcceptIntervention && onDismissIntervention) && (
        <ProgramAdaptationCarousel
          interventions={coachInterventions}
          onAccept={onAcceptIntervention}
          onDismiss={onDismissIntervention}
          className="mt-6"
        />
      )}

      {activeOverrides.length > 0 && (
        <section
          aria-labelledby="program-adaptations-title"
          className="wk-card mt-6 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="program-adaptations-title" className="wk-subhead">
              Program adaptations ({activeOverrides.length})
            </h2>
            {(onClearProgramOverrides || onOpenCoachIntervention) && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  if (onClearProgramOverrides) {
                    onClearProgramOverrides(trainingPlan.id);
                  } else {
                    onOpenCoachIntervention?.('Clear my program customizations');
                  }
                }}
                className="wk-caption font-medium min-h-[44px] px-2 -my-2 inline-flex items-center shrink-0"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Reset adaptations
              </button>
            )}
          </div>

          <ul className="flex flex-col">
            {activeOverrides.map((ov, idx) => (
              <li
                key={ov.id}
                className={`flex items-center justify-between gap-2 ${
                  idx > 0 ? 'pt-3 mt-3 border-t' : ''
                }`}
                style={idx > 0 ? { borderColor: 'var(--color-border-subtle)' } : undefined}
              >
                <div className="min-w-0">
                  <div className="wk-body" style={{ color: 'var(--color-text-primary)' }}>
                    {describeProgramOverride(ov, exerciseNameById)}
                  </div>
                  {ov.reason && (
                    <p className="wk-caption mt-1">{ov.reason}</p>
                  )}
                </div>
                {onRemoveProgramOverride && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onRemoveProgramOverride(ov.id);
                    }}
                    aria-label={`Remove adaptation: ${describeProgramOverride(ov, exerciseNameById)}`}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center shrink-0"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <WeeklyVolumeCard
        workouts={workouts}
        exerciseCatalog={exerciseCatalog}
        goalPhase={profile.goalPhase}
        className="mt-6"
      />

      <div ref={phasesTopRef} className="flex flex-col mt-8 gap-4">
        {trainingPlan.phases.map((phase) => {
          const isOpen = openPhases.includes(phase.phaseNumber);
          const phaseWorkouts = plan.workouts.filter((w) => w.phase === phase.phaseNumber);
          return (
            <div key={phase.phaseNumber}>
              <button
                type="button"
                onClick={() => togglePhase(phase.phaseNumber)}
                aria-expanded={isOpen}
                className="wk-card w-full text-left block"
              >
                <h2 className="wk-h1">
                  Phase {phase.phaseNumber}
                </h2>
                <p className="wk-body mt-2 max-w-prose">
                  {phase.planSummary}
                </p>
              </button>

              {isOpen && (
                <ol className="flex flex-col mt-4 mb-3 gap-2 px-4">
                  {phaseWorkouts.map((w) => {
                    const done = w.status === 'done';
                    const isNext = w.status === 'next';
                    const isDue = w.status === 'due' && Boolean(onLogActivity);
                    const name = `${w.workoutNumber}. ${formatSentenceCase(w.label)}`;
                    const content = (
                      <>
                        <span className="wk-subhead truncate">{name}</span>
                        {isNext && (
                          <span className="wk-pill shrink-0" style={{ color: 'var(--color-text-primary)' }}>
                            Up next
                          </span>
                        )}
                        {w.isActive && w.activity && (
                          <span className="wk-caption ml-auto shrink-0" style={{ color: 'var(--color-text-primary)' }}>
                            {describeActivity(w.activity)}
                          </span>
                        )}
                        {isDue && (
                          <span className="wk-caption shrink-0">
                            This week
                          </span>
                        )}
                        {((done && !w.isActive) || isNext || isDue) && (
                          <ChevronRight
                            className="wk-chevron ml-auto"
                            style={{ color: 'var(--color-text-primary)' }}
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                        )}
                      </>
                    );
                    return (
                      <li key={w.workoutNumber}>
                        {(done && !w.isActive) || isNext || isDue ? (
                          <button
                            type="button"
                            onClick={() => openWorkout(w)}
                            aria-label={
                              isDue
                                ? `${name}, this week. Log an active session`
                                : done
                                ? `${name}, completed. View workout`
                                : `${name}, up next. Open workout`
                            }
                            className="wk-hit w-full flex items-center text-left"
                            style={{
                              ...rowStyle,
                              background: done
                                ? 'var(--color-status-positive-soft)'
                                : isNext
                                ? 'var(--color-action-secondary-bg)'
                                : 'var(--wk-card)',
                              border: isNext ? '1px solid var(--color-border-strong)' : undefined,
                            }}
                          >
                            {content}
                          </button>
                        ) : (
                          <div className="flex items-center" style={{ ...rowStyle, background: done ? 'var(--color-status-positive-soft)' : 'var(--wk-card)' }}>
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
          session={workouts.find((w) => w.id === viewing.session!.id) ?? viewing.session}
          onSelectExercise={(ex) => setInspectedExerciseId(ex.exerciseId)}
          onSaveWorkout={onUpdatePastWorkout}
          onDeleteWorkout={onDeletePastWorkout}
          onClose={() => setViewing(null)}
        />
      )}

      {inspectedExercise && (
        <ExerciseDetailModal
          exercise={inspectedExercise.exercise}
          exerciseDef={inspectedExercise.exerciseDef}
          exerciseCatalog={exerciseCatalog}
          workouts={workouts}
          biometrics={biometrics}
          bodyweightKg={bodyweightKg}
          goalPhase={profile.goalPhase}
          readinessState={readinessState}
          intervention={coachInterventions.find((i) => i.exerciseId === inspectedExercise.exercise.exerciseId)}
          onAcceptIntervention={onAcceptIntervention}
          onDismissIntervention={onDismissIntervention}
          onAskCoach={
            onOpenCoachIntervention
              ? () =>
                  onOpenCoachIntervention(
                    `Review my progress and form cues for ${formatSentenceCase(inspectedExercise.exercise.name)}`
                  )
              : undefined
          }
          onClose={() => setInspectedExerciseId(null)}
        />
      )}
    </>
  );
};
