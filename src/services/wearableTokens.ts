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

const latestByProvider = new Map<
  WearableTokenUpdate['provider'],
  { accessToken: string; refreshToken?: string }
>();
const replacedAccessTokensByProvider = new Map<WearableTokenUpdate['provider'], Set<string>>();

export function onWearableTokensRefreshed(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishRefreshedTokens(
  provider: WearableTokenUpdate['provider'],
  refreshed: { accessToken?: string; refreshToken?: string; expiresIn?: number } | null | undefined,
  previousAccessToken?: string
): void {
  if (!refreshed?.accessToken) return;
  let replacedSet = replacedAccessTokensByProvider.get(provider);
  if (!replacedSet) {
    replacedSet = new Set<string>();
    replacedAccessTokensByProvider.set(provider, replacedSet);
  }
  if (previousAccessToken) replacedSet.add(previousAccessToken);
  const prevLatest = latestByProvider.get(provider);
  if (prevLatest?.accessToken) replacedSet.add(prevLatest.accessToken);
  latestByProvider.set(provider, {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? prevLatest?.refreshToken,
  });

  const update: WearableTokenUpdate = {
    provider,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresIn: refreshed.expiresIn,
  };
  listeners.forEach((l) => l(update));
}

/**
 * Returns the newest rotated token pair if `accessToken` was already replaced earlier in this
 * session (before React state re-rendered `profile`), otherwise returns the passed pair.
 */
export function getLatestWearableTokens(
  provider: WearableTokenUpdate['provider'],
  accessToken?: string,
  refreshToken?: string
): { accessToken?: string; refreshToken?: string } {
  if (!accessToken) return { accessToken, refreshToken };
  const latest = latestByProvider.get(provider);
  const replacedSet = replacedAccessTokensByProvider.get(provider);
  if (latest && (accessToken === latest.accessToken || replacedSet?.has(accessToken))) {
    return {
      accessToken: latest.accessToken,
      refreshToken: latest.refreshToken ?? refreshToken,
    };
  }
  return { accessToken, refreshToken };
}

let whoopQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs Whoop API proxy calls one at a time so concurrent calls on launch never race with the same
 * single-use Whoop refresh token.
 */
export function serializeWhoopCall<T>(fn: () => Promise<T>): Promise<T> {
  const next = whoopQueue.then(fn, fn);
  whoopQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

