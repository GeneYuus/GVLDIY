// lib/config/runtimeEnv.ts
import { RuntimePostureSnapshot } from '@/types/archive';

/**
 * Zero-Edit Runtime Posture Resolver (Iteration 1 Security Hardened)
 * - In development/preview (NODE_ENV !== 'production'), holds Port 3000, In-Memory Seed Store,
 *   and 1-Click Demo Unlock steady when ADMIN_PASSWORD_HASH / ADMIN_PASSKEY are unset.
 * - In production (NODE_ENV === 'production'), unconditionally disables Demo Unlock and TOFU
 *   claiming, and fails closed (503) if ADMIN_PASSWORD_HASH / ADMIN_PASSKEY or a >= 32-char
 *   ADMIN_SESSION_SECRET are missing.
 */
export function isHostingerMysqlConfigured(): boolean {
  return Boolean(
    process.env.DB_HOST?.trim() &&
      process.env.DB_USER?.trim() &&
      process.env.DB_NAME?.trim()
  );
}

export function resolveMysqlHost(): string {
  const raw = process.env.DB_HOST?.trim() || '';
  if (!raw) return '';
  // Normalize localhost -> 127.0.0.1 so Node.js on Hostinger uses IPv4 TCP instead of ::1
  return raw.toLowerCase() === 'localhost' ? '127.0.0.1' : raw;
}

export function resolveMysqlPort(): number {
  const parsed = Number(process.env.DB_PORT || 3306);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3306;
}

export function resolveRuntimePort(): string {
  const envPort = process.env.PORT?.trim();
  return envPort && /^\d+$/.test(envPort) ? envPort : '3000';
}

export function isPreviewDemoUnlockAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  return true;
}

export function validateProductionAuthConfig(): {
  ok: boolean;
  reason?: string;
} {
  if (process.env.NODE_ENV !== 'production') {
    return { ok: true };
  }

  const hasPasswordHash = Boolean(process.env.ADMIN_PASSWORD_HASH?.trim());
  const hasLegacyPasskey = Boolean(process.env.ADMIN_PASSKEY?.trim());
  if (!hasPasswordHash && !hasLegacyPasskey) {
    return {
      ok: false,
      reason:
        'Curator gateway is locked until ADMIN_PASSWORD_HASH (or ADMIN_PASSKEY) is configured in environment variables.',
    };
  }

  const sessionSecret = process.env.ADMIN_SESSION_SECRET?.trim() || '';
  if (sessionSecret.length < 32) {
    return {
      ok: false,
      reason:
        'Curator gateway is locked until ADMIN_SESSION_SECRET is set to at least 32 random characters in environment variables.',
    };
  }

  return { ok: true };
}

export function getRuntimePostureSnapshot(): RuntimePostureSnapshot {
  const mysqlReady = isHostingerMysqlConfigured();
  const host = resolveMysqlHost();
  const port = resolveMysqlPort();
  const adminPasswordHashConfigured = Boolean(
    process.env.ADMIN_PASSWORD_HASH?.trim()
  );
  const adminPasskeyConfigured =
    adminPasswordHashConfigured || Boolean(process.env.ADMIN_PASSKEY?.trim());
  const sessionSecret = process.env.ADMIN_SESSION_SECRET?.trim() || '';
  const sessionSecretConfigured = sessionSecret.length >= 32;
  const prodValidation = validateProductionAuthConfig();
  const driveProxyConfigured = Boolean(
    process.env.GDRIVE_CLIENT_EMAIL?.trim() &&
      process.env.GDRIVE_PRIVATE_KEY?.trim()
  );
  const r2PublicDomain =
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.trim() ||
    'https://media.greenvillediyarchive.org';
  const igSecret = process.env.IG_WEBHOOK_APP_SECRET?.trim() || '';
  const igWebhookConfigured = Boolean(
    igSecret && igSecret !== 'replace-with-meta-app-secret'
  );

  return {
    mode:
      mysqlReady || process.env.NODE_ENV === 'production'
        ? 'hostinger-production'
        : 'preview-demo',
    activePort: resolveRuntimePort(),
    storageDriver: mysqlReady ? 'hostinger-mysql' : 'preview-memory',
    mysqlHostDisplay: mysqlReady
      ? `${host}:${port}`
      : '127.0.0.1:3306 (awaiting env)',
    demoUnlockEnabled: isPreviewDemoUnlockAllowed(),
    adminPasskeyConfigured,
    adminPasswordHashConfigured,
    productionAuthReady: prodValidation.ok,
    sessionSecretConfigured,
    driveProxyConfigured,
    r2PublicDomain,
    igWebhookConfigured,
  };
}
