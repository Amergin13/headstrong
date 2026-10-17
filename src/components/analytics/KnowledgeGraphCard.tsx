import React, { useState, useMemo } from 'react';
import {
  BiometricLog,
  ExerciseDefinition,
  UserProfile,
  WorkoutSession,
} from '../../engine/types';
import {
  buildAthleteKnowledgeGraph,
  KgNode,
} from '../../engine/knowledgeGraph';
import { triggerHaptic } from '../../utils/haptics';
import {
  Sparkles,
  Zap,
  HeartPulse,
} from 'lucide-react';

interface KnowledgeGraphCardProps {
  workouts: WorkoutSession[];
  biometrics: BiometricLog[];
  exerciseCatalog: ExerciseDefinition[];
  profile: UserProfile;
  weeklyVolume: Record<string, number>;
}

type InsightTabMode = 'overview' | 'joints' | 'targets';

export const KnowledgeGraphCard: React.FC<KnowledgeGraphCardProps> = ({
  workouts,
  biometrics,
  exerciseCatalog,
  profile,
  weeklyVolume,
}) => {
  const pkg = useMemo(
    () =>
      buildAthleteKnowledgeGraph(
        workouts,
        biometrics,
        exerciseCatalog,
        profile,
        weeklyVolume
      ),
    [workouts, biometrics, exerciseCatalog, profile, weeklyVolume]
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string>('node-athlete');
  const [viewMode, setViewMode] = useState<InsightTabMode>('overview');

  const selectedNode: KgNode =
    pkg.nodes.find((n) => n.id === selectedNodeId) || pkg.nodes[0];

  const nodePositions: Record<string, { x: number; y: number }> = {
    'node-athlete': { x: 180, y: 110 },
    'node-biometrics': { x: 68, y: 46 },
    'node-delts-calves': { x: 292, y: 46 },
    'node-anterior-chain': { x: 64, y: 168 },
    'node-posterior-chain': { x: 296, y: 168 },
    'node-joints': { x: 180, y: 192 },
  };

  return (
    <div className="rounded-3xl surface-glass p-4 border border-white/[0.08] space-y-3.5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <HeartPulse className="w-4 h-4 text-brand-primary stroke-[2]" />
            <h3 className="font-bold text-base text-white tracking-tight">
              Recovery &amp; Body Insights
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            How your sleep, joints, and weekly workouts work together
          </p>
        </div>
      </div>

      {/* Top Summary Strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-2xl bg-black/50 border border-white/[0.06] text-center">
          <div className="text-xs text-slate-400 font-semibold">
            Full-Stretch Sets
          </div>
          <div className="text-sm font-mono font-bold text-brand-primary mt-0.5">
            {pkg.lengthenedStimulusRatio}%
          </div>
          <div className="text-xs text-slate-400">of weekly sets</div>
        </div>

        <div className="p-2.5 rounded-2xl bg-black/50 border border-white/[0.06] text-center">
          <div className="text-xs text-slate-400 font-semibold">
            Lower Back Load
          </div>
          <div
            className={`text-sm font-mono font-bold mt-0.5 ${
              pkg.systemicAxialLoadScore > 75 ? 'text-amber-400' : 'text-white'
            }`}
          >
            {pkg.systemicAxialLoadScore}%
          </div>
          <div className="text-xs text-slate-400">heavy lifts</div>
        </div>

        <div className="p-2.5 rounded-2xl bg-black/50 border border-white/[0.06] text-center">
          <div className="text-xs text-slate-400 font-semibold">
            Recovery Score
          </div>
          <div className="text-sm font-mono font-bold text-brand-primary mt-0.5">
            {pkg.recoveryEfficiencyScore}/100
          </div>
          <div className="text-xs text-slate-400">readiness</div>
        </div>
      </div>

      {/* View Mode Switcher */}
      <div className="grid grid-cols-2 gap-1 bg-black/50 p-1 rounded-2xl border border-white/[0.06]">
        {(
          [
            { id: 'overview', label: 'Recovery Overview' },
            { id: 'joints', label: 'Joint Health (5)' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setViewMode(tab.id);
            }}
            className={`py-2 rounded-xl text-xs font-bold transition-all ${
              viewMode === tab.id
                ? 'bg-brand-primary text-black shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW & COACHING TAKEAWAYS */}
      {viewMode === 'overview' && (
        <div className="space-y-3">
          {/* Interactive Body & Recovery Map */}
          <div className="relative rounded-2xl bg-black/70 border border-white/[0.07] overflow-hidden p-2.5">
            <div className="flex items-center justify-between px-1.5 pt-0.5 text-xs text-slate-400">
              <span>Tap any circle to view details</span>
              <span className="font-mono text-brand-primary font-semibold">
                {selectedNode.label}
              </span>
            </div>

            <svg
              viewBox="0 0 360 225"
              className="w-full h-52 select-none"
              role="img"
              aria-label="Recovery and Body Balance Map"
            >
              <defs>
                <radialGradient id="athleteGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#00F59B" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#00F59B" stopOpacity="0" />
                </radialGradient>
              </defs>

              <circle cx="180" cy="110" r="55" fill="url(#athleteGlow)" />

              {/* Connections */}
              {pkg.edges.map((edge) => {
                const src = nodePositions[edge.source];
                const tgt = nodePositions[edge.target];
                if (!src || !tgt) return null;

                const isHighlighted =
                  selectedNodeId === edge.source || selectedNodeId === edge.target;

                const strokeColor =
                  edge.relation === 'LOADS_JOINT'
                    ? '#F59E0B'
                    : edge.relation === 'MODULATES_RECOVERY'
                    ? '#06B6D4'
                    : '#00F59B';

                return (
                  <g key={edge.id}>
                    <line
                      x1={src.x}
                      y1={src.y}
                      x2={tgt.x}
                      y2={tgt.y}
                      stroke={strokeColor}
                      strokeOpacity={isHighlighted ? 0.75 : 0.22}
                      strokeWidth={isHighlighted ? 2.2 : 1.2}
                      strokeDasharray={edge.relation === 'LOADS_JOINT' ? '3 3' : undefined}
                    />
                  </g>
                );
              })}

              {/* Interactive Circles */}
              {pkg.nodes.map((node) => {
                const pos = nodePositions[node.id] || { x: 180, y: 110 };
                const isSelected = node.id === selectedNodeId;
                const isCenter = node.id === 'node-athlete';
                const radius = isCenter ? 26 : 21;

                const ringColor =
                  node.status === 'warning'
                    ? '#F43F5E'
                    : node.status === 'elevated'
                    ? '#F59E0B'
                    : node.category === 'biometric'
                    ? '#06B6D4'
                    : '#00F59B';

                return (
                  <g
                    key={node.id}
                    onClick={() => {
                      triggerHaptic('light');
                      setSelectedNodeId(node.id);
                    }}
                    className="cursor-pointer"
                  >
                    {isSelected && (
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={radius + 5}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth="1.5"
                        strokeOpacity="0.6"
                      />
                    )}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={radius}
                      fill="#0E1117"
                      stroke={ringColor}
                      strokeWidth={isSelected ? '2.5' : '1.5'}
                    />
                    <text
                      x={pos.x}
                      y={pos.y - 2}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize={isCenter ? '10' : '8.5'}
                      fontWeight="700"
                    >
                      {node.label}
                    </text>
                    <text
                      x={pos.x}
                      y={pos.y + 9}
                      textAnchor="middle"
                      fill="#94A3B8"
                      fontSize="7.5"
                      fontFamily="monospace"
                    >
                      {node.subtitle}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Selected Area Detail Box */}
            <div className="p-3 rounded-xl bg-surface-elevated/90 border border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">
                  {selectedNode.label}
                </span>
                <span className="text-xs font-mono text-brand-primary font-bold">
                  Score: {selectedNode.score}/100
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-snug">
                {selectedNode.detailText}
              </p>
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {Object.entries(selectedNode.metrics).map(([k, v]) => (
                  <div
                    key={k}
                    className="p-2 rounded-lg bg-black/50 border border-white/[0.05] text-center"
                  >
                    <div className="text-xs text-slate-400 truncate">{k}</div>
                    <div className="text-xs font-mono font-bold text-white mt-0.5">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Coaching Takeaways */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-300 px-1">
              What We Noticed From Your Recent Workouts
            </h4>

            {pkg.insights.map((ins) => (
              <div
                key={ins.id}
                className="p-3.5 rounded-2xl bg-black/45 border border-white/[0.07] space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-brand-primary shrink-0 stroke-[2]" />
                    <span className="text-sm font-bold text-white">{ins.title}</span>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                    {ins.impactMetric}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {ins.narrative}
                </p>
                <div className="pt-1 flex items-start space-x-1.5 text-xs text-brand-primary font-medium">
                  <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5 stroke-[2]" />
                  <span>{ins.actionableStep}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: JOINT HEALTH */}
      {viewMode === 'joints' && (
        <div className="space-y-2.5">
          <p className="text-xs text-slate-400 px-1">
            Monitors weekly stress on your joints and lower back so you can switch to joint-friendly equipment before soreness builds up.
          </p>

          {pkg.joints.map((j) => {
            const isHigh = j.status === 'High Strain Alert';
            const isMod = j.status === 'Moderate Load';

            return (
              <div
                key={j.joint}
                className="p-3.5 rounded-2xl bg-black/45 border border-white/[0.07] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">{j.joint}</span>
                  <span
                    className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                      isHigh
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        : isMod
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-brand-primary/15 text-brand-primary border-brand-primary/30'
                    }`}
                  >
                    {j.status}
                  </span>
                </div>

                <div className="w-full bg-black/60 h-2 rounded-full overflow-hidden border border-white/[0.05]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isHigh
                        ? 'bg-rose-500'
                        : isMod
                        ? 'bg-amber-400'
                        : 'bg-brand-primary'
                    }`}
                    style={{ width: `${j.strainScore}%` }}
                  />
                </div>

                <div className="text-xs text-slate-400">
                  Main exercises: <span className="text-slate-200 font-medium">{j.topContributors.join(', ')}</span>
                </div>

                <p className="text-xs text-slate-300 leading-snug">
                  {j.biomechanicalAdvice}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: PERSONALIZED MUSCLE SET TARGETS */}
      {viewMode === 'targets' && (
        <div className="space-y-2.5">
          <p className="text-xs text-slate-400 px-1">
            Adjusts your weekly set targets based on your sleep, recovery, and recent strength gains.
          </p>

          {pkg.muscleProfiles.map((mp) => (
            <div
              key={mp.muscleKey}
              className="p-3.5 rounded-2xl bg-black/45 border border-white/[0.07] space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{mp.displayName}</span>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                  Target: {mp.personalizedMav[0]}–{mp.personalizedMav[1]} sets/wk
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Logged: {mp.weeklySets} sets/wk</span>
                <span className="text-brand-primary font-mono font-semibold">
                  +{mp.e1rmVelocityPct}% strength (6 wks)
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-snug pt-0.5">
                {mp.recommendation}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
