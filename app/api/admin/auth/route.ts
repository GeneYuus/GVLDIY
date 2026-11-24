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
  getAdminMfaStatus,
  getRequestIpHash,
  isPreviewDemoModeEnabled,
  recordFailedAuthAttempt,
  revokeCurrentAdminSession,
  verifyAdminSecondFactor,
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
  const mfaStatus = await getAdminMfaStatus();

  if (!authenticated) {
    const publicPayload = await archiveRepository.getPublicPayload();
    return NextResponse.json({
      authenticated: false,
      demoModeAvailable,
      mfaActive: mfaStatus.active,
      siteSettings: publicPayload.siteSettings,
    });
  }

  const adminPayload = await archiveRepository.getAdminFullPayload();
  const enrichedPayload = {
    ...adminPayload,
    runtimePosture: {
      ...adminPayload.runtimePosture,
      mfaStatus,
    },
  };

  return NextResponse.json({
    authenticated: true,
    demoModeAvailable,
    mfaStatus,
    adminPayload: enrichedPayload,
    subscribers: enrichedPayload.subscribers,
    futureTasks: enrichedPayload.futureTasks,
    auditLogs: enrichedPayload.auditLogs,
    auditTotal: enrichedPayload.auditTotal,
    siteSettings: enrichedPayload.siteSettings,
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

    if (mode === 'demo' && demoModeAvailable) {
      // Confirmed user rule: Keep Instant Demo Unlock open in non-prod preview; enforce 2FA on passphrase
      await clearAuthFailureCount(ipHash);
      await archiveRepository.recordAuditLog(
        'LOGIN_DEMO_OK',
        `ip:${ipHash.slice(0, 12)}`
      );
    } else {
      const rateCheck = await checkAuthRateLimit(ipHash);
      if (!rateCheck.allowed) {
        await enforceMinElapsedMs(startedAtMs, rateCheck.minDelayMs);
        return NextResponse.json(
          {
            error: rateCheck.isGlobalBurst
              ? `High sign-in traffic detected. Please retry in ${rateCheck.retryAfterSec}s.`
              : `Too many failed sign-in attempts from this network. Try again in ${Math.ceil(
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

      if (mode === 'demo') {
        const failRes = await recordFailedAuthAttempt(ipHash);
        await archiveRepository.recordAuditLog(
          failRes.lockedNow
            ? 'LOCKOUT_TRIGGERED'
            : failRes.globalBurstNow
            ? 'GLOBAL_BURST_THROTTLED'
            : 'LOGIN_DEMO_BLOCKED',
          `ip:${ipHash.slice(0, 12)}`
        );
        await enforceMinElapsedMs(startedAtMs, failRes.minDelayMs);
        if (failRes.lockedNow || failRes.globalBurstNow) {
          return NextResponse.json(
            {
              error: `Too many failed attempts. Retry in ${failRes.retryAfterSec}s.`,
              retryAfterSec: failRes.retryAfterSec,
            },
            {
              status: 429,
              headers: { 'Retry-After': String(failRes.retryAfterSec) },
            }
          );
        }
        return NextResponse.json(
          { error: 'Demo unlock is disabled in this environment' },
          { status: 403 }
        );
      }

      const passkey = String(body.passkey || '');
      const validPasskey = await verifyOrClaimAdminPasskey(passkey);
      if (!validPasskey) {
        const failRes = await recordFailedAuthAttempt(ipHash);
        await archiveRepository.recordAuditLog(
          failRes.lockedNow
            ? 'LOCKOUT_TRIGGERED'
            : failRes.globalBurstNow
            ? 'GLOBAL_BURST_THROTTLED'
            : 'LOGIN_FAILED',
          `ip:${ipHash.slice(0, 12)}`
        );
        await enforceMinElapsedMs(startedAtMs, failRes.minDelayMs);
        if (failRes.lockedNow || failRes.globalBurstNow) {
          return NextResponse.json(
            {
              error: failRes.lockedNow
                ? `Account locked for this IP after 5 failed attempts. Cooldown: ${Math.ceil(
                    failRes.retryAfterSec / 60
                  )} min.`
                : `High failure rate detected. Retry in ${failRes.retryAfterSec}s.`,
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

      // Check Two-Factor (RFC 6238 TOTP / Recovery Code) gate
      const mfaStatus = await getAdminMfaStatus();
      if (mfaStatus.active) {
        const rawTotp =
          typeof body.totpCode === 'string' ? body.totpCode.trim() : '';

        // Step 1: Passphrase valid, prompt for 2FA code in second step without minting session
        if (!rawTotp) {
          return NextResponse.json({
            authenticated: false,
            mfaRequired: true,
            mfaSource: mfaStatus.source,
          });
        }

        // Step 2: Validate 6-digit TOTP or XXXX-XXXX backup recovery code
        const secondFactor = await verifyAdminSecondFactor(rawTotp);
        if (!secondFactor.ok) {
          const failRes = await recordFailedAuthAttempt(ipHash);
          const eventName =
            secondFactor.reason === 'replay_blocked'
              ? 'totp_replay_blocked'
              : failRes.lockedNow
              ? 'LOCKOUT_TRIGGERED'
              : failRes.globalBurstNow
              ? 'GLOBAL_BURST_THROTTLED'
              : 'TOTP_FAILED';

          await archiveRepository.recordAuditLog(
            eventName,
            `ip:${ipHash.slice(0, 12)}`
          );
          await enforceMinElapsedMs(startedAtMs, failRes.minDelayMs);

          if (failRes.lockedNow || failRes.globalBurstNow) {
            return NextResponse.json(
              {
                error: failRes.lockedNow
                  ? `Too many failed verification attempts for this IP. Cooldown: ${Math.ceil(
                      failRes.retryAfterSec / 60
                    )} min.`
                  : `High failure rate detected. Retry in ${failRes.retryAfterSec}s.`,
                retryAfterSec: failRes.retryAfterSec,
                mfaRequired: true,
              },
              {
                status: 429,
                headers: { 'Retry-After': String(failRes.retryAfterSec) },
              }
            );
          }

          return NextResponse.json(
            {
              error:
                secondFactor.reason === 'replay_blocked'
                  ? 'This 6-digit code was already used. Wait for the next 30-second code.'
                  : 'Invalid 6-digit authenticator or backup recovery code.',
              mfaRequired: true,
            },
            { status: 401 }
          );
        }

        await clearAuthFailureCount(ipHash);
        if (secondFactor.method === 'recovery') {
          await archiveRepository.recordAuditLog(
            'recovery_code_used',
            `remaining:${secondFactor.remainingRecoveryCodes ?? 0}`
          );
        } else {
          await archiveRepository.recordAuditLog(
            'totp_verified',
            `step:${secondFactor.matchedStep ?? 0}`
          );
        }
      } else {
        await clearAuthFailureCount(ipHash);
        await archiveRepository.recordAuditLog(
          'LOGIN_PASSKEY_OK',
          `ip:${ipHash.slice(0, 12)}`
        );
      }
    }

    const token = await createAdminSession(req);
    const [adminPayload, latestMfaStatus] = await Promise.all([
      archiveRepository.getAdminFullPayload(),
      getAdminMfaStatus(),
    ]);
    const enrichedPayload = {
      ...adminPayload,
      runtimePosture: {
        ...adminPayload.runtimePosture,
        mfaStatus: latestMfaStatus,
      },
    };

    const res = NextResponse.json({
      authenticated: true,
      token,
      demoModeAvailable,
      mfaStatus: latestMfaStatus,
      adminPayload: enrichedPayload,
      subscribers: enrichedPayload.subscribers,
      futureTasks: enrichedPayload.futureTasks,
      auditLogs: enrichedPayload.auditLogs,
      auditTotal: enrichedPayload.auditTotal,
      siteSettings: enrichedPayload.siteSettings,
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
