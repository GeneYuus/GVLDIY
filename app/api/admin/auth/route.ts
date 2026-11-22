// app/api/admin/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  appendAdminSessionCookie,
  checkAuthRateLimit,
  checkProductionAuthPosture,
  clearAdminSessionCookie,
  clearAuthFailureCount,
  createAdminSession,
  enforceMinElapsedMs,
  getRequestIpHash,
  isPreviewDemoModeEnabled,
  recordFailedAuthAttempt,
  revokeCurrentAdminSession,
  verifyAdminSession,
  verifyMutationCsrf,
  verifyOrClaimAdminPasskey,
} from '@/lib/dal/auth';
import { readBoundedJsonBody } from '@/lib/security/publicRequestGuard';
import { archiveRepository } from '@/lib/storage/repository';

export async function GET(req: NextRequest) {
  const prodPosture = checkProductionAuthPosture();
  const demoModeAvailable = isPreviewDemoModeEnabled();

  if (!prodPosture.ok) {
    const publicPayload = await archiveRepository.getPublicPayload();
    return NextResponse.json(
      {
        authenticated: false,
        demoModeAvailable: false,
        setupRequired: true,
        setupError: prodPosture.reason,
        siteSettings: publicPayload.siteSettings,
      },
      { status: 503 }
    );
  }

  const authenticated = await verifyAdminSession(req);

  if (!authenticated) {
    const publicPayload = await archiveRepository.getPublicPayload();
    return NextResponse.json({
      authenticated: false,
      demoModeAvailable,
      siteSettings: publicPayload.siteSettings,
    });
  }

  const adminPayload = await archiveRepository.getAdminFullPayload();
  return NextResponse.json({
    authenticated: true,
    demoModeAvailable,
    adminPayload,
    subscribers: adminPayload.subscribers,
    futureTasks: adminPayload.futureTasks,
    auditLogs: adminPayload.auditLogs,
    siteSettings: adminPayload.siteSettings,
  });
}

export async function POST(req: NextRequest) {
  const startedAtMs = Date.now();

  if (!verifyMutationCsrf(req)) {
    await enforceMinElapsedMs(startedAtMs, 450);
    return NextResponse.json(
      { error: 'Cross-origin login request rejected' },
      { status: 403 }
    );
  }

  const prodPosture = checkProductionAuthPosture();
  if (!prodPosture.ok) {
    await enforceMinElapsedMs(startedAtMs, 450);
    return NextResponse.json(
      {
        error:
          prodPosture.reason ||
          'Production admin credentials are not configured.',
        setupRequired: true,
      },
      { status: 503 }
    );
  }

  const ipHash = getRequestIpHash(req);
  const rateCheck = await checkAuthRateLimit(ipHash);
  if (!rateCheck.allowed) {
    await enforceMinElapsedMs(startedAtMs, 450);
    return NextResponse.json(
      {
        error: `Too many failed sign-in attempts. Try again in ${Math.ceil(
          rateCheck.retryAfterSec / 60
        )} min (${rateCheck.retryAfterSec}s).`,
        retryAfterSec: rateCheck.retryAfterSec,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rateCheck.retryAfterSec) },
      }
    );
  }

  const parsedBody = await readBoundedJsonBody<Record<string, unknown>>(req, 4096);
  if (!parsedBody.ok) {
    await enforceMinElapsedMs(startedAtMs, 450);
    return NextResponse.json(
      { error: parsedBody.error },
      { status: parsedBody.status }
    );
  }

  try {
    const body = parsedBody.data;
    const mode = String(body.mode || 'passkey');
    const demoModeAvailable = isPreviewDemoModeEnabled();

    if (mode === 'demo') {
      if (!demoModeAvailable) {
        const failRes = await recordFailedAuthAttempt(ipHash);
        await archiveRepository.recordAuditLog(
          failRes.lockedNow ? 'LOCKOUT_TRIGGERED' : 'LOGIN_DEMO_BLOCKED',
          `ip:${ipHash.slice(0, 12)}`
        );
        await enforceMinElapsedMs(startedAtMs, 450);
        return NextResponse.json(
          { error: 'Demo unlock is disabled in this environment' },
          { status: 403 }
        );
      }
      await archiveRepository.recordAuditLog(
        'LOGIN_DEMO_OK',
        `ip:${ipHash.slice(0, 12)}`
      );
    } else {
      const passkey = String(body.passkey || '');
      const valid = await verifyOrClaimAdminPasskey(passkey);
      if (!valid) {
        const failRes = await recordFailedAuthAttempt(ipHash);
        await archiveRepository.recordAuditLog(
          failRes.lockedNow ? 'LOCKOUT_TRIGGERED' : 'LOGIN_FAILED',
          `ip:${ipHash.slice(0, 12)}`
        );
        await enforceMinElapsedMs(startedAtMs, 450);
        if (failRes.lockedNow) {
          return NextResponse.json(
            {
              error: `Account locked after 5 failed attempts. Cooldown: ${Math.ceil(
                failRes.retryAfterSec / 60
              )} min.`,
              retryAfterSec: failRes.retryAfterSec,
            },
            {
              status: 429,
              headers: { 'Retry-After': String(failRes.retryAfterSec) },
            }
          );
        }
        return NextResponse.json(
          { error: 'Invalid curator passkey' },
          { status: 401 }
        );
      }

      await clearAuthFailureCount(ipHash);
      await archiveRepository.recordAuditLog(
        'LOGIN_PASSKEY_OK',
        `ip:${ipHash.slice(0, 12)}`
      );
    }

    const token = await createAdminSession(req);
    const adminPayload = await archiveRepository.getAdminFullPayload();

    const res = NextResponse.json({
      authenticated: true,
      token,
      demoModeAvailable,
      adminPayload,
      subscribers: adminPayload.subscribers,
      futureTasks: adminPayload.futureTasks,
      auditLogs: adminPayload.auditLogs,
      siteSettings: adminPayload.siteSettings,
    });

    appendAdminSessionCookie(res, req, token);
    return res;
  } catch {
    await enforceMinElapsedMs(startedAtMs, 450);
    return NextResponse.json(
      { error: 'Invalid login request' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!verifyMutationCsrf(req)) {
    return NextResponse.json(
      { error: 'Cross-origin logout request rejected' },
      { status: 403 }
    );
  }

  const revoked = await revokeCurrentAdminSession(req);
  if (revoked) {
    const ipHash = getRequestIpHash(req);
    await archiveRepository.recordAuditLog(
      'SESSION_REVOKED',
      `ip:${ipHash.slice(0, 12)}`
    );
  }

  const res = NextResponse.json({ authenticated: false, revoked });
  clearAdminSessionCookie(res, req);
  return res;
}
