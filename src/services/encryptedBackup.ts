/**
 * Opt-in client-side encrypted backup for Treise.
 *
 * Preserves local-first offline execution: all workout logs, biometrics, and profile data
 * remain stored on-device and work 100% offline. When an athlete explicitly opts in, Treise
 * encrypts their JSON backup locally with AES-256-GCM (key derived via PBKDF2-SHA256,
 * 210,000 iterations) before uploading it to the athlete's own private Google Drive
 * `appDataFolder` (`https://www.googleapis.com/auth/drive.appdata`).
 *
 * Zero server storage and zero client secrets: encrypted blobs go directly from the
 * browser/PWA to the athlete's Google Drive app-data folder over HTTPS.
 */
import { GOOGLE_AUTH_CONFIG, isGoogleClientConfigured, loadGoogleIdentityServicesScript } from './googleAuthService';

export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const DRIVE_BACKUP_FILENAME = 'treise-backup-v1.enc.json';
export const BACKUP_KDF_ITERATIONS = 210_000;
export const MIN_BACKUP_PASSPHRASE_LENGTH = 8;

export interface EncryptedBackupEnvelope {
  format: 'treise-encrypted-backup';
  version: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  cipher: 'AES-256-GCM';
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
  createdAt: string;
  schemaVersion: number;
  workoutsCount: number;
}

export interface DriveBackupMetadata {
  fileId: string;
  modifiedTime?: string;
  sizeBytes?: number;
}

const DRIVE_TOKEN_SESSION_KEY = 'treise_drive_backup_token_v1';
const DRIVE_PASS_SESSION_KEY = 'treise_drive_backup_session_key_v1';

function getCryptoSubtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }
  return c.subtle;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined' && typeof btoa === 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined' && typeof atob === 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const subtle = getCryptoSubtle();
  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Deterministic non-cryptographic digest used to skip redundant uploads when nothing changed. */
export function computeBackupContentHash(rawJson: string): string {
  let h = 2166136261;
  for (let i = 0; i < rawJson.length; i++) {
    h ^= rawJson.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function isEncryptedBackupEnvelope(value: unknown): value is EncryptedBackupEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.format === 'treise-encrypted-backup' &&
    v.version === 1 &&
    v.kdf === 'PBKDF2-SHA256' &&
    v.cipher === 'AES-256-GCM' &&
    typeof v.iterations === 'number' &&
    v.iterations >= 100_000 &&
    typeof v.saltB64 === 'string' &&
    typeof v.ivB64 === 'string' &&
    typeof v.ciphertextB64 === 'string'
  );
}

/** Encrypts a Treise JSON backup string locally using PBKDF2-SHA256 + AES-256-GCM. */
export async function encryptBackupPayload(
  plaintextJson: string,
  passphrase: string,
  meta?: { schemaVersion?: number; workoutsCount?: number }
): Promise<EncryptedBackupEnvelope> {
  if (!passphrase || passphrase.trim().length < MIN_BACKUP_PASSPHRASE_LENGTH) {
    throw new Error(`Backup passphrase must be at least ${MIN_BACKUP_PASSPHRASE_LENGTH} characters.`);
  }
  const subtle = getCryptoSubtle();
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(salt);
  globalThis.crypto.getRandomValues(iv);

  const key = await deriveAesKey(passphrase, salt, BACKUP_KDF_ITERATIONS);
  const encoded = new TextEncoder().encode(plaintextJson);
  const cipherBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    encoded
  );

  let schemaVersion = meta?.schemaVersion ?? 0;
  let workoutsCount = meta?.workoutsCount ?? 0;
  if (schemaVersion === 0) {
    try {
      const parsed = JSON.parse(plaintextJson) as { schemaVersion?: number; workouts?: unknown[] };
      schemaVersion = parsed.schemaVersion ?? 0;
      workoutsCount = Array.isArray(parsed.workouts) ? parsed.workouts.length : 0;
    } catch {
      // Metadata is informational only
    }
  }

  return {
    format: 'treise-encrypted-backup',
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: BACKUP_KDF_ITERATIONS,
    cipher: 'AES-256-GCM',
    saltB64: bytesToBase64(salt),
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(cipherBuffer)),
    createdAt: new Date().toISOString(),
    schemaVersion,
    workoutsCount,
  };
}

/** Decrypts an AES-256-GCM backup envelope. Throws on wrong passphrase or tampered ciphertext. */
export async function decryptBackupPayload(
  envelope: EncryptedBackupEnvelope,
  passphrase: string
): Promise<string> {
  if (!isEncryptedBackupEnvelope(envelope)) {
    throw new Error('Unrecognized encrypted backup format.');
  }
  if (!passphrase) {
    throw new Error('Enter your backup passphrase to decrypt this backup.');
  }
  const subtle = getCryptoSubtle();
  const salt = base64ToBytes(envelope.saltB64);
  const iv = base64ToBytes(envelope.ivB64);
  const ciphertext = base64ToBytes(envelope.ciphertextB64);
  const key = await deriveAesKey(passphrase, salt, envelope.iterations);

  try {
    const plainBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    throw new Error('Could not decrypt backup. Check your passphrase or verify the file is intact.');
  }
}

/** Stores the short-lived Google Drive OAuth access token in sessionStorage only (never persisted permanently). */
export function cacheDriveSessionCredentials(
  token: { accessToken: string; expiresAt: number },
  passphrase?: string
): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(DRIVE_TOKEN_SESSION_KEY, JSON.stringify(token));
    if (passphrase) {
      sessionStorage.setItem(DRIVE_PASS_SESSION_KEY, passphrase);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function getCachedDriveSessionCredentials(): {
  accessToken: string;
  expiresAt: number;
  passphrase?: string;
} | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(DRIVE_TOKEN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken?: string; expiresAt?: number };
    if (!parsed.accessToken || !parsed.expiresAt || parsed.expiresAt <= Date.now() + 30_000) {
      return null;
    }
    const passphrase = sessionStorage.getItem(DRIVE_PASS_SESSION_KEY) ?? undefined;
    return { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt, passphrase };
  } catch {
    return null;
  }
}

export function clearDriveSessionCredentials(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(DRIVE_TOKEN_SESSION_KEY);
    sessionStorage.removeItem(DRIVE_PASS_SESSION_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Requests an OAuth2 access token scoped strictly to Google Drive's hidden `appDataFolder`
 * via Google Identity Services (`google.accounts.oauth2.initTokenClient`).
 * Never accesses any user-visible Drive files and requires no client secret.
 */
export async function requestGoogleDriveBackupToken(
  clientId: string = GOOGLE_AUTH_CONFIG.CLIENT_ID,
  options: { prompt?: '' | 'consent' } = {}
): Promise<{ accessToken: string; expiresAt: number }> {
  if (!isGoogleClientConfigured(clientId)) {
    throw new Error('Google OAuth client ID is not configured.');
  }
  const loaded = await loadGoogleIdentityServicesScript();
  const oauth2 = typeof window !== 'undefined' ? (window as any).google?.accounts?.oauth2 : null;
  if (!loaded || !oauth2?.initTokenClient) {
    throw new Error('Google Drive authorization is unavailable right now. Check your connection and try again.');
  }

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_APPDATA_SCOPE,
      callback: (resp: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || 'Google Drive authorization was cancelled.'));
          return;
        }
        const expiresInSec = Number(resp.expires_in) || 3500;
        resolve({
          accessToken: resp.access_token,
          expiresAt: Date.now() + expiresInSec * 1000,
        });
      },
      error_callback: (err: { message?: string; type?: string }) => {
        reject(new Error(err?.message || err?.type || 'Google Drive authorization failed.'));
      },
    });
    client.requestAccessToken({ prompt: options.prompt ?? 'consent' });
  });
}

async function findExistingDriveBackupFile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<DriveBackupMetadata | null> {
  const q = encodeURIComponent(`name='${DRIVE_BACKUP_FILENAME}' and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime,size)&pageSize=1`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google Drive lookup failed (${res.status}).`);
  }
  const body = (await res.json()) as { files?: Array<{ id: string; modifiedTime?: string; size?: string }> };
  const file = body.files?.[0];
  if (!file?.id) return null;
  return {
    fileId: file.id,
    modifiedTime: file.modifiedTime,
    sizeBytes: file.size ? Number(file.size) : undefined,
  };
}

/** Uploads an encrypted backup envelope into the user's private Google Drive `appDataFolder`. */
export async function uploadEncryptedBackupToDrive(
  accessToken: string,
  envelope: EncryptedBackupEnvelope,
  fetchImpl: typeof fetch = fetch
): Promise<DriveBackupMetadata> {
  const serialized = JSON.stringify(envelope);
  const existing = await findExistingDriveBackupFile(accessToken, fetchImpl);

  if (existing) {
    const res = await fetchImpl(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.fileId)}?uploadType=media&fields=id,modifiedTime,size`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: serialized,
      }
    );
    if (!res.ok) {
      throw new Error(`Google Drive backup update failed (${res.status}).`);
    }
    const updated = (await res.json()) as { id: string; modifiedTime?: string; size?: string };
    return {
      fileId: updated.id || existing.fileId,
      modifiedTime: updated.modifiedTime || new Date().toISOString(),
      sizeBytes: updated.size ? Number(updated.size) : serialized.length,
    };
  }

  const boundary = `treise_boundary_${Date.now().toString(36)}`;
  const metadata = JSON.stringify({
    name: DRIVE_BACKUP_FILENAME,
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  });
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${serialized}\r\n` +
    `--${boundary}--`;

  const res = await fetchImpl(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime,size',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );
  if (!res.ok) {
    throw new Error(`Google Drive backup creation failed (${res.status}).`);
  }
  const created = (await res.json()) as { id: string; modifiedTime?: string; size?: string };
  return {
    fileId: created.id,
    modifiedTime: created.modifiedTime || new Date().toISOString(),
    sizeBytes: created.size ? Number(created.size) : serialized.length,
  };
}

/** Downloads the latest encrypted backup envelope from the user's private Google Drive `appDataFolder`. */
export async function downloadEncryptedBackupFromDrive(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ metadata: DriveBackupMetadata; envelope: EncryptedBackupEnvelope } | null> {
  const existing = await findExistingDriveBackupFile(accessToken, fetchImpl);
  if (!existing) return null;

  const res = await fetchImpl(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(existing.fileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Google Drive backup download failed (${res.status}).`);
  }
  const parsed = await res.json();
  if (!isEncryptedBackupEnvelope(parsed)) {
    throw new Error('The file in Google Drive app data is not a valid Treise encrypted backup.');
  }
  return { metadata: existing, envelope: parsed };
}

/** Deletes the encrypted backup file from the user's private Google Drive `appDataFolder`. */
export async function deleteEncryptedBackupFromDrive(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const existing = await findExistingDriveBackupFile(accessToken, fetchImpl);
  if (!existing) return false;
  const res = await fetchImpl(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(existing.fileId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete Google Drive backup (${res.status}).`);
  }
  return true;
}

/** End-to-end helper: encrypts a JSON backup payload and uploads it to Google Drive `appDataFolder`. */
export async function runEncryptedDriveBackup(params: {
  rawJson: string;
  passphrase: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{ metadata: DriveBackupMetadata; contentHash: string; backedUpAt: string }> {
  const envelope = await encryptBackupPayload(params.rawJson, params.passphrase);
  const metadata = await uploadEncryptedBackupToDrive(
    params.accessToken,
    envelope,
    params.fetchImpl ?? fetch
  );
  return {
    metadata,
    contentHash: computeBackupContentHash(params.rawJson),
    backedUpAt: metadata.modifiedTime || envelope.createdAt,
  };
}

/** End-to-end helper: downloads and decrypts the latest encrypted backup from Google Drive `appDataFolder`. */
export async function restoreEncryptedDriveBackup(params: {
  passphrase: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{ rawJson: string; metadata: DriveBackupMetadata; envelope: EncryptedBackupEnvelope } | null> {
  const downloaded = await downloadEncryptedBackupFromDrive(
    params.accessToken,
    params.fetchImpl ?? fetch
  );
  if (!downloaded) return null;
  const rawJson = await decryptBackupPayload(downloaded.envelope, params.passphrase);
  return { rawJson, metadata: downloaded.metadata, envelope: downloaded.envelope };
}
