import React, { useState } from 'react';
import {
  COMPETITOR_COMPARISON_MATRIX,
  CompetitorRating,
  GovernanceChangeItem,
  GovernanceStatus,
  loadGovernanceItems,
  saveGovernanceItems,
} from '../../engine/governance';
import {
  Lock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  ShieldCheck,
  Table,
  FileCode,
} from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

interface ProductGovernanceModalProps {
  onClose: () => void;
}

const STATUS_META: Record<
  GovernanceStatus,
  {
    label: string;
    badgeClass: string;
    Icon: React.FC<{ className?: string }>;
  }
> = {
  locked: {
    label: 'Locked & Verified',
    badgeClass: 'bg-brand-primary/15 border-brand-primary/40 text-brand-primary',
    Icon: Lock,
  },
  progressing: {
    label: 'Progressing',
    badgeClass: 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300',
    Icon: RefreshCw,
  },
  under_review: {
    label: 'Under Review',
    badgeClass: 'bg-amber-500/15 border-amber-400/40 text-amber-300',
    Icon: AlertTriangle,
  },
};

const RATING_BADGE: Record<
  CompetitorRating,
  { label: string; className: string }
> = {
  leader: {
    label: '✓ Full',
    className: 'bg-brand-primary/15 text-brand-primary border-brand-primary/30',
  },
  partial: {
    label: '◐ Partial',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  none: {
    label: '✕ None',
    className: 'bg-white/[0.06] text-slate-400',
  },
};

export const ProductGovernanceModal: React.FC<ProductGovernanceModalProps> = ({
  onClose,
}) => {
  const [activeView, setActiveView] = useState<'matrix' | 'ledger'>('matrix');
  const [statusFilter, setStatusFilter] = useState<'all' | GovernanceStatus>('all');
  const [items, setItems] = useState<GovernanceChangeItem[]>(loadGovernanceItems);

  const handleSetItemStatus = (id: string, nextStatus: GovernanceStatus) => {
    triggerHaptic('light');
    const updated = items.map((item) =>
      item.id === id ? { ...item, status: nextStatus } : item
    );
    setItems(updated);
    saveGovernanceItems(updated);
  };

  const lockedCount = items.filter((i) => i.status === 'locked').length;
  const progressingCount = items.filter((i) => i.status === 'progressing').length;
  const reviewCount = items.filter((i) => i.status === 'under_review').length;

  const filteredItems =
    statusFilter === 'all'
      ? items
      : items.filter((i) => i.status === statusFilter);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="governance-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md"
    >
      <div className="w-full max-w-2xl rounded-3xl bg-[#0E1219] p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-primary/15 flex items-center justify-center text-brand-primary shrink-0">
              <ShieldCheck className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h2
                id="governance-modal-title"
                className="font-bold text-base text-white tracking-tight"
              >
                Product Governance &amp; Competitor Matrix
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Track what is Locked, Progressing, or Under Review with full rationale
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Close governance matrix"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3.5 rounded-2xl bg-[#141824]">
            <div className="flex items-center space-x-1.5 text-brand-primary text-xs font-bold">
              <Lock className="w-3.5 h-3.5 stroke-[2]" />
              <span>Locked</span>
            </div>
            <div className="font-mono font-bold text-lg text-white mt-0.5">
              {lockedCount}
            </div>
            <div className="text-xs text-slate-300">
              Protected by CI tests
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#141824]">
            <div className="flex items-center space-x-1.5 text-cyan-300 text-xs font-bold">
              <RefreshCw className="w-3.5 h-3.5 stroke-[2]" />
              <span>Progressing</span>
            </div>
            <div className="font-mono font-bold text-lg text-white mt-0.5">
              {progressingCount}
            </div>
            <div className="text-xs text-slate-300">
              Active refinement
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#141824]">
            <div className="flex items-center space-x-1.5 text-amber-300 text-xs font-bold">
              <AlertTriangle className="w-3.5 h-3.5 stroke-[2]" />
              <span>Under Review</span>
            </div>
            <div className="font-mono font-bold text-lg text-white mt-0.5">
              {reviewCount}
            </div>
            <div className="text-xs text-slate-300">
              Needs UX tuning
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-[#090C12]">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setActiveView('matrix');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all ${
              activeView === 'matrix'
                ? 'bg-brand-primary text-black shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Table className="w-3.5 h-3.5 stroke-[2]" />
            <span>Competitor Comparison Matrix</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setActiveView('ledger');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all ${
              activeView === 'ledger'
                ? 'bg-brand-primary text-black shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 stroke-[2]" />
            <span>Change Ledger &amp; Lock Controls ({items.length})</span>
          </button>
        </div>

        {/* VIEW 1: COMPETITOR COMPARISON MATRIX */}
        {activeView === 'matrix' && (
          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-[#090C12] text-xs text-slate-300 leading-relaxed">
              Benchmarks <strong className="text-white">HeadStrong</strong> against{' '}
              <strong className="text-white">RP Hypertrophy</strong>,{' '}
              <strong className="text-white">Fitbod</strong>,{' '}
              <strong className="text-white">Hevy / Strong</strong>, and{' '}
              <strong className="text-white">Whoop / Athlytic</strong> across our core value proposition: telling you what to do from session to session across any equipment setup.
            </div>

            <div className="space-y-3">
              {COMPETITOR_COMPARISON_MATRIX.map((row) => {
                const statusInfo = STATUS_META[row.governanceStatus];
                const StatusIcon = statusInfo.Icon;

                return (
                  <div
                    key={row.id}
                    className="p-4 sm:p-5 rounded-2xl bg-[#141824] space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-semibold text-slate-400 block">
                          {row.category}
                        </span>
                        <h3 className="text-sm font-bold text-white mt-0.5">
                          {row.feature}
                        </h3>
                        <p className="text-xs text-slate-300 mt-0.5">
                          {row.userValueProposition}
                        </p>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center space-x-1 shrink-0 ${statusInfo.badgeClass}`}
                      >
                        <StatusIcon className="w-3 h-3 stroke-[2]" />
                        <span>{statusInfo.label}</span>
                      </span>
                    </div>

                    {/* Competitor Comparison Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2 border-t border-white/[0.04] text-xs">
                      {(
                        [
                          { key: 'headstrong', name: 'HeadStrong', data: row.headstrong, highlight: true },
                          { key: 'rp', name: 'RP App', data: row.rpHypertrophy, highlight: false },
                          { key: 'fitbod', name: 'Fitbod', data: row.fitbod, highlight: false },
                          { key: 'hevy', name: 'Hevy / Strong', data: row.hevyStrong, highlight: false },
                          { key: 'whoop', name: 'Whoop', data: row.whoopAthlytic, highlight: false },
                        ] as const
                      ).map((comp) => {
                        const badge = RATING_BADGE[comp.data.rating];
                        return (
                          <div
                            key={comp.key}
                            className={`p-3 rounded-xl space-y-1 ${
                              comp.highlight
                                ? 'bg-brand-primary/[0.08]'
                                : 'bg-[#090C12]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-white text-xs">
                                {comp.name}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-xs font-semibold ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 leading-snug">
                              {comp.data.summary}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 2: CHANGE LEDGER & GOVERNANCE LOCK CONTROLS */}
        {activeView === 'ledger' && (
          <div className="space-y-3">
            {/* Filter Pills */}
            <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-[#090C12]">
              {(
                [
                  { id: 'all', label: 'All Changes' },
                  { id: 'locked', label: 'Locked' },
                  { id: 'progressing', label: 'Progressing' },
                  { id: 'under_review', label: 'Under Review' },
                ] as const
              ).map((tab) => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setStatusFilter(tab.id);
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                      active
                        ? 'bg-brand-primary text-black'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              {filteredItems.map((item) => {
                const statusInfo = STATUS_META[item.status];
                const StatusIcon = statusInfo.Icon;

                return (
                  <div
                    key={item.id}
                    className="p-4 sm:p-5 rounded-2xl bg-[#141824] space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-semibold text-slate-400">
                          {item.category} • {item.versionIntroduced}
                        </span>
                        <h3 className="text-sm font-bold text-white mt-0.5">
                          {item.title}
                        </h3>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center space-x-1 shrink-0 ${statusInfo.badgeClass}`}
                      >
                        <StatusIcon className="w-3 h-3 stroke-[2]" />
                        <span>{statusInfo.label}</span>
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="p-3 rounded-xl bg-[#090C12]">
                        <span className="font-bold text-white block">
                          Rationale (Why this change was made):
                        </span>
                        <p className="text-slate-300 mt-0.5 leading-relaxed">
                          {item.rationale}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="p-3 rounded-xl bg-brand-primary/[0.08]">
                          <span className="font-bold text-brand-primary block">
                            ✓ What Worked Well:
                          </span>
                          <p className="text-slate-200 mt-0.5 leading-relaxed">
                            {item.whatWorkedWell}
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-amber-500/[0.1]">
                          <span className="font-bold text-amber-300 block">
                            ⚠ Critique &amp; Governance Watch:
                          </span>
                          <p className="text-slate-200 mt-0.5 leading-relaxed">
                            {item.critiqueAndRisks}
                          </p>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-[#090C12] flex items-start space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-primary shrink-0 mt-0.5 stroke-[2]" />
                        <div>
                          <span className="font-bold text-white">
                            Automated Guardrail Rule:{' '}
                          </span>
                          <span className="text-slate-300">{item.lockedInvariant}</span>
                        </div>
                      </div>
                    </div>

                    {/* Interactive Governance Status Controls */}
                    <div className="pt-2 border-t border-white/[0.04] flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-400 font-mono">
                        Files: {item.files.join(', ')}
                      </span>

                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs text-slate-400 mr-1">Set Status:</span>
                        {(
                          [
                            { id: 'locked', label: 'Lock' },
                            { id: 'progressing', label: 'Progressing' },
                            { id: 'under_review', label: 'Review' },
                          ] as const
                        ).map((st) => {
                          const isCurrent = item.status === st.id;
                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => handleSetItemStatus(item.id, st.id)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                isCurrent
                                  ? 'bg-brand-primary text-black'
                                  : 'bg-[#090C12] text-slate-300 hover:text-white'
                              }`}
                            >
                              {st.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
