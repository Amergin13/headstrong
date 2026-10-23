/**
 * When a serverless proxy refreshes an expired Whoop or Fitbit token it returns the new pair.
 * Both providers rotate refresh tokens (each one works once), so the app must save the new pair
 * immediately or every later sync fails. Services publish here; App saves to the profile.
 */
export interface WearableTokenUpdate {
  provider: 'whoop' | 'fitbit';
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

type Listener = (update: WearableTokenUpdate) => void;
const listeners = new Set<Listener>();

export function onWearableTokensRefreshed(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishRefreshedTokens(
  provider: WearableTokenUpdate['provider'],
  refreshed: { accessToken?: string; refreshToken?: string; expiresIn?: number } | null | undefined
): void {
  if (!refreshed?.accessToken) return;
  const update: WearableTokenUpdate = {
    provider,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresIn: refreshed.expiresIn,
  };
  listeners.forEach((l) => l(update));
}
