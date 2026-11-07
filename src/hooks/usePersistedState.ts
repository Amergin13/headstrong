import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * useState that loads its initial value from storage once and saves on every change.
 *
 * Only real changes are written: a value that was just loaded (on mount or from another
 * tab) is never written back, so a tab holding an older copy can't overwrite data saved
 * in another tab, e.g. a weigh-in from the scale.
 *
 * A change here always wins over a message from another tab that arrives before it is saved:
 * it is saved in the same step as it is shown, and until then another tab's message is ignored
 * (that tab hears about this save and catches up). Otherwise a finished workout could be replaced
 * by the older copy just before it was written.
 */
export function usePersistedState<T>(
  load: () => T,
  save: (value: T) => void
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => load());
  const persistedRef = useRef<T>(value);
  const hasUnsavedChange = useRef(false);

  const setAndMark = useCallback<React.Dispatch<React.SetStateAction<T>>>((action) => {
    hasUnsavedChange.current = true;
    setValue(action);
  }, []);

  useLayoutEffect(() => {
    hasUnsavedChange.current = false;
    if (Object.is(value, persistedRef.current)) return;
    persistedRef.current = value;
    save(value);
  }, [value, save]);

  // Another tab saved: take its data instead of keeping (and later saving) a stale copy.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || hasUnsavedChange.current) return;
      const next = load();
      persistedRef.current = next;
      setValue(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [load]);

  return [value, setAndMark];
}
