// lib/dal/auth.ts
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { cookies, headers } from 'next/headers';
import type { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import {
  isHostingerMysqlConfigured,
  isPreviewDemoUnlockAllowed,
  validateProductionAuthConfig,
} from '@/lib/config/runtimeEnv';
import {
  buildTotpOtpauthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  formatBase32ManualKey,
  generateBackupRecoveryCodes,
  generateTotpSecretBase32,
  getEnvTotpFallbackSecret,
  renderTotpQrSvgDataUri,
  verifyRecoveryCodeConstantTime,
  verifyTotpCode,
} from '@/lib/security/totp';
import {
  archiveRepository,
  getInitializedMysqlPool,
} from '@/lib/storage/repository';
import type { AdminMfaStatusSnapshot } from '@/types/archive';

const PREVIEW_COOKIE_NAME = 'gvl_diy_admin_session';
const PROD_HOST_COOKIE_NAME = '__Host-gvl_diy_admin_session';

const SCRYPT_N = 65536;
const SCRYPT_R = 8;
const SCRYPT_P = 2;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 134217728; // 128 MiB ceiling for N=65536, r=8, p=2 (~64 MiB working set)
const MAX_CONCURRENT_SCRYPT = 2;

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const RATE_WINDOW_MS = 1000 * 60 * 15; // 15 minutes per-IP strike window
const MAX_FAILED_ATTEMPTS = 5;
const FAILED_LOGIN_FLOOR_MS = 450;

const GLOBAL_BURST_BUCKET_KEY = 'global:admin';
const GLOBAL_BURST_WINDOW_MS = 60_000; // 60 seconds burst window
const GLOBAL_BURST_MAX_PER_MIN = 20; // > 20 failures/min triggers 30s burst shield
const GLOBAL_BURST_COOLDOWN_MS = 30_000; // 30 seconds 429 cooldown
const GLOBAL_BURST_FLOOR_MS = 1_000; // 1,000ms response delay under burst

interface AdminSessionRecord {
  sessionIdHash: string;
  createdAtIso: string;
  expiresAtMs: number;
  revokedAtIso: string | null;
  ipHash: string;
}

interface AuthRateLimitRecord {
  bucketKey: string;
  failCount: number;
  windowStartMs: number;
  strikeLevel: number;
  lockedUntilMs: number;
  updatedAtIso: string;
}

const globalForAdminAuth = globalThis as unknown as {
  __gvlClaimedAdminHash?: string;
  __gvlLegacyEnvDerived?: {
    sourcePasskey: string;
    promise: Promise<string>;
  };
  __gvlAdminSessions?: Map<string, AdminSessionRecord>;
  __gvlAuthRateLimits?: Map<string, AuthRateLimitRecord>;
  __gvlActiveScryptCount?: number;
  __gvlScryptWaitQueue?: Array<() => void>;
};

function getSessionMap(): Map<string, AdminSessionRecord> {
  if (!globalForAdminAuth.__gvlAdminSessions) {
    globalForAdminAuth.__gvlAdminSessions = new Map();
  }
  return globalForAdminAuth.__gvlAdminSessions;
}

function getRateLimitMap(): Map<string, AuthRateLimitRecord> {
  if (!globalForAdminAuth.__gvlAuthRateLimits) {
    globalForAdminAuth.__gvlAuthRateLimits = new Map();
  }
  return globalForAdminAuth.__gvlAuthRateLimits;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function getRequestIpHash(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip')?.trim();
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const firstForwarded = forwarded.split(',')[0]?.trim();
  const realIp = req.headers.get('x-real-ip')?.trim();
  const rawIp = cfIp || firstForwarded || realIp || '127.0.0.1';
  return sha256Hex(rawIp);
}

export function isPreviewDemoModeEnabled(): boolean {
  return isPreviewDemoUnlockAllowed();
}

export function checkProductionAuthPosture(): {
  ok: boolean;
  reason?: string;
} {
  return validateProductionAuthConfig();
}

export async function enforceMinElapsedMs(
  startedAtMs: number,
  minElapsedMs = FAILED_LOGIN_FLOOR_MS
): Promise<void> {
  const elapsed = Date.now() - startedAtMs;
  const remaining = minElapsedMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

// Max-2 concurrent async scrypt semaphore so parallel login attempts never exhaust RAM
async function acquireScryptSlot(): Promise<void> {
  const current = globalForAdminAuth.__gvlActiveScryptCount || 0;
  if (current < MAX_CONCURRENT_SCRYPT) {
    globalForAdminAuth.__gvlActiveScryptCount = current + 1;
    return;
  }
  if (!globalForAdminAuth.__gvlScryptWaitQueue) {
    globalForAdminAuth.__gvlScryptWaitQueue = [];
  }
  await new Promise<void>((resolve) => {
    globalForAdminAuth.__gvlScryptWaitQueue!.push(resolve);
  });
}

function releaseScryptSlot(): void {
  const queue = globalForAdminAuth.__gvlScryptWaitQueue;
  if (queue && queue.length > 0) {
    const next = queue.shift()!;
    next();
    return;
  }
  const current = globalForAdminAuth.__gvlActiveScryptCount || 1;
  globalForAdminAuth.__gvlActiveScryptCount = Math.max(0, current - 1);
}

async function deriveScryptKeyAsync(
  passphrase: string,
  salt: Buffer,
  N = SCRYPT_N,
  r = SCRYPT_R,
  p = SCRYPT_P,
  keylen = SCRYPT_KEYLEN
): Promise<Buffer> {
  await acquireScryptSlot();
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scryptCallback(
        passphrase,
        salt,
        keylen,
        { N, r, p, maxmem: SCRYPT_MAXMEM },
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });
  } finally {
    releaseScryptSlot();
  }
}

export async function generateAdminPasswordHash(
  rawPassphrase: string
): Promise<string> {
  if (!rawPassphrase || rawPassphrase.length < 16) {
    throw new Error('Passphrase must be at least 16 characters long.');
  }
  if (rawPassphrase.length > 256) {
    throw new Error('Passphrase must not exceed 256 characters.');
  }
  const salt = randomBytes(32);
  const derived = await deriveScryptKeyAsync(
    rawPassphrase,
    salt,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    SCRYPT_KEYLEN
  );
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString(
    'hex'
  )}$${derived.toString('hex')}`;
}

interface ParsedScryptRecord {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  expectedHash: Buffer;
}

function parseScryptHashRecord(encoded: string): ParsedScryptRecord | null {
  const trimmed = encoded.trim().replace(/^["']|["']$/g, '');
  const parts = trimmed.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4] || '';
  const hashHex = parts[5] || '';

  const isPowerOfTwo = Number.isInteger(N) && N >= 16384 && N <= 131072 && (N & (N - 1)) === 0;
  if (!isPowerOfTwo || !Number.isInteger(r) || r < 1 || r > 16 || !Number.isInteger(p) || p < 1 || p > 4) {
    return null;
  }
  if (!/^[a-f0-9]{32,128}$/i.test(saltHex) || saltHex.length % 2 !== 0) {
    return null;
  }
  if (!/^[a-f0-9]{64,256}$/i.test(hashHex) || hashHex.length % 2 !== 0) {
    return null;
  }

  return {
    N,
    r,
    p,
    salt: Buffer.from(saltHex, 'hex'),
    expectedHash: Buffer.from(hashHex, 'hex'),
  };
}

async function verifyAgainstEncodedHash(
  candidate: string,
  encodedHash: string
): Promise<boolean> {
  const parsed = parseScryptHashRecord(encodedHash);
  if (!parsed) return false;
  const candidateKey = await deriveScryptKeyAsync(
    candidate,
    parsed.salt,
    parsed.N,
    parsed.r,
    parsed.p,
    parsed.expectedHash.length
  );
  return (
    candidateKey.length === parsed.expectedHash.length &&
    timingSafeEqual(candidateKey, parsed.expectedHash)
  );
}

function getBootDerivedLegacyPasskeyHash(legacyPasskey: string): Promise<string> {
  const existing = globalForAdminAuth.__gvlLegacyEnvDerived;
  if (existing && existing.sourcePasskey === legacyPasskey) {
    return existing.promise;
  }

  const salt = randomBytes(32);
  const promise = deriveScryptKeyAsync(
    legacyPasskey,
    salt,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    SCRYPT_KEYLEN
  ).then(
    (derived) =>
      `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString(
        'hex'
      )}$${derived.toString('hex')}`
  );

  globalForAdminAuth.__gvlLegacyEnvDerived = {
    sourcePasskey: legacyPasskey,
    promise,
  };
  return promise;
}

// Kick off one-time async derivation at module boot if legacy ADMIN_PASSKEY is set
if (
  !process.env.ADMIN_PASSWORD_HASH?.trim() &&
  process.env.ADMIN_PASSKEY?.trim()
) {
  void getBootDerivedLegacyPasskeyHash(process.env.ADMIN_PASSKEY.trim()).catch(
    () => {}
  );
}

export async function verifyOrClaimAdminPasskey(
  rawPasskey: string
): Promise<boolean> {
  const clean = rawPasskey.trim();
  if (!clean || clean.length > 256) return false;

  // 1. Primary: Salted memory-hard ADMIN_PASSWORD_HASH
  const envPasswordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (envPasswordHash) {
    return verifyAgainstEncodedHash(clean, envPasswordHash);
  }

  // 2. Legacy fallback: ADMIN_PASSKEY derived once asynchronously at boot
  const envLegacyPasskey = process.env.ADMIN_PASSKEY?.trim();
  if (envLegacyPasskey) {
    const bootEncoded = await getBootDerivedLegacyPasskeyHash(envLegacyPasskey);
    return verifyAgainstEncodedHash(clean, bootEncoded);
  }

  // 3. Production safety lock: NEVER allow TOFU passkey claiming in production
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  // 4. Development / Preview only: allow claiming a session test key in RAM
  if (!globalForAdminAuth.__gvlClaimedAdminHash) {
    const salt = randomBytes(32);
    const derived = await deriveScryptKeyAsync(clean, salt);
    globalForAdminAuth.__gvlClaimedAdminHash = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString(
      'hex'
    )}$${derived.toString('hex')}`;
    return true;
  }

  return verifyAgainstEncodedHash(
    clean,
    globalForAdminAuth.__gvlClaimedAdminHash
  );
}

// ==================== PROGRESSIVE BRUTE-FORCE RATE LIMITER ====================
function cooldownMsForStrike(strikeLevel: number): number {
  if (strikeLevel <= 1) return 15 * 60 * 1000; // 15 minutes
  if (strikeLevel === 2) return 60 * 60 * 1000; // 1 hour
  return 24 * 60 * 60 * 1000; // 24 hours
}

async function loadRateLimitBucket(
  bucketKey: string
): Promise<AuthRateLimitRecord> {
  if (isHostingerMysqlConfigured()) {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT bucket_key, fail_count, window_start_ms, strike_level, locked_until_ms, updated_at_iso
         FROM auth_rate_limits
         WHERE bucket_key = ?
         LIMIT 1`,
        [bucketKey]
      );
      if (rows.length > 0) {
        const r = rows[0];
        return {
          bucketKey: String(r.bucket_key),
          failCount: Number(r.fail_count || 0),
          windowStartMs: Number(r.window_start_ms || 0),
          strikeLevel: Number(r.strike_level || 0),
          lockedUntilMs: Number(r.locked_until_ms || 0),
          updatedAtIso: String(r.updated_at_iso || new Date().toISOString()),
        };
      }
    }
  }

  const map = getRateLimitMap();
  return (
    map.get(bucketKey) || {
      bucketKey,
      failCount: 0,
      windowStartMs: 0,
      strikeLevel: 0,
      lockedUntilMs: 0,
      updatedAtIso: new Date().toISOString(),
    }
  );
}

async function saveRateLimitBucket(record: AuthRateLimitRecord): Promise<void> {
  const map = getRateLimitMap();
  map.set(record.bucketKey, record);

  if (isHostingerMysqlConfigured()) {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      await pool.query(
        `INSERT INTO auth_rate_limits
           (bucket_key, fail_count, window_start_ms, strike_level, locked_until_ms, updated_at_iso)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           fail_count = VALUES(fail_count),
           window_start_ms = VALUES(window_start_ms),
           strike_level = VALUES(strike_level),
           locked_until_ms = VALUES(locked_until_ms),
           updated_at_iso = VALUES(updated_at_iso)`,
        [
          record.bucketKey,
          record.failCount,
          record.windowStartMs,
          record.strikeLevel,
          record.lockedUntilMs,
          record.updatedAtIso,
        ]
      );
    }
  }
}

export async function checkAuthRateLimit(ipHash: string): Promise<{
  allowed: boolean;
  retryAfterSec: number;
  isGlobalBurst: boolean;
  minDelayMs: number;
}> {
  const now = Date.now();

  // 1. Per-IP progressive lockout (15m / 1h / 24h) — strictly isolated per ipHash
  const ipBucket = await loadRateLimitBucket(ipHash);
  if ((ipBucket.lockedUntilMs || 0) > now) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((ipBucket.lockedUntilMs - now) / 1000)),
      isGlobalBurst: false,
      minDelayMs: FAILED_LOGIN_FLOOR_MS,
    };
  }

  // 2. Global 60s burst guard (> 20 global failures/min -> 30s 429 + 1,000ms delay)
  const globalBucket = await loadRateLimitBucket(GLOBAL_BURST_BUCKET_KEY);
  if ((globalBucket.lockedUntilMs || 0) > now) {
    return {
      allowed: false,
      retryAfterSec: Math.max(
        1,
        Math.ceil((globalBucket.lockedUntilMs - now) / 1000)
      ),
      isGlobalBurst: true,
      minDelayMs: GLOBAL_BURST_FLOOR_MS,
    };
  }

  return {
    allowed: true,
    retryAfterSec: 0,
    isGlobalBurst: false,
    minDelayMs: FAILED_LOGIN_FLOOR_MS,
  };
}

export async function recordFailedAuthAttempt(ipHash: string): Promise<{
  lockedNow: boolean;
  globalBurstNow: boolean;
  retryAfterSec: number;
  minDelayMs: number;
}> {
  const now = Date.now();
  const nowIso = new Date().toISOString();

  // 1. Update per-IP progressive strike bucket exclusively for this ipHash
  const currentIp = await loadRateLimitBucket(ipHash);
  const ipWindowExpired =
    currentIp.windowStartMs === 0 || now - currentIp.windowStartMs > RATE_WINDOW_MS;
  const nextIpFailCount = ipWindowExpired ? 1 : currentIp.failCount + 1;
  const nextIpWindowStart = ipWindowExpired ? now : currentIp.windowStartMs;

  let nextStrike = currentIp.strikeLevel;
  let nextIpLockedUntil =
    currentIp.lockedUntilMs > now ? currentIp.lockedUntilMs : 0;

  if (nextIpFailCount >= MAX_FAILED_ATTEMPTS) {
    nextStrike = Math.min(10, currentIp.strikeLevel + 1);
    nextIpLockedUntil = now + cooldownMsForStrike(nextStrike);
  }

  await saveRateLimitBucket({
    bucketKey: ipHash,
    failCount: nextIpFailCount >= MAX_FAILED_ATTEMPTS ? 0 : nextIpFailCount,
    windowStartMs:
      nextIpFailCount >= MAX_FAILED_ATTEMPTS ? 0 : nextIpWindowStart,
    strikeLevel: nextStrike,
    lockedUntilMs: nextIpLockedUntil,
    updatedAtIso: nowIso,
  });

  // 2. Update global:admin 60s burst guard (never escalates to 15m/1h/24h lockouts)
  const currentGlobal = await loadRateLimitBucket(GLOBAL_BURST_BUCKET_KEY);
  const globalWindowExpired =
    currentGlobal.windowStartMs === 0 ||
    now - currentGlobal.windowStartMs > GLOBAL_BURST_WINDOW_MS;
  const nextGlobalCount = globalWindowExpired ? 1 : currentGlobal.failCount + 1;
  const nextGlobalWindowStart = globalWindowExpired
    ? now
    : currentGlobal.windowStartMs;

  let nextGlobalLockedUntil =
    currentGlobal.lockedUntilMs > now ? currentGlobal.lockedUntilMs : 0;
  let globalBurstTriggered = false;

  if (nextGlobalCount > GLOBAL_BURST_MAX_PER_MIN) {
    nextGlobalLockedUntil = Math.max(
      nextGlobalLockedUntil,
      now + GLOBAL_BURST_COOLDOWN_MS
    );
    globalBurstTriggered = true;
  }

  await saveRateLimitBucket({
    bucketKey: GLOBAL_BURST_BUCKET_KEY,
    failCount: nextGlobalCount,
    windowStartMs: nextGlobalWindowStart,
    strikeLevel: 0,
    lockedUntilMs: nextGlobalLockedUntil,
    updatedAtIso: nowIso,
  });

  const ipLockedNow = nextIpLockedUntil > now;
  const globalBurstNow = globalBurstTriggered || nextGlobalLockedUntil > now;
  const effectiveLockUntil = Math.max(nextIpLockedUntil, nextGlobalLockedUntil);

  return {
    lockedNow: ipLockedNow,
    globalBurstNow,
    retryAfterSec:
      effectiveLockUntil > now
        ? Math.max(1, Math.ceil((effectiveLockUntil - now) / 1000))
        : 0,
    minDelayMs: globalBurstNow ? GLOBAL_BURST_FLOOR_MS : FAILED_LOGIN_FLOOR_MS,
  };
}

export async function clearAuthFailureCount(ipHash: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await saveRateLimitBucket({
    bucketKey: ipHash,
    failCount: 0,
    windowStartMs: 0,
    strikeLevel: 0,
    lockedUntilMs: 0,
    updatedAtIso: nowIso,
  });
}

// ==================== REVOCABLE DATABASE-BACKED SESSIONS ====================
export async function createAdminSession(req: Request): Promise<string> {
  // 256-bit CSPRNG opaque token; only SHA-256(token) is stored server-side
  const rawToken = randomBytes(32).toString('hex');
  const sessionIdHash = sha256Hex(rawToken);
  const createdAtIso = new Date().toISOString();
  const expiresAtMs = Date.now() + SESSION_TTL_MS;
  const ipHash = getRequestIpHash(req);

  const record: AdminSessionRecord = {
    sessionIdHash,
    createdAtIso,
    expiresAtMs,
    revokedAtIso: null,
    ipHash,
  };

  getSessionMap().set(sessionIdHash, record);

  if (isHostingerMysqlConfigured()) {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      await pool.query(
        `INSERT INTO admin_sessions
           (session_id_hash, created_at_iso, expires_at_ms, revoked_at_iso, ip_hash)
         VALUES (?, ?, ?, NULL, ?)`,
        [sessionIdHash, createdAtIso, expiresAtMs, ipHash]
      );
    }
  }

  return rawToken;
}

export async function verifyAdminSessionToken(
  rawToken: string | undefined
): Promise<boolean> {
  if (!rawToken || !/^[a-f0-9]{64}$/i.test(rawToken.trim())) {
    return false;
  }

  const sessionIdHash = sha256Hex(rawToken.trim().toLowerCase());
  const now = Date.now();

  if (isHostingerMysqlConfigured()) {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT expires_at_ms, revoked_at_iso
         FROM admin_sessions
         WHERE session_id_hash = ?
         LIMIT 1`,
        [sessionIdHash]
      );
      if (rows.length === 0) return false;
      const r = rows[0];
      if (r.revoked_at_iso) return false;
      return Number(r.expires_at_ms || 0) > now;
    }
  }

  const rec = getSessionMap().get(sessionIdHash);
  if (!rec || rec.revokedAtIso) return false;
  if (rec.expiresAtMs <= now) {
    getSessionMap().delete(sessionIdHash);
    return false;
  }
  return true;
}

function extractBearerToken(authHeader: string | null): string | undefined {
  if (!authHeader) return undefined;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

export async function revokeCurrentAdminSession(req: Request): Promise<boolean> {
  const candidateTokens = new Set<string>();
  const bearer = extractBearerToken(req.headers.get('authorization'));
  if (bearer && /^[a-f0-9]{64}$/i.test(bearer)) {
    candidateTokens.add(bearer.toLowerCase());
  }

  try {
    const cookieStore = await cookies();
    const hostVal = cookieStore.get(PROD_HOST_COOKIE_NAME)?.value;
    const prevVal = cookieStore.get(PREVIEW_COOKIE_NAME)?.value;
    for (const v of [hostVal, prevVal]) {
      if (v && /^[a-f0-9]{64}$/i.test(v)) {
        candidateTokens.add(v.toLowerCase());
      }
    }
  } catch {
    // Ignore cookie read context outside request
  }

  if (candidateTokens.size === 0) return false;

  const nowIso = new Date().toISOString();
  const map = getSessionMap();
  let revokedAny = false;

  for (const raw of candidateTokens) {
    const hash = sha256Hex(raw);
    const existing = map.get(hash);
    if (existing && !existing.revokedAtIso) {
      existing.revokedAtIso = nowIso;
      revokedAny = true;
    }

    if (isHostingerMysqlConfigured()) {
      const pool = await getInitializedMysqlPool().catch(() => null);
      if (pool) {
        await pool.query(
          `UPDATE admin_sessions
           SET revoked_at_iso = ?
           WHERE session_id_hash = ? AND revoked_at_iso IS NULL`,
          [nowIso, hash]
        );
        revokedAny = true;
      }
    }
  }

  return revokedAny;
}

export async function revokeAllAdminSessions(): Promise<number> {
  const nowIso = new Date().toISOString();
  const map = getSessionMap();
  let revokedCount = 0;

  for (const rec of map.values()) {
    if (!rec.revokedAtIso) {
      rec.revokedAtIso = nowIso;
      revokedCount += 1;
    }
  }

  if (isHostingerMysqlConfigured()) {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      const [result] = await pool.query(
        `UPDATE admin_sessions
         SET revoked_at_iso = ?
         WHERE revoked_at_iso IS NULL`,
        [nowIso]
      );
      const affected = (result as { affectedRows?: number })?.affectedRows;
      if (typeof affected === 'number') {
        revokedCount = Math.max(revokedCount, affected);
      }
    }
  }

  return revokedCount;
}

/**
 * Revokes all active sessions EXCEPT the caller's active session token(s),
 * used when confirming TOTP enrollment so other devices are logged out immediately.
 */
export async function revokeOtherAdminSessions(req: Request): Promise<number> {
  const keepHashes = new Set<string>();
  const bearer = extractBearerToken(req.headers.get('authorization'));
  if (bearer && /^[a-f0-9]{64}$/i.test(bearer)) {
    keepHashes.add(sha256Hex(bearer.toLowerCase()));
  }

  try {
    const cookieStore = await cookies();
    const hostVal = cookieStore.get(PROD_HOST_COOKIE_NAME)?.value;
    const prevVal = cookieStore.get(PREVIEW_COOKIE_NAME)?.value;
    for (const v of [hostVal, prevVal]) {
      if (v && /^[a-f0-9]{64}$/i.test(v)) {
        keepHashes.add(sha256Hex(v.toLowerCase()));
      }
    }
  } catch {
    // Ignore outside request cookie context
  }

  const nowIso = new Date().toISOString();
  const map = getSessionMap();
  let revokedCount = 0;

  for (const [hash, rec] of map.entries()) {
    if (!rec.revokedAtIso && !keepHashes.has(hash)) {
      rec.revokedAtIso = nowIso;
      revokedCount += 1;
    }
  }

  if (isHostingerMysqlConfigured()) {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      const keepList = Array.from(keepHashes);
      if (keepList.length === 0) {
        const [res] = await pool.query(
          `UPDATE admin_sessions SET revoked_at_iso = ? WHERE revoked_at_iso IS NULL`,
          [nowIso]
        );
        revokedCount = Math.max(
          revokedCount,
          Number((res as { affectedRows?: number })?.affectedRows || 0)
        );
      } else {
        const placeholders = keepList.map(() => '?').join(', ');
        const [res] = await pool.query(
          `UPDATE admin_sessions
           SET revoked_at_iso = ?
           WHERE revoked_at_iso IS NULL
             AND session_id_hash NOT IN (${placeholders})`,
          [nowIso, ...keepList]
        );
        revokedCount = Math.max(
          revokedCount,
          Number((res as { affectedRows?: number })?.affectedRows || 0)
        );
      }
    }
  }

  return revokedCount;
}

// ==================== TWO-FACTOR (RFC 6238 TOTP) ORCHESTRATION ====================
export async function getAdminMfaStatus(): Promise<AdminMfaStatusSnapshot> {
  const row = await archiveRepository.getMfaConfigRow();
  const decryptedDbSecret = row.enabled
    ? decryptTotpSecret(row.encryptedSecret)
    : null;
  const dbEnabled = Boolean(row.enabled && decryptedDbSecret);
  const envFallbackSecret = getEnvTotpFallbackSecret();
  const envFallbackConfigured = Boolean(envFallbackSecret);

  const hasPendingSetup = Boolean(
    decryptTotpSecret(row.pendingEncryptedSecret)
  );

  // Confirmed user rule: Live enrolled database 2FA overrides ADMIN_TOTP_SECRET env fallback
  const source: AdminMfaStatusSnapshot['source'] = dbEnabled
    ? 'database'
    : envFallbackConfigured
    ? 'env-fallback'
    : 'none';

  return {
    active: dbEnabled || envFallbackConfigured,
    dbEnabled,
    envFallbackConfigured,
    source,
    hasPendingSetup,
    remainingRecoveryCodes: dbEnabled ? row.recoveryHashes.length : 0,
    updatedAtIso: row.updatedAtIso,
  };
}

export async function beginAdminTotpEnrollment(): Promise<{
  qrSvgDataUri: string;
  manualKeyFormatted: string;
  otpauthUri: string;
  mfaStatus: AdminMfaStatusSnapshot;
}> {
  const plainSecretBase32 = generateTotpSecretBase32();
  const encryptedPending = encryptTotpSecret(plainSecretBase32);
  await archiveRepository.savePendingMfaSecret(encryptedPending);

  const otpauthUri = buildTotpOtpauthUri(plainSecretBase32);
  const qrSvgDataUri = await renderTotpQrSvgDataUri(otpauthUri);
  const manualKeyFormatted = formatBase32ManualKey(plainSecretBase32);
  const mfaStatus = await getAdminMfaStatus();

  return {
    qrSvgDataUri,
    manualKeyFormatted,
    otpauthUri,
    mfaStatus,
  };
}

export async function confirmAdminTotpEnrollment(
  submittedCode: string,
  req: Request
): Promise<
  | {
      ok: true;
      recoveryCodes: string[];
      revokedOtherSessions: number;
      mfaStatus: AdminMfaStatusSnapshot;
    }
  | { ok: false; error: string; replayBlocked?: boolean }
> {
  const row = await archiveRepository.getMfaConfigRow();
  const pendingPlain = decryptTotpSecret(row.pendingEncryptedSecret);
  if (!pendingPlain) {
    return {
      ok: false,
      error: 'No pending authenticator setup found. Click Begin Setup first.',
    };
  }

  const verification = verifyTotpCode(pendingPlain, submittedCode);
  if (!verification.valid || verification.matchedStep === null) {
    return {
      ok: false,
      error: 'Invalid 6-digit authenticator code. Check your phone clock and try again.',
    };
  }

  if (
    row.lastAcceptedStep !== null &&
    verification.matchedStep <= row.lastAcceptedStep
  ) {
    return {
      ok: false,
      error: 'This 6-digit code was already used. Wait for the next 30-second code.',
      replayBlocked: true,
    };
  }

  const { plainCodes, hashes } = generateBackupRecoveryCodes(8);
  const promotedEncrypted = encryptTotpSecret(pendingPlain);

  await archiveRepository.promotePendingMfaSecret(
    promotedEncrypted,
    verification.matchedStep,
    hashes
  );
  const revokedOtherSessions = await revokeOtherAdminSessions(req);
  const mfaStatus = await getAdminMfaStatus();

  return {
    ok: true,
    recoveryCodes: plainCodes,
    revokedOtherSessions,
    mfaStatus,
  };
}

export async function verifyAdminSecondFactor(
  submittedCode: string
): Promise<
  | {
      ok: true;
      method: 'totp' | 'recovery';
      matchedStep?: number;
      remainingRecoveryCodes?: number;
    }
  | { ok: false; reason: 'invalid_code' | 'replay_blocked' | 'not_configured' }
> {
  const row = await archiveRepository.getMfaConfigRow();
  const dbSecret = row.enabled ? decryptTotpSecret(row.encryptedSecret) : null;
  const envSecret = getEnvTotpFallbackSecret();

  // Confirmed user rule: Enrolled DB 2FA takes precedence over ADMIN_TOTP_SECRET env fallback
  const activeSecret = dbSecret || envSecret;
  if (!activeSecret) {
    return { ok: false, reason: 'not_configured' };
  }

  const trimmed = String(submittedCode || '').trim();
  const digitsOnly = trimmed.replace(/[\s-]+/g, '');

  // 1. Check 6-digit numeric TOTP code + mandatory atomic anti-replay lock
  if (/^\d{6}$/.test(digitsOnly)) {
    const check = verifyTotpCode(activeSecret, digitsOnly);
    if (!check.valid || check.matchedStep === null) {
      return { ok: false, reason: 'invalid_code' };
    }

    const claimed = await archiveRepository.claimTotpStepAtomic(
      check.matchedStep
    );
    if (!claimed) {
      return { ok: false, reason: 'replay_blocked' };
    }

    return {
      ok: true,
      method: 'totp',
      matchedStep: check.matchedStep,
    };
  }

  // 2. Check single-use XXXX-XXXX backup recovery codes (available when DB 2FA is enrolled)
  if (dbSecret && row.recoveryHashes.length > 0) {
    const recCheck = verifyRecoveryCodeConstantTime(trimmed, row.recoveryHashes);
    if (recCheck.valid && recCheck.matchedIndex >= 0) {
      const remaining = row.recoveryHashes.filter(
        (_, idx) => idx !== recCheck.matchedIndex
      );
      await archiveRepository.updateRecoveryHashes(remaining);
      return {
        ok: true,
        method: 'recovery',
        remainingRecoveryCodes: remaining.length,
      };
    }
  }

  return { ok: false, reason: 'invalid_code' };
}

export async function disableAdminTotpEnrollment(): Promise<AdminMfaStatusSnapshot> {
  await archiveRepository.disableMfaConfig();
  return getAdminMfaStatus();
}

// ==================== UNIVERSAL MUTATION CSRF & SESSION GUARD ====================
export function verifyMutationCsrf(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  // Custom header cannot be sent cross-origin without an explicit CORS allowlist
  if (req.headers.get('x-requested-with') === 'gvl-admin') {
    return true;
  }

  const origin = req.headers.get('origin');
  const expectedHost =
    req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (origin && expectedHost) {
    try {
      const originHost = new URL(origin).host;
      if (originHost.toLowerCase() === expectedHost.toLowerCase()) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

export async function verifyAdminSession(req?: Request): Promise<boolean> {
  try {
    const prodPosture = validateProductionAuthConfig();
    if (!prodPosture.ok) {
      return false;
    }

    // Enforce CSRF parity on ALL mutating requests (POST/PUT/PATCH/DELETE), even with Bearer
    if (req && !verifyMutationCsrf(req)) {
      return false;
    }

    // 1. Check server-verified Authorization: Bearer token (iframe-safe, stored only in JS RAM)
    if (req) {
      const bearer = extractBearerToken(req.headers.get('authorization'));
      if (bearer && (await verifyAdminSessionToken(bearer))) {
        return true;
      }
    } else {
      const hdrs = await headers();
      const bearer = extractBearerToken(hdrs.get('authorization'));
      if (bearer && (await verifyAdminSessionToken(bearer))) {
        return true;
      }
    }

    // 2. Check HttpOnly cookie (__Host-gvl_diy_admin_session in prod HTTPS, gvl_diy_admin_session in preview)
    const cookieStore = await cookies();
    const cookieToken =
      cookieStore.get(PROD_HOST_COOKIE_NAME)?.value ||
      cookieStore.get(PREVIEW_COOKIE_NAME)?.value;
    return verifyAdminSessionToken(cookieToken);
  } catch {
    return false;
  }
}

export async function requireAdminSession(req?: Request): Promise<void> {
  const valid = await verifyAdminSession(req);
  if (!valid) {
    throw new Error('UNAUTHORIZED_ADMIN_SESSION');
  }
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = req.headers.get('x-forwarded-proto') || '';
  if (forwardedProto.toLowerCase().includes('https')) return true;
  return req.url.toLowerCase().startsWith('https://');
}

export function appendAdminSessionCookie(
  res: NextResponse,
  req: Request,
  token: string
): void {
  const maxAge = 60 * 60 * 12;
  const encoded = encodeURIComponent(token);
  const https = isHttpsRequest(req);

  if (process.env.NODE_ENV === 'production' && https) {
    res.headers.append(
      'Set-Cookie',
      `${PROD_HOST_COOKIE_NAME}=${encoded}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`
    );
    return;
  }

  if (https) {
    // Non-production HTTPS preview iframe only
    res.headers.append(
      'Set-Cookie',
      `${PREVIEW_COOKIE_NAME}=${encoded}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None; Partitioned`
    );
  } else {
    res.headers.append(
      'Set-Cookie',
      `${PREVIEW_COOKIE_NAME}=${encoded}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`
    );
  }
}

export function clearAdminSessionCookie(res: NextResponse, req: Request): void {
  const https = isHttpsRequest(req);

  if (process.env.NODE_ENV === 'production' && https) {
    res.headers.append(
      'Set-Cookie',
      `${PROD_HOST_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
    );
  }

  if (https) {
    res.headers.append(
      'Set-Cookie',
      `${PREVIEW_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`
    );
  } else {
    res.headers.append(
      'Set-Cookie',
      `${PREVIEW_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    );
  }
}

export const ADMIN_COOKIE_NAME = PREVIEW_COOKIE_NAME;
export const ADMIN_PROD_COOKIE_NAME = PROD_HOST_COOKIE_NAME;
