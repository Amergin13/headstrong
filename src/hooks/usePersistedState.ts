import React, { useEffect, useState } from 'react';

/**
 * useState that loads its initial value from storage once and saves on every change.
 */
export function usePersistedState<T>(
  load: () => T,
  save: (value: T) => void
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(load);
  useEffect(() => {
    save(value);
  }, [value, save]);
  return [value, setValue];
}
