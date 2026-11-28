import React, { useEffect, useState } from 'react';
import { Check, ChevronRight, Flame, MoreHorizontal } from 'lucide-react';
import { UserProfile, ReadinessState } from '../../engine/types';
import { triggerHaptic } from '../../utils/haptics';

export interface CardDrillInButtonProps {
  onClick: () => void;
  label: string;
  title?: string;
  stopPropagation?: boolean;
}

/** Canonical 44x44 bordered drill-in trigger shared across interactive cards. */
export const CardDrillInButton: React.FC<CardDrillInButtonProps> = ({
  onClick,
  label,
  title,
  stopPropagation = false,
}) => (
  <button
    type="button"
    onClick={(e) => {
      if (stopPropagation) e.stopPropagation();
      triggerHaptic('light');
      onClick();
    }}
    aria-label={label}
    title={title ?? label}
    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-[var(--color-border-strong)] inline-flex items-center justify-center shrink-0 transition-colors active:scale-95"
    style={{
      background: 'var(--color-action-secondary-bg)',
      color: 'var(--color-action-secondary-fg)',
      boxShadow: 'inset 0 1px 0 var(--color-rim-highlight)',
    }}
  >
    <ChevronRight className="wk-chevron" style={{ color: 'var(--color-action-secondary-fg)' }} strokeWidth={2} aria-hidden="true" />
  </button>
);

export interface OverflowMenuItem {
  id: string;
  label: string;
  detail?: string;
  trailing?: string;
  icon?: React.ReactNode;
  role?: 'menuitem' | 'menuitemradio';
  checked?: boolean;
  title?: string;
  ariaLabel?: string;
  sectionLabel?: string;
  sectionBorderTop?: boolean;
  onSelect: () => void;
}

export interface OverflowMenuProps {
  items: OverflowMenuItem[];
  triggerAriaLabel: string;
  menuAriaLabel: string;
  triggerTitle?: string;
}

/** Unified 44x44 overflow button + role="menu" popover shared across page & card headers. */
export const OverflowMenu: React.FC<OverflowMenuProps> = ({
  items,
  triggerAriaLabel,
  menuAriaLabel,
  triggerTitle,
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="relative inline-flex items-center shrink-0">
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setOpen((o) => !o);
        }}
        aria-label={triggerAriaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={triggerTitle ?? triggerAriaLabel}
        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-[var(--color-border-strong)] inline-flex items-center justify-center shrink-0 transition-colors active:scale-95"
        style={{
          background: 'var(--color-action-secondary-bg)',
          color: 'var(--color-action-secondary-fg)',
          boxShadow: 'inset 0 1px 0 var(--color-rim-highlight)',
        }}
      >
        <MoreHorizontal className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full mt-2 z-30">
            <div
              role="menu"
              aria-label={menuAriaLabel}
              className="w-60 rounded-2xl bg-surface-card border shadow-2xl p-2 space-y-1 text-left"
              style={{ borderColor: 'var(--color-border-subtle)' }}
            >
              {items.map((item) => {
                const isSelected = Boolean(item.checked);
                const buttonEl = (
                  <button
                    key={item.id}
                    type="button"
                    role={item.role ?? 'menuitem'}
                    aria-checked={item.role === 'menuitemradio' ? isSelected : undefined}
                    aria-label={item.ariaLabel}
                    title={item.title}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl min-h-[44px] flex items-center justify-between gap-2 transition-colors hover:bg-[var(--wk-raised)]"
                    style={{
                      background: isSelected ? 'var(--wk-raised)' : undefined,
                      color:
                        item.role === 'menuitemradio' && !isSelected
                          ? 'var(--color-text-secondary)'
                          : 'var(--color-text-primary)',
                    }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {item.icon && <span className="shrink-0 inline-flex items-center">{item.icon}</span>}
                      <span className="min-w-0">
                        <span className="wk-subhead block truncate" style={{ color: 'inherit' }}>
                          {item.label}
                        </span>
                        {item.detail && (
                          <span className="wk-caption block truncate" style={{ color: 'var(--color-text-muted)' }}>
                            {item.detail}
                          </span>
                        )}
                      </span>
                    </span>
                    {item.trailing && (
                      <span className="wk-caption tabular-numbers shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                        {item.trailing}
                      </span>
                    )}
                    {item.role === 'menuitemradio' && isSelected && (
                      <Check
                        className="w-4 h-4 stroke-[2.5] shrink-0"
                        style={{ color: 'var(--color-text-primary)' }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );

                if (item.sectionLabel || item.sectionBorderTop) {
                  return (
                    <div
                      key={item.id}
                      className={item.sectionBorderTop ? 'pt-2 space-y-1' : 'space-y-1'}
                      style={
                        item.sectionBorderTop
                          ? { borderTop: '1px solid var(--color-border-subtle)' }
                          : undefined
                      }
                    >
                      {item.sectionLabel && <div className="px-3 py-2 wk-label">{item.sectionLabel}</div>}
                      {buttonEl}
                    </div>
                  );
                }
                return buttonEl;
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export interface InterventionActionBarProps {
  applied: boolean;
  onAccept: () => void;
  onDismiss: () => void;
  disabled?: boolean;
  appliedLabel?: string;
  acceptLabel?: string;
  dismissLabel?: string;
  acceptAriaLabel?: string;
  dismissAriaLabel?: string;
}

/** Shared 48px Accept / Dismiss CTA pair and "Applied to your plan" receipt strip. */
export const InterventionActionBar: React.FC<InterventionActionBarProps> = ({
  applied,
  onAccept,
  onDismiss,
  disabled = false,
  appliedLabel = 'Applied to your plan',
  acceptLabel = 'Accept',
  dismissLabel = 'Dismiss',
  acceptAriaLabel,
  dismissAriaLabel,
}) => {
  if (applied) {
    return (
      <div
        className="wk-raised flex items-center gap-2 border"
        style={{
          background: 'var(--color-status-positive-soft)',
          borderColor: 'var(--color-border-accent)',
        }}
        role="status"
      >
        <Check
          className="w-4 h-4 shrink-0"
          style={{ color: 'var(--color-status-positive)' }}
          strokeWidth={2.5}
          aria-hidden="true"
        />
        <span className="wk-subhead" style={{ color: 'var(--color-status-positive)' }}>
          {appliedLabel}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          triggerHaptic('medium');
          onAccept();
        }}
        disabled={disabled}
        aria-label={acceptAriaLabel}
        className="wk-button flex-1 transition-all active:scale-[0.98] disabled:opacity-45"
        style={{
          background: 'var(--color-action-primary-bg)',
          color: 'var(--color-action-primary-fg)',
        }}
      >
        <Check className="w-4 h-4 shrink-0 mr-2" strokeWidth={2.5} aria-hidden="true" />
        <span>{acceptLabel}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onDismiss();
        }}
        aria-label={dismissAriaLabel}
        className="wk-btn-secondary px-4 shrink-0 transition-all active:scale-[0.98]"
        style={{ minHeight: 48, height: 48 }}
      >
        {dismissLabel}
      </button>
    </div>
  );
};

interface HeaderProps {
  profile: UserProfile;
  readinessState?: ReadinessState;
  onOpenWatchSync?: () => void;
  onOpenAuth?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  profile,
  onOpenAuth,
}) => {
  return (
    <header
      className="relative py-3"
      style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
    >
      <div
        className="max-w-md mx-auto flex items-center justify-between"
        style={{ paddingLeft: 'var(--space-4)', paddingRight: 'var(--space-4)' }}
      >
        <span
          className="wk-h1"
          style={{ color: 'var(--color-coach-surface)' }}
        >
          Treise<span style={{ color: 'var(--color-coach-accent)' }}>.</span>
        </span>

        {/* Right Status Actions */}
        <div className="flex items-center gap-2">
          {/* Streak Badge */}
          <div
            className="wk-pill gap-1"
            style={{ color: 'var(--color-text-primary)' }}
            aria-label={`${profile.streakDays} day workout streak`}
          >
            <Flame className="w-3.5 h-3.5 fill-current stroke-[2]" />
            <span className="tabular-numbers">{profile.streakDays}d</span>
          </div>

          {/* Google Account / Avatar Button */}
          {onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="relative w-11 h-11 rounded-full flex items-center justify-center transition-colors min-h-[44px] min-w-[44px]"
              style={{ background: 'var(--wk-card)' }}
              aria-label={profile.email ? `Profile and settings (${profile.email})` : 'Profile and settings'}
            >
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="w-8 h-8 rounded-full object-cover"
                  style={{ border: '1px solid var(--color-border-strong)' }}
                />
              ) : (
                <span className="wk-label">
                  {profile.name !== 'Athlete' ? profile.name.charAt(0) : 'G'}
                </span>
              )}
              {profile.email && (
                <span
                  className="absolute bottom-1 right-1 w-2 h-2 rounded-full ring-2 ring-surface-canvas"
                  style={{ background: 'var(--wk-accent)' }}
                />
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};


