import React, { useEffect, useRef, useState } from 'react';
import { Activity, Square } from 'lucide-react';

interface TempoPacerProps {
  /** 4-digit tempo code: lower, pause at bottom, lift, pause at top (e.g. "3110"). */
  tempo: string;
}

type Phase = { key: string; label: string; seconds: number; pulse: number[] };

/** Lift phases with haptic patterns: soft ticks while lowering, a strong buzz to drive the lift. */
export function buildTempoPhases(tempo: string): Phase[] {
  const [ecc, bottom, con, top] = tempo.split('').map((d) => (d === 'X' || d === 'x' ? 1 : parseInt(d, 10) || 0));
  const phases: Phase[] = [
    { key: 'lower', label: 'Lower', seconds: ecc, pulse: [12] },
    { key: 'bottom', label: 'Pause', seconds: bottom, pulse: [8] },
    { key: 'lift', label: 'Lift', seconds: Math.max(1, con), pulse: [45] },
    { key: 'top', label: 'Squeeze', seconds: top, pulse: [8] },
  ];
  return phases.filter((p) => p.seconds > 0);
}

function vibrate(pattern: number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    // Vibration not allowed here
  }
}

/**
 * Optional tempo guide. While running it buzzes at each phase change and ticks every second,
 * so the athlete can keep the prescribed tempo without watching the screen.
 */
export const TempoPacer: React.FC<TempoPacerProps> = ({ tempo }) => {
  const phases = buildTempoPhases(tempo);
  const [running, setRunning] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [secondInPhase, setSecondInPhase] = useState(0);
  const [rep, setRep] = useState(1);
  const stateRef = useRef({ phaseIdx: 0, second: 0, rep: 1 });

  useEffect(() => {
    if (!running || phases.length === 0) return;
    stateRef.current = { phaseIdx: 0, second: 0, rep: 1 };
    setPhaseIdx(0);
    setSecondInPhase(0);
    setRep(1);
    vibrate([60, 60, 60]); // "get ready" then first phase
    vibrate(phases[0].pulse);

    const timer = setInterval(() => {
      const st = stateRef.current;
      st.second += 1;
      if (st.second >= phases[st.phaseIdx].seconds) {
        st.second = 0;
        st.phaseIdx = (st.phaseIdx + 1) % phases.length;
        if (st.phaseIdx === 0) st.rep += 1;
        vibrate(phases[st.phaseIdx].pulse);
      } else if (phases[st.phaseIdx].key === 'lower') {
        vibrate([6]); // second-by-second tick while lowering
      }
      setPhaseIdx(st.phaseIdx);
      setSecondInPhase(st.second);
      setRep(st.rep);
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, tempo]);

  if (phases.length === 0) return null;
  const phase = phases[phaseIdx];

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.04]">
      <div className="text-xs text-slate-300 min-w-0" aria-live="polite">
        {running ? (
          <span>
            Rep {rep} • <strong className="text-white">{phase.label}</strong>{' '}
            <span className="font-mono">{phase.seconds - secondInPhase}s</span>
          </span>
        ) : (
          <span>
            Tempo guide: {phases.map((p) => `${p.label.toLowerCase()} ${p.seconds}s`).join(', ')}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setRunning((r) => !r)}
        aria-pressed={running}
        className={`shrink-0 min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
          running ? 'bg-brand-primary text-black' : 'bg-white/[0.08] text-slate-200 hover:bg-white/[0.14]'
        }`}
      >
        {running ? <Square className="w-3.5 h-3.5" aria-hidden="true" /> : <Activity className="w-3.5 h-3.5 stroke-[2]" aria-hidden="true" />}
        <span>{running ? 'Stop' : 'Pace me'}</span>
      </button>
    </div>
  );
};
