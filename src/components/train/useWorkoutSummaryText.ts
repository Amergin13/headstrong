import { useEffect, useState } from 'react';
import { WorkoutFinish, cacheWorkoutSummary, generateWorkoutSummary, getCachedWorkoutSummary } from '../../services/workoutFinish';

/**
 * The summary to show for a finished workout: the fact-based text straight away, replaced by the
 * on-device model's version when one is saved or gets written (same facts, same checks). The finish
 * screen and the Workout tab share it, so both show the same words.
 */
export function useWorkoutSummaryText(finish: Pick<WorkoutFinish, 'facts' | 'fallback'> | null): string {
  const factsKey = finish ? finish.facts.join('|') : '';
  const [written, setWritten] = useState<string | null>(() => (finish ? getCachedWorkoutSummary(finish) : null));

  useEffect(() => {
    if (!finish) return;
    const cached = getCachedWorkoutSummary(finish);
    setWritten(cached);
    if (cached) return;
    let cancelled = false;
    generateWorkoutSummary(finish)
      .then((answer) => {
        if (!answer) return;
        cacheWorkoutSummary(finish, answer);
        if (!cancelled) setWritten(answer);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // The facts identify the summary; a re-render with the same facts must not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factsKey]);

  return written ?? finish?.fallback ?? '';
}
