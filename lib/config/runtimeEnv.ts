// lib/config/runtimeEnv.ts
import { RuntimePostureSnapshot } from '@/types/archive';

/**
 * Zero-Edit Runtime Posture Resolver
 * - Holds Port 3000, In-Memory Seed Store, and 1-Click Demo Unlock steady in AI Studio Preview
 *   whenever DB_HOST is left empty.
 * - Automatically switches to Hostinger MySQL (127.0.0.1:3306), Hostinger $PORT, and strict
 *   ADMIN_PASSKEY authentication the moment Hostinger hPanel environment variables are set.
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
  const isLiveProductionDb =
    process.env.NODE_ENV === 'production' && isHostingerMysqlConfigured();
  if (!isLiveProductionDb) {
    return true;
  }
  return !Boolean(process.env.ADMIN_PASSKEY?.trim());
}

export function getRuntimePostureSnapshot(): RuntimePostureSnapshot {
  const mysqlReady = isHostingerMysqlConfigured();
  const host = resolveMysqlHost();
  const port = resolveMysqlPort();
  const adminPasskeyConfigured = Boolean(process.env.ADMIN_PASSKEY?.trim());
  const sessionSecretConfigured = Boolean(
    process.env.ADMIN_SESSION_SECRET?.trim()
  );
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
    mode: mysqlReady ? 'hostinger-production' : 'preview-demo',
    activePort: resolveRuntimePort(),
    storageDriver: mysqlReady ? 'hostinger-mysql' : 'preview-memory',
    mysqlHostDisplay: mysqlReady ? `${host}:${port}` : '127.0.0.1:3306 (awaiting env)',
    demoUnlockEnabled: isPreviewDemoUnlockAllowed(),
    adminPasskeyConfigured,
    sessionSecretConfigured,
    driveProxyConfigured,
    r2PublicDomain,
    igWebhookConfigured,
  };
}
