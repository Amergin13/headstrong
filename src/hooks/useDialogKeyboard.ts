import { useEffect } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="file"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function topDialog(): HTMLElement | null {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
  return dialogs.length ? dialogs[dialogs.length - 1] : null;
}

function focusableIn(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
}

/**
 * Keyboard and screen-reader behaviour for every dialog, in one place: focus moves into a dialog when
 * it opens and back when it closes, Tab stays inside it, and Escape closes it. A dialog with no close
 * button (such as onboarding) stays open. Focus goes to the dialog itself, not its first field, so a
 * phone's keyboard doesn't jump up.
 */
export function useDialogKeyboard(): void {
  useEffect(() => {
    let current: HTMLElement | null = null;
    let returnTo: HTMLElement | null = null;

    const syncFocus = () => {
      const dialog = topDialog();
      if (dialog === current) return;
      if (dialog) {
        if (!current) returnTo = document.activeElement as HTMLElement | null;
        if (!dialog.contains(document.activeElement)) {
          if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
          dialog.focus({ preventScroll: true });
        }
      } else if (returnTo?.isConnected) {
        returnTo.focus({ preventScroll: true });
        returnTo = null;
      } else {
        returnTo = null;
      }
      current = dialog;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const dialog = topDialog();
      if (!dialog) return;
      if (e.key === 'Escape') {
        const close = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
          /^(close|cancel)\b/i.test((b.getAttribute('aria-label') || b.textContent || '').trim())
        );
        if (close) {
          e.preventDefault();
          close.click();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusableIn(dialog);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active) || (e.shiftKey && (active === first || active === dialog))) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const observer = new MutationObserver(syncFocus);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('keydown', onKeyDown);
    syncFocus();
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
