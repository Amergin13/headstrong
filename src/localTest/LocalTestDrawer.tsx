import React, { useEffect, useState } from 'react';
import { Beaker, CheckCircle2, ChevronDown, Database, RefreshCw, Sliders, Sparkles, Terminal, X } from 'lucide-react';
import {
  AppliedScenarioState,
  applyLocalTestScenario,
  applyReadinessPresetToBiometrics,
  getActiveLocalScenarioId,
  LOCAL_PENDING_TAB_KEY,
  LocalScenarioId,
  SCENARIO_LIST,
} from './testScenarios';
import {
  BiometricLog,
  GoalPhase,
  ReadinessState,
  TrainingLocation,
  UserProfile,
  WorkoutSession,
} from '../engine/types';
import { TrainingPlan } from '../engine/muscleBuildingProgram';
import { TabId } from '../components/common/NavigationBar';
import { exportAllUserDataJSON } from '../services/storage';

export interface LocalTestDrawerProps {
  profile: UserProfile;
  biometrics: BiometricLog[];
  workouts: WorkoutSession[];
  activeWorkout: WorkoutSession;
  activeTab: TabId;
  activePlan: TrainingPlan;
  nextWorkoutNumber: number;
  readinessState: ReadinessState;
  bodyweightEmaKg: number;
  recoveryReady: boolean;
  streakDays: number;
  onApplyScenario: (state: AppliedScenarioState) => void;
  onUpdateBiometrics: (next: BiometricLog[]) => void;
  onUpdateProfile: (next: Partial<UserProfile>) => void;
  onSwitchLocation: (loc: TrainingLocation) => void;
  onUpdateGoalPhase: (goal: GoalPhase) => void;
  onMarkAllActiveSetsDone: () => void;
  onNavigateTab: (tab: TabId) => void;
  onOpenCoach: () => void;
  onOpenOnboarding: () => void;
  onOpenWeightLog: () => void;
  onOpenWatchSync: () => void;
  onOpenLogActivity: () => void;
}

type DrawerTab = 'scenarios' | 'tweaks' | 'inspector';

export const LocalTestDrawer: React.FC<LocalTestDrawerProps> = ({
  profile,
  biometrics,
  workouts,
  activeWorkout,
  activeTab,
  activePlan,
  nextWorkoutNumber,
  readinessState,
  bodyweightEmaKg,
  recoveryReady,
  streakDays,
  onApplyScenario,
  onUpdateBiometrics,
  onUpdateProfile,
  onSwitchLocation,
  onUpdateGoalPhase,
  onMarkAllActiveSetsDone,
  onNavigateTab,
  onOpenCoach,
  onOpenOnboarding,
  onOpenWeightLog,
  onOpenWatchSync,
  onOpenLogActivity,
}) => {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState<DrawerTab>('scenarios');
  const [activeScenarioId, setActiveScenarioId] = useState<LocalScenarioId | null>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('scenario') as LocalScenarioId | null;
    if (fromUrl && SCENARIO_LIST.some((s) => s.id === fromUrl)) return fromUrl;
    return getActiveLocalScenarioId();
  });
  const [apiStatus, setApiStatus] = useState<Record<string, string>>({});
  const [checkingApis, setCheckingApis] = useState(false);
  const [coachProbeResult, setCoachProbeResult] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  useEffect(() => {
    try {
      const pending = sessionStorage.getItem(LOCAL_PENDING_TAB_KEY) as TabId | null;
      if (pending && ['train', 'program', 'analytics'].includes(pending)) {
        sessionStorage.removeItem(LOCAL_PENDING_TAB_KEY);
        onNavigateTab(pending);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkLocalApis = async () => {
    setCheckingApis(true);
    const routes = [
      '/api/coach/generate',
      '/api/whoop/token',
      '/api/fitbit/token',
      '/api/strava/token',
    ];
    const results: Record<string, string> = {};
    await Promise.all(
      routes.map(async (route) => {
        try {
          const res = await fetch(route);
          const json = await res.json().catch(() => null);
          if (res.ok && json) {
            const detail = json.configured ? `configured (${json.model || json.mode || 'ok'})` : 'reachable (unconfigured)';
            results[route] = `${res.status} · ${detail}`;
          } else {
            results[route] = `${res.status} · ${json?.error || 'error'}`;
          }
        } catch (err) {
          results[route] = `offline (${err instanceof Error ? err.message : 'failed'})`;
        }
      })
    );
    setApiStatus(results);
    setCheckingApis(false);
  };

  useEffect(() => {
    if (open && tab === 'inspector' && Object.keys(apiStatus).length === 0) {
      void checkLocalApis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  const selectScenario = (id: LocalScenarioId) => {
    const applied = applyLocalTestScenario(id);
    setActiveScenarioId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('scenario', id);
    url.searchParams.delete('tab');
    window.history.replaceState({}, '', url.toString());
    onApplyScenario(applied);
    setOpen(false);
  };

  const probeCoachPost = async () => {
    setCoachProbeResult('Testing POST /api/coach/generate...');
    try {
      const res = await fetch('/api/coach/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: 'Reply in one short sentence.',
          userPrompt: 'Say ready for training.',
          maxOutputTokens: 40,
        }),
      });
      const json = await res.json().catch(() => ({}));
      setCoachProbeResult(`${res.status}: ${json.text || json.error || JSON.stringify(json)}`);
    } catch (err) {
      setCoachProbeResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCopyBackup = async () => {
    try {
      await navigator.clipboard.writeText(exportAllUserDataJSON());
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      setCopiedJson(false);
    }
  };

  const activeMeta = SCENARIO_LIST.find((s) => s.id === activeScenarioId);
  const categories: Array<typeof SCENARIO_LIST[number]['category']> = [
    'Onboarding & Plan',
    'Recovery & Readiness',
    'Location & Units',
    'Standards & Cardio',
  ];

  return (
    <>
      <div
        className="fixed z-40 flex items-center gap-1.5"
        style={{
          left: 12,
          bottom: 'calc(92px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Local Test Lab"
          className="flex items-center gap-2 rounded-full border border-[#DC8748]/50 bg-[#1B2228]/95 text-[#F3EEE3] shadow-lg backdrop-blur-md transition hover:border-[#DC8748]"
          style={{
            padding: minimized ? '8px' : '7px 12px',
            fontSize: 12,
            minHeight: 36,
          }}
        >
          <Beaker className="h-4 w-4 text-[#DC8748] shrink-0" />
          {!minimized && (
            <span className="font-semibold tracking-tight max-w-[160px] truncate">
              {activeMeta ? `Test: ${activeMeta.title}` : 'Local Test Lab'}
            </span>
          )}
        </button>
        {!minimized && (
          <button
            type="button"
            onClick={() => setMinimized(true)}
            aria-label="Minimize test pill"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-[#1B2228]/90 text-white/70 hover:text-white"
            style={{ fontSize: 12 }}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Local Test Lab"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-3 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg max-h-[86vh] flex flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#161B20] text-[#F3EEE3] shadow-2xl"
            style={{ fontSize: 13 }}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#DC8748]/20 text-[#DC8748]">
                  <Beaker className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-bold text-white" style={{ fontSize: 14 }}>
                    Treise Local Test Lab
                  </div>
                  <div className="text-white/60" style={{ fontSize: 12 }}>
                    Isolated local copy · never bundled in production
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close Local Test Lab"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 border-b border-white/10 bg-[#111519] p-1.5">
              {(
                [
                  ['scenarios', 'Use Cases (13)', Sparkles],
                  ['tweaks', 'Live Tweaks', Sliders],
                  ['inspector', 'State & APIs', Database],
                ] as const
              ).map(([id, label, Icon]) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-2 font-semibold transition ${
                      active ? 'bg-[#262E36] text-white' : 'text-white/60 hover:text-white'
                    }`}
                    style={{ fontSize: 12 }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {tab === 'scenarios' && (
                <div className="space-y-4">
                  {categories.map((cat) => (
                    <div key={cat} className="space-y-2">
                      <div className="font-bold uppercase tracking-wider text-[#DC8748]" style={{ fontSize: 12 }}>
                        {cat}
                      </div>
                      <div className="space-y-2">
                        {SCENARIO_LIST.filter((s) => s.category === cat).map((s) => {
                          const isSelected = activeScenarioId === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => selectScenario(s.id)}
                              className={`w-full rounded-2xl border p-3 text-left transition ${
                                isSelected
                                  ? 'border-[#00F19F]/60 bg-[#00F19F]/10'
                                  : 'border-white/10 bg-[#1E252B] hover:border-white/25'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-white" style={{ fontSize: 13 }}>
                                  {s.title}
                                </span>
                                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-white/75" style={{ fontSize: 12 }}>
                                  {s.defaultTab}
                                </span>
                              </div>
                              <p className="mt-1 text-white/70" style={{ fontSize: 12 }}>
                                {s.summary}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'tweaks' && (
                <div className="space-y-4">
                  <div>
                    <div className="mb-1.5 font-bold text-white/80" style={{ fontSize: 12 }}>
                      Today Readiness Override ({readinessState})
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Primed', 'Normal', 'Amber Shield'] as ReadinessState[]).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => onUpdateBiometrics(applyReadinessPresetToBiometrics(biometrics, preset, bodyweightEmaKg))}
                          className={`rounded-xl border py-2 font-semibold ${
                            readinessState === preset
                              ? 'border-[#00F19F] bg-[#00F19F]/15 text-white'
                              : 'border-white/10 bg-[#1E252B] text-white/75'
                          }`}
                          style={{ fontSize: 12 }}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 font-bold text-white/80" style={{ fontSize: 12 }}>
                      Training Place ({profile.activeLocation || 'gym'})
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['gym', 'home', 'travel'] as TrainingLocation[]).map((loc) => (
                        <button
                          key={loc}
                          type="button"
                          onClick={() => onSwitchLocation(loc)}
                          className={`rounded-xl border py-2 font-semibold capitalize ${
                            (profile.activeLocation || 'gym') === loc
                              ? 'border-[#00F19F] bg-[#00F19F]/15 text-white'
                              : 'border-white/10 bg-[#1E252B] text-white/75'
                          }`}
                          style={{ fontSize: 12 }}
                        >
                          {loc}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="mb-1.5 font-bold text-white/80" style={{ fontSize: 12 }}>
                        Weight Unit ({profile.weightUnit || 'kg'})
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(['kg', 'lb'] as const).map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            onClick={() => onUpdateProfile({ weightUnit: unit })}
                            className={`rounded-xl border py-2 font-semibold uppercase ${
                              (profile.weightUnit || 'kg') === unit
                                ? 'border-[#00F19F] bg-[#00F19F]/15 text-white'
                                : 'border-white/10 bg-[#1E252B] text-white/75'
                            }`}
                            style={{ fontSize: 12 }}
                          >
                            {unit}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 font-bold text-white/80" style={{ fontSize: 12 }}>
                        Active Workout Helper
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onMarkAllActiveSetsDone();
                          setOpen(false);
                        }}
                        className="w-full rounded-xl border border-[#DC8748]/50 bg-[#DC8748]/15 py-2 font-semibold text-[#F3EEE3]"
                        style={{ fontSize: 12 }}
                      >
                        Tick All Sets Done
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 font-bold text-white/80" style={{ fontSize: 12 }}>
                      Goal Phase ({profile.goalPhase})
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Lean Bulk', 'Cut / Recomp', 'Maingain'] as GoalPhase[]).map((goal) => (
                        <button
                          key={goal}
                          type="button"
                          onClick={() => onUpdateGoalPhase(goal)}
                          className={`rounded-xl border py-2 font-semibold ${
                            profile.goalPhase === goal
                              ? 'border-[#00F19F] bg-[#00F19F]/15 text-white'
                              : 'border-white/10 bg-[#1E252B] text-white/75'
                          }`}
                          style={{ fontSize: 12 }}
                        >
                          {goal === 'Lean Bulk' ? 'Build Muscle' : goal === 'Cut / Recomp' ? 'Lose Fat' : 'Stay Lean'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 font-bold text-white/80" style={{ fontSize: 12 }}>
                      Jump To Screen / Modal
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['Workout Tab', () => onNavigateTab('train')],
                        ['Program Tab', () => onNavigateTab('program')],
                        ['Progress Tab', () => onNavigateTab('analytics')],
                        ['Treise AI Coach', onOpenCoach],
                        ['Onboarding Modal', onOpenOnboarding],
                        ['Weight Log Modal', onOpenWeightLog],
                        ['Watch Sync Modal', onOpenWatchSync],
                        ['Log Activity Modal', onOpenLogActivity],
                      ].map(([label, fn]) => (
                        <button
                          key={String(label)}
                          type="button"
                          onClick={() => {
                            (fn as () => void)();
                            setOpen(false);
                          }}
                          className="rounded-xl border border-white/10 bg-[#1E252B] px-3 py-2 text-left font-medium text-white/85 hover:border-white/25"
                          style={{ fontSize: 12 }}
                        >
                          {String(label)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'inspector' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-[#1E252B] p-3 space-y-1.5">
                    <div className="font-bold text-white" style={{ fontSize: 13 }}>
                      Live Engine State
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-white/75" style={{ fontSize: 12 }}>
                      <span>Tab: <strong className="text-white">{activeTab}</strong></span>
                      <span>Plan: <strong className="text-white">{activePlan.id}</strong></span>
                      <span>Next Workout #: <strong className="text-white">{nextWorkoutNumber}</strong></span>
                      <span>Active: <strong className="text-white">{activeWorkout.name}</strong></span>
                      <span>Completed: <strong className="text-white">{workouts.filter((w) => w.completed).length}</strong></span>
                      <span>Streak: <strong className="text-white">{streakDays}d</strong></span>
                      <span>Readiness: <strong className="text-white">{readinessState}</strong></span>
                      <span>Recovery Ready: <strong className="text-white">{String(recoveryReady)}</strong></span>
                      <span>BW EMA: <strong className="text-white">{bodyweightEmaKg.toFixed(1)} kg</strong></span>
                      <span>Biometrics: <strong className="text-white">{biometrics.length}d</strong></span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-[#1E252B] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-white" style={{ fontSize: 13 }}>
                        <Terminal className="h-4 w-4 text-[#DC8748]" />
                        <span>Local /api/* Proxies</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void checkLocalApis()}
                        className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-white/85 hover:bg-white/20"
                        style={{ fontSize: 12 }}
                      >
                        <RefreshCw className={`h-3 w-3 ${checkingApis ? 'animate-spin' : ''}`} />
                        <span>Check</span>
                      </button>
                    </div>
                    <div className="space-y-1 text-white/75" style={{ fontSize: 12 }}>
                      {Object.entries(apiStatus).map(([route, status]) => (
                        <div key={route} className="flex items-center justify-between gap-2">
                          <code className="text-[#8FD3FF]">{route}</code>
                          <span className="truncate text-right">{status}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void probeCoachPost()}
                      className="mt-1 w-full rounded-xl border border-white/15 bg-[#252D35] py-2 font-semibold text-white hover:bg-[#2E3842]"
                      style={{ fontSize: 12 }}
                    >
                      Probe POST /api/coach/generate
                    </button>
                    {coachProbeResult && (
                      <div className="rounded-xl bg-black/30 p-2 text-white/80 break-words" style={{ fontSize: 12 }}>
                        {coachProbeResult}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopyBackup()}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#1E252B] py-2.5 font-semibold text-white"
                      style={{ fontSize: 12 }}
                    >
                      {copiedJson && <CheckCircle2 className="h-3.5 w-3.5 text-[#00F19F]" />}
                      <span>{copiedJson ? 'Copied JSON' : 'Copy State JSON'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => selectScenario('fresh-onboarding')}
                      className="rounded-xl border border-[#FF8A94]/40 bg-[#FF8A94]/10 py-2.5 font-semibold text-[#FF8A94]"
                      style={{ fontSize: 12 }}
                    >
                      Reset to Clean Install
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
