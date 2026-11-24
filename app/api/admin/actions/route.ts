// app/api/admin/actions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  beginAdminTotpEnrollment,
  checkAuthRateLimit,
  clearAdminSessionCookie,
  clearAuthFailureCount,
  confirmAdminTotpEnrollment,
  disableAdminTotpEnrollment,
  enforceMinElapsedMs,
  generateAdminPasswordHash,
  getAdminMfaStatus,
  getRequestIpHash,
  recordFailedAuthAttempt,
  requireAdminSession,
  revokeAllAdminSessions,
  verifyAdminSecondFactor,
  verifyOrClaimAdminPasskey,
} from '@/lib/dal/auth';
import { readBoundedJsonBody } from '@/lib/security/publicRequestGuard';
import { archiveRepository } from '@/lib/storage/repository';
import { parseMultilineTimestamps } from '@/lib/media/resolveMediaUrl';
import {
  ContrastMode,
  FlacVersionSource,
  FlyerPresetStyle,
  FutureTaskLedgerItem,
  MediaSourceType,
  SceneArtist,
  SeasonTheme,
  SubscriberCsvRow,
  TaskPriority,
  TaskStatus,
} from '@/types/archive';

function parseHashtags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((t) => String(t || '').trim().toLowerCase().replace(/^#+/, ''))
      .filter(Boolean);
  }
  return String(raw || '')
    .split(/[\s,]+/)
    .map((t) => t.trim().toLowerCase().replace(/^#+/, ''))
    .filter(Boolean);
}

function parseMediaSource(
  raw: unknown,
  allowed: MediaSourceType[],
  fallback: MediaSourceType
): MediaSourceType {
  return allowed.includes(raw as MediaSourceType)
    ? (raw as MediaSourceType)
    : fallback;
}

async function auditAndRespond(
  actionName: string,
  targetId: string | null,
  payload: Record<string, unknown>
) {
  await archiveRepository.recordAuditLog(actionName, targetId);
  const auditPage = await archiveRepository.queryAuditLogs({
    filter: 'all',
    page: 1,
    pageSize: 50,
  });
  return NextResponse.json({
    ok: true,
    ...payload,
    auditLogs: auditPage.logs,
    auditTotal: auditPage.total,
  });
}

async function verifyStepUpCredentials(
  req: NextRequest,
  passphrase: string,
  verificationCode: string
): Promise<
  | { ok: true }
  | { ok: false; response: NextResponse }
> {
  const startedAtMs = Date.now();
  const ipHash = getRequestIpHash(req);
  const rateCheck = await checkAuthRateLimit(ipHash);
  if (!rateCheck.allowed) {
    await enforceMinElapsedMs(startedAtMs, rateCheck.minDelayMs);
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Too many failed verification attempts. Retry in ${rateCheck.retryAfterSec}s.`,
          retryAfterSec: rateCheck.retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateCheck.retryAfterSec) },
        }
      ),
    };
  }

  const validPassphrase = await verifyOrClaimAdminPasskey(passphrase);
  if (!validPassphrase) {
    const failRes = await recordFailedAuthAttempt(ipHash);
    await archiveRepository.recordAuditLog(
      failRes.lockedNow ? 'LOCKOUT_TRIGGERED' : 'LOGIN_FAILED',
      `stepup:${ipHash.slice(0, 12)}`
    );
    await enforceMinElapsedMs(startedAtMs, failRes.minDelayMs);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Current curator passphrase is incorrect.' },
        { status: failRes.lockedNow || failRes.globalBurstNow ? 429 : 401 }
      ),
    };
  }

  const secondFactor = await verifyAdminSecondFactor(verificationCode);
  if (!secondFactor.ok) {
    const failRes = await recordFailedAuthAttempt(ipHash);
    const eventName =
      secondFactor.reason === 'replay_blocked'
        ? 'totp_replay_blocked'
        : failRes.lockedNow
        ? 'LOCKOUT_TRIGGERED'
        : 'TOTP_FAILED';
    await archiveRepository.recordAuditLog(
      eventName,
      `stepup:${ipHash.slice(0, 12)}`
    );
    await enforceMinElapsedMs(startedAtMs, failRes.minDelayMs);
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            secondFactor.reason === 'replay_blocked'
              ? 'This 6-digit code was already used. Wait for the next 30-second code.'
              : 'Invalid 6-digit authenticator or backup recovery code.',
        },
        { status: failRes.lockedNow || failRes.globalBurstNow ? 429 : 401 }
      ),
    };
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

  return { ok: true };
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession(req);
  } catch {
    return NextResponse.json(
      { error: 'Unauthorized admin session' },
      { status: 401 }
    );
  }

  const boundedBody = await readBoundedJsonBody<Record<string, unknown>>(
    req,
    32768
  );
  if (!boundedBody.ok) {
    return NextResponse.json(
      { error: boundedBody.error },
      { status: boundedBody.status }
    );
  }

  try {
    const body = boundedBody.data as Record<string, any>;
    const { action } = body;

    // 0. Session Revocation, Passphrase Hash Generator & Two-Phase TOTP 2FA
    if (action === 'revoke-all-sessions') {
      const revokedCount = await revokeAllAdminSessions();
      await archiveRepository.recordAuditLog(
        'REVOKE_ALL_SESSIONS',
        `count:${revokedCount}`
      );
      const res = NextResponse.json({ ok: true, revokedCount });
      clearAdminSessionCookie(res, req);
      return res;
    }

    if (action === 'begin-totp-setup') {
      const currentStatus = await getAdminMfaStatus();
      if (currentStatus.dbEnabled) {
        return NextResponse.json(
          {
            error:
              'Authenticator 2FA is already active. Use Rotate Authenticator Device with your passphrase and current 2FA code.',
          },
          { status: 400 }
        );
      }
      const setup = await beginAdminTotpEnrollment();
      return NextResponse.json({
        ok: true,
        ...setup,
      });
    }

    if (action === 'confirm-totp-setup') {
      const totpCode =
        typeof body.totpCode === 'string' ? body.totpCode.trim() : '';
      if (!totpCode) {
        return NextResponse.json(
          { error: 'Enter the 6-digit code from your authenticator app.' },
          { status: 400 }
        );
      }
      const confirmed = await confirmAdminTotpEnrollment(totpCode, req);
      if (!confirmed.ok) {
        if (confirmed.replayBlocked) {
          const ipHash = getRequestIpHash(req);
          await archiveRepository.recordAuditLog(
            'totp_replay_blocked',
            `setup:${ipHash.slice(0, 12)}`
          );
        }
        return NextResponse.json({ error: confirmed.error }, { status: 400 });
      }
      return auditAndRespond(
        'totp_enrolled',
        `revoked_other:${confirmed.revokedOtherSessions}`,
        {
          recoveryCodes: confirmed.recoveryCodes,
          revokedOtherSessions: confirmed.revokedOtherSessions,
          mfaStatus: confirmed.mfaStatus,
        }
      );
    }

    if (action === 'rotate-totp-setup') {
      const passphrase =
        typeof body.currentPassphrase === 'string'
          ? body.currentPassphrase
          : '';
      const verificationCode =
        typeof body.verificationCode === 'string'
          ? body.verificationCode
          : '';
      if (!passphrase.trim() || !verificationCode.trim()) {
        return NextResponse.json(
          {
            error:
              'Current passphrase and a valid 6-digit TOTP or recovery code are required to rotate devices.',
          },
          { status: 400 }
        );
      }

      const stepUp = await verifyStepUpCredentials(
        req,
        passphrase,
        verificationCode
      );
      if (!stepUp.ok) {
        return stepUp.response;
      }

      const setup = await beginAdminTotpEnrollment();
      const auditPage = await archiveRepository.queryAuditLogs({
        filter: 'all',
        page: 1,
        pageSize: 50,
      });
      return NextResponse.json({
        ok: true,
        ...setup,
        auditLogs: auditPage.logs,
        auditTotal: auditPage.total,
      });
    }

    if (action === 'disable-totp') {
      const passphrase =
        typeof body.currentPassphrase === 'string'
          ? body.currentPassphrase
          : '';
      const verificationCode =
        typeof body.verificationCode === 'string'
          ? body.verificationCode
          : '';
      if (!passphrase.trim() || !verificationCode.trim()) {
        return NextResponse.json(
          {
            error:
              'Current passphrase and a valid 6-digit TOTP or recovery code are required to disable 2FA.',
          },
          { status: 400 }
        );
      }

      const stepUp = await verifyStepUpCredentials(
        req,
        passphrase,
        verificationCode
      );
      if (!stepUp.ok) {
        return stepUp.response;
      }

      const mfaStatus = await disableAdminTotpEnrollment();
      return auditAndRespond('totp_disabled', 'admin_mfa_config', {
        mfaStatus,
      });
    }

    if (action === 'generate-password-hash') {
      const passphrase =
        typeof body.passphrase === 'string' ? body.passphrase : '';
      if (passphrase.length < 16) {
        return NextResponse.json(
          { error: 'Passphrase must be at least 16 characters long.' },
          { status: 400 }
        );
      }
      if (passphrase.length > 256) {
        return NextResponse.json(
          { error: 'Passphrase must not exceed 256 characters.' },
          { status: 400 }
        );
      }
      const passwordHash = await generateAdminPasswordHash(passphrase);
      return auditAndRespond('HASH_GENERATED', `len:${passphrase.length}`, {
        passwordHash,
        envLine: `ADMIN_PASSWORD_HASH="${passwordHash}"`,
      });
    }

    if (action === 'simulate-ig-sold') {
      const auctionId = String(body.auctionId || '').trim();
      if (!auctionId) {
        return NextResponse.json(
          { error: 'auctionId is required' },
          { status: 400 }
        );
      }
      const updated = await archiveRepository.markAuctionSoldByMediaOrId({
        auctionId,
        sold: true,
      });
      if (!updated) {
        return NextResponse.json(
          { error: 'Auction item not found' },
          { status: 404 }
        );
      }
      return auditAndRespond('SIMULATE_IG_SOLD', auctionId, {
        auction: updated,
      });
    }

    // 1. Theme & Site Config
    if (action === 'update-site-settings') {
      const allowedSeasons: SeasonTheme[] = [
        'fall',
        'spring',
        'summer',
        'winter',
      ];
      const allowedContrasts: ContrastMode[] = ['light', 'dark'];

      const patch: Record<string, unknown> = {};
      if (allowedSeasons.includes(body.seasonTheme)) {
        patch.seasonTheme = body.seasonTheme;
      }
      if (allowedContrasts.includes(body.defaultContrast)) {
        patch.defaultContrast = body.defaultContrast;
      }
      if (typeof body.archiveSubmissionEmail === 'string') {
        patch.archiveSubmissionEmail = body.archiveSubmissionEmail.trim();
      }
      if (typeof body.calendarSubmissionEmail === 'string') {
        patch.calendarSubmissionEmail = body.calendarSubmissionEmail.trim();
      }
      if (typeof body.auctionSubmissionEmail === 'string') {
        patch.auctionSubmissionEmail = body.auctionSubmissionEmail.trim();
      }

      const siteSettings = await archiveRepository.updateSiteSettings(patch);
      return auditAndRespond('UPDATE_SITE_SETTINGS', 'site_config', {
        siteSettings,
      });
    }

    // 2. Videos CRUD (Create, Post-Entry Update + Timestamps[], Delete)
    if (action === 'add-video') {
      const timestamps = Array.isArray(body.timestamps)
        ? body.timestamps
        : parseMultilineTimestamps(
            String(body.timestampsText || '00:00 Full Set')
          );
      const video = await archiveRepository.addVideoTape({
        title: String(body.title || ''),
        venue: String(body.venue || ''),
        filmer: String(body.filmer || ''),
        recordedDate: String(body.recordedDate || ''),
        youtubeIdOrUrl: String(body.youtubeIdOrUrl || ''),
        posterSourceType: parseMediaSource(
          body.posterSourceType,
          ['embedded', 'gdrive', 'r2'],
          'embedded'
        ),
        posterSourceIdOrUrl: String(body.posterSourceIdOrUrl || ''),
        timestamps,
        tags: parseHashtags(body.tags ?? body.tagsText),
      });
      return auditAndRespond('ADD_VIDEO', video.id, { video });
    }

    if (action === 'update-video') {
      const id = String(body.id || '').trim();
      if (!id) {
        return NextResponse.json(
          { error: 'Video ID is required' },
          { status: 400 }
        );
      }
      const timestamps = Array.isArray(body.timestamps)
        ? body.timestamps
        : typeof body.timestampsText === 'string'
        ? parseMultilineTimestamps(body.timestampsText)
        : undefined;

      const video = await archiveRepository.updateVideoTape(id, {
        title: typeof body.title === 'string' ? body.title : undefined,
        venue: typeof body.venue === 'string' ? body.venue : undefined,
        filmer: typeof body.filmer === 'string' ? body.filmer : undefined,
        recordedDate:
          typeof body.recordedDate === 'string' ? body.recordedDate : undefined,
        youtubeIdOrUrl:
          typeof body.youtubeIdOrUrl === 'string'
            ? body.youtubeIdOrUrl
            : undefined,
        posterSourceType: body.posterSourceType
          ? parseMediaSource(
              body.posterSourceType,
              ['embedded', 'gdrive', 'r2'],
              'embedded'
            )
          : undefined,
        posterSourceIdOrUrl:
          typeof body.posterSourceIdOrUrl === 'string'
            ? body.posterSourceIdOrUrl
            : undefined,
        posterUrl:
          typeof body.posterUrl === 'string' ? body.posterUrl : undefined,
        timestamps,
        tags:
          body.tags !== undefined || body.tagsText !== undefined
            ? parseHashtags(body.tags ?? body.tagsText)
            : undefined,
      });
      if (!video) {
        return NextResponse.json(
          { error: 'Video tape not found' },
          { status: 404 }
        );
      }
      return auditAndRespond('UPDATE_VIDEO', video.id, { video });
    }

    if (action === 'delete-video') {
      const id = String(body.id || '').trim();
      await archiveRepository.deleteVideoTape(id);
      return auditAndRespond('DELETE_VIDEO', id, {});
    }

    // 3. FLAC Audio CRUD (Create, Post-Entry Update + AltVersions + LUFS + Artwork + Peaks, Delete)
    if (action === 'add-flac') {
      const sourceType = parseMediaSource(
        body.sourceType,
        ['samply', 'gdrive', 'r2', 'embedded'],
        'samply'
      );
      const bitDepth = Number(body.bitDepth) === 16 ? 16 : 24;
      const rawSr = Number(body.sampleRateHz);
      const sampleRateHz: 44100 | 48000 | 96000 =
        rawSr === 96000 ? 96000 : rawSr === 44100 ? 44100 : 48000;

      const rawAltTakes = Array.isArray(body.altTakes) ? body.altTakes : [];
      const altTakes = rawAltTakes
        .map((t: Record<string, unknown>) => ({
          label: String(t?.label || '').trim(),
          sourceType: parseMediaSource(
            t?.sourceType,
            ['samply', 'gdrive', 'r2', 'embedded'],
            'gdrive'
          ),
          sourceIdOrUrl: String(t?.sourceIdOrUrl || '').trim(),
          bitDepth: (Number(t?.bitDepth) === 16 ? 16 : 24) as 16 | 24,
          sampleRateHz: (Number(t?.sampleRateHz) === 96000
            ? 96000
            : Number(t?.sampleRateHz) === 44100
            ? 44100
            : 48000) as 44100 | 48000 | 96000,
        }))
        .filter((t: { label: string }) => Boolean(t.label));

      const track = await archiveRepository.addFlacRecording({
        title: String(body.title || ''),
        artist: String(body.artist || ''),
        venue: String(body.venue || ''),
        recordedDate: String(body.recordedDate || ''),
        durationSec: Number(body.durationSec) || 180,
        bitDepth,
        sampleRateHz,
        sourceType,
        sourceIdOrUrl: String(body.sourceIdOrUrl || ''),
        artworkUrl:
          typeof body.artworkUrl === 'string' ? body.artworkUrl : undefined,
        artworkSourceType: body.artworkSourceType
          ? parseMediaSource(
              body.artworkSourceType,
              ['embedded', 'gdrive', 'r2'],
              'embedded'
            )
          : undefined,
        artworkSourceIdOrUrl:
          typeof body.artworkSourceIdOrUrl === 'string'
            ? body.artworkSourceIdOrUrl
            : undefined,
        primaryTakeLabel: body.primaryTakeLabel
          ? String(body.primaryTakeLabel)
          : undefined,
        altTakes,
        loudnessLufs:
          typeof body.loudnessLufs === 'number' &&
          Number.isFinite(body.loudnessLufs)
            ? body.loudnessLufs
            : undefined,
        previewRootHz: Number(body.previewRootHz) || 196.0,
        waveformPeaks: Array.isArray(body.waveformPeaks)
          ? body.waveformPeaks
          : undefined,
        tags: parseHashtags(body.tags ?? body.tagsText),
      });
      return auditAndRespond('ADD_FLAC', track.id, { track });
    }

    if (action === 'update-flac') {
      const id = String(body.id || '').trim();
      if (!id) {
        return NextResponse.json(
          { error: 'FLAC track ID is required' },
          { status: 400 }
        );
      }
      const rawSr = Number(body.sampleRateHz);
      const sampleRateHz: 44100 | 48000 | 96000 | undefined =
        body.sampleRateHz !== undefined
          ? rawSr === 96000
            ? 96000
            : rawSr === 44100
            ? 44100
            : 48000
          : undefined;

      const altVersions: FlacVersionSource[] | undefined = Array.isArray(
        body.altVersions
      )
        ? body.altVersions.map((v: Record<string, unknown>, idx: number) => ({
            id: String(v?.id || `v-edit-${idx}-${Date.now()}`),
            label: String(v?.label || '').trim(),
            specLabel: v?.specLabel ? String(v.specLabel) : undefined,
            streamUrl: String(v?.streamUrl || '').trim(),
            variantKind:
              idx === 0 || v?.variantKind === 'primary' ? 'primary' : 'alt',
          }))
        : undefined;

      const track = await archiveRepository.updateFlacRecording(id, {
        title: typeof body.title === 'string' ? body.title : undefined,
        artist: typeof body.artist === 'string' ? body.artist : undefined,
        venue: typeof body.venue === 'string' ? body.venue : undefined,
        recordedDate:
          typeof body.recordedDate === 'string' ? body.recordedDate : undefined,
        durationSec:
          body.durationSec !== undefined ? Number(body.durationSec) : undefined,
        bitDepth:
          body.bitDepth !== undefined
            ? Number(body.bitDepth) === 16
              ? 16
              : 24
            : undefined,
        sampleRateHz,
        sourceType: body.sourceType
          ? parseMediaSource(
              body.sourceType,
              ['samply', 'gdrive', 'r2', 'embedded'],
              'samply'
            )
          : undefined,
        sourceIdOrUrl:
          typeof body.sourceIdOrUrl === 'string'
            ? body.sourceIdOrUrl
            : undefined,
        loudnessLufs:
          body.loudnessLufs !== undefined &&
          Number.isFinite(Number(body.loudnessLufs))
            ? Number(body.loudnessLufs)
            : undefined,
        artworkUrl:
          typeof body.artworkUrl === 'string' ? body.artworkUrl : undefined,
        artworkSourceType: body.artworkSourceType
          ? parseMediaSource(
              body.artworkSourceType,
              ['embedded', 'gdrive', 'r2'],
              'embedded'
            )
          : undefined,
        artworkSourceIdOrUrl:
          typeof body.artworkSourceIdOrUrl === 'string'
            ? body.artworkSourceIdOrUrl
            : undefined,
        previewRootHz:
          body.previewRootHz !== undefined
            ? Number(body.previewRootHz)
            : undefined,
        altVersions,
        waveformPeaks: Array.isArray(body.waveformPeaks)
          ? body.waveformPeaks
          : undefined,
        tags:
          body.tags !== undefined || body.tagsText !== undefined
            ? parseHashtags(body.tags ?? body.tagsText)
            : undefined,
      });
      if (!track) {
        return NextResponse.json(
          { error: 'FLAC recording not found' },
          { status: 404 }
        );
      }
      return auditAndRespond('UPDATE_FLAC', track.id, { track });
    }

    if (action === 'delete-flac') {
      const id = String(body.id || '').trim();
      await archiveRepository.deleteFlacRecording(id);
      return auditAndRespond('DELETE_FLAC', id, {});
    }

    // 4. 35mm Photos CRUD (Create, Update, Delete)
    if (action === 'add-photo') {
      const sourceType = parseMediaSource(
        body.sourceType,
        ['gdrive', 'r2', 'embedded'],
        'embedded'
      );
      const photo = await archiveRepository.addPhotoPlate({
        title: String(body.title || ''),
        photographer: String(body.photographer || ''),
        venue: String(body.venue || ''),
        year: String(body.year || '2026'),
        sourceType,
        sourceIdOrUrl: String(body.sourceIdOrUrl || ''),
        dimensionsLabel: body.dimensionsLabel
          ? String(body.dimensionsLabel)
          : undefined,
        tags: parseHashtags(body.tags ?? body.tagsText),
      });
      return auditAndRespond('ADD_PHOTO', photo.id, { photo });
    }

    if (action === 'update-photo') {
      const id = String(body.id || '').trim();
      if (!id) {
        return NextResponse.json(
          { error: 'Photo ID is required' },
          { status: 400 }
        );
      }
      const photo = await archiveRepository.updatePhotoPlate(id, {
        title: typeof body.title === 'string' ? body.title : undefined,
        photographer:
          typeof body.photographer === 'string' ? body.photographer : undefined,
        venue: typeof body.venue === 'string' ? body.venue : undefined,
        year: typeof body.year === 'string' ? body.year : undefined,
        sourceType: body.sourceType
          ? parseMediaSource(
              body.sourceType,
              ['gdrive', 'r2', 'embedded'],
              'embedded'
            )
          : undefined,
        sourceIdOrUrl:
          typeof body.sourceIdOrUrl === 'string'
            ? body.sourceIdOrUrl
            : undefined,
        dimensionsLabel:
          typeof body.dimensionsLabel === 'string'
            ? body.dimensionsLabel
            : undefined,
        imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
        tags:
          body.tags !== undefined || body.tagsText !== undefined
            ? parseHashtags(body.tags ?? body.tagsText)
            : undefined,
      });
      if (!photo) {
        return NextResponse.json(
          { error: 'Photo plate not found' },
          { status: 404 }
        );
      }
      return auditAndRespond('UPDATE_PHOTO', photo.id, { photo });
    }

    if (action === 'delete-photo') {
      const id = String(body.id || '').trim();
      await archiveRepository.deletePhotoPlate(id);
      return auditAndRespond('DELETE_PHOTO', id, {});
    }

    // 5. Scene Artists & Bands CRUD (Create, Update, Toggle, Delete)
    if (action === 'add-artist') {
      const role: SceneArtist['role'] = [
        'Band',
        'Musician',
        'Photographer',
        'Videographer',
        'Collective',
      ].includes(body.role)
        ? body.role
        : 'Band';
      const artist = await archiveRepository.addSceneArtist({
        name: String(body.name || ''),
        role,
        genre: String(body.genre || ''),
        area: String(body.area || 'Greenville, SC'),
        active: body.active !== false,
        tags: parseHashtags(body.tags ?? body.tagsText),
      });
      return auditAndRespond('ADD_ARTIST', artist.id, { artist });
    }

    if (action === 'update-artist') {
      const id = String(body.id || '').trim();
      if (!id) {
        return NextResponse.json(
          { error: 'Artist ID is required' },
          { status: 400 }
        );
      }
      const role: SceneArtist['role'] | undefined = [
        'Band',
        'Musician',
        'Photographer',
        'Videographer',
        'Collective',
      ].includes(body.role)
        ? body.role
        : undefined;

      const artist = await archiveRepository.updateSceneArtist(id, {
        name: typeof body.name === 'string' ? body.name : undefined,
        role,
        genre: typeof body.genre === 'string' ? body.genre : undefined,
        area: typeof body.area === 'string' ? body.area : undefined,
        active: typeof body.active === 'boolean' ? body.active : undefined,
        tags:
          body.tags !== undefined || body.tagsText !== undefined
            ? parseHashtags(body.tags ?? body.tagsText)
            : undefined,
      });
      if (!artist) {
        return NextResponse.json(
          { error: 'Artist not found' },
          { status: 404 }
        );
      }
      return auditAndRespond('UPDATE_ARTIST', artist.id, { artist });
    }

    if (action === 'toggle-artist-active') {
      const id = String(body.id || '').trim();
      const artist = await archiveRepository.toggleSceneArtistActive(id);
      return auditAndRespond('TOGGLE_ARTIST_ACTIVE', id, { artist });
    }

    if (action === 'delete-artist') {
      const id = String(body.id || '').trim();
      await archiveRepository.deleteSceneArtist(id);
      return auditAndRespond('DELETE_ARTIST', id, {});
    }

    // 6. Timeline Eras & Places to Remember CRUD
    if (action === 'add-era') {
      const era = await archiveRepository.addTimelineEra({
        eraRange: String(body.eraRange || ''),
        dialShortLabel: String(body.dialShortLabel || ''),
        title: String(body.title || ''),
        summary: String(body.summary || ''),
        sourceType: parseMediaSource(
          body.sourceType,
          ['embedded', 'gdrive', 'r2'],
          'embedded'
        ),
        sourceIdOrUrl: String(body.sourceIdOrUrl || ''),
        portholeImageUrl:
          typeof body.portholeImageUrl === 'string'
            ? body.portholeImageUrl
            : undefined,
      });
      return auditAndRespond('ADD_ERA', era.id, { era });
    }

    if (action === 'update-era') {
      const id = String(body.id || '').trim();
      if (!id) {
        return NextResponse.json(
          { error: 'Timeline era ID is required' },
          { status: 400 }
        );
      }
      const era = await archiveRepository.updateTimelineEra(id, {
        eraRange: typeof body.eraRange === 'string' ? body.eraRange : undefined,
        dialShortLabel:
          typeof body.dialShortLabel === 'string'
            ? body.dialShortLabel
            : undefined,
        title: typeof body.title === 'string' ? body.title : undefined,
        summary: typeof body.summary === 'string' ? body.summary : undefined,
        sourceType: body.sourceType
          ? parseMediaSource(
              body.sourceType,
              ['embedded', 'gdrive', 'r2'],
              'embedded'
            )
          : undefined,
        sourceIdOrUrl:
          typeof body.sourceIdOrUrl === 'string'
            ? body.sourceIdOrUrl
            : undefined,
        portholeImageUrl:
          typeof body.portholeImageUrl === 'string'
            ? body.portholeImageUrl
            : undefined,
      });
      if (!era) {
        return NextResponse.json(
          { error: 'Timeline era not found' },
          { status: 404 }
        );
      }
      return auditAndRespond('UPDATE_ERA', era.id, { era });
    }

    if (action === 'reorder-eras') {
      const orderedIds = Array.isArray(body.orderedIds)
        ? body.orderedIds.map((v: unknown) => String(v || '').trim()).filter(Boolean)
        : [];
      const timeline = await archiveRepository.reorderTimelineEras(orderedIds);
      return auditAndRespond(
        'REORDER_ERAS',
        `count:${timeline.length}`,
        { timeline }
      );
    }

    if (action === 'delete-era') {
      const id = String(body.id || '').trim();
      await archiveRepository.deleteTimelineEra(id);
      return auditAndRespond('DELETE_ERA', id, {});
    }

    if (action === 'add-place') {
      const place = await archiveRepository.addRememberedPlace({
        name: String(body.name || ''),
        closedSortIso: String(body.closedSortIso || '2024-12'),
        closedDisplayLabel: String(body.closedDisplayLabel || 'Remembered Space'),
        location: String(body.location || 'Greenville, SC'),
        sourceType: parseMediaSource(
          body.sourceType,
          ['embedded', 'gdrive', 'r2'],
          'embedded'
        ),
        sourceIdOrUrl: String(body.sourceIdOrUrl || ''),
        imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
        memorialStory: String(body.memorialStory || ''),
        tags: parseHashtags(body.tags ?? body.tagsText),
      });
      return auditAndRespond('ADD_PLACE', place.id, { place });
    }

    if (action === 'update-place') {
      const id = String(body.id || '').trim();
      if (!id) {
        return NextResponse.json(
          { error: 'Remembered place ID is required' },
          { status: 400 }
        );
      }
      const place = await archiveRepository.updateRememberedPlace(id, {
        name: typeof body.name === 'string' ? body.name : undefined,
        closedSortIso:
          typeof body.closedSortIso === 'string'
            ? body.closedSortIso
            : undefined,
        closedDisplayLabel:
          typeof body.closedDisplayLabel === 'string'
            ? body.closedDisplayLabel
            : undefined,
        location: typeof body.location === 'string' ? body.location : undefined,
        sourceType: body.sourceType
          ? parseMediaSource(
              body.sourceType,
              ['embedded', 'gdrive', 'r2'],
              'embedded'
            )
          : undefined,
        sourceIdOrUrl:
          typeof body.sourceIdOrUrl === 'string'
            ? body.sourceIdOrUrl
            : undefined,
        imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
        memorialStory:
          typeof body.memorialStory === 'string'
            ? body.memorialStory
            : undefined,
        tags:
          body.tags !== undefined || body.tagsText !== undefined
            ? parseHashtags(body.tags ?? body.tagsText)
            : undefined,
      });
      if (!place) {
        return NextResponse.json(
          { error: 'Remembered place not found' },
          { status: 404 }
        );
      }
      return auditAndRespond('UPDATE_PLACE', place.id, { place });
    }

    if (action === 'delete-place') {
      const id = String(body.id || '').trim();
      await archiveRepository.deleteRememberedPlace(id);
      return auditAndRespond('DELETE_PLACE', id, {});
    }

    // 7. Comment & Scene Chat Moderation
    if (action === 'delete-comment') {
      const commentId = String(body.commentId || '').trim();
      await archiveRepository.deleteComment(
        String(body.targetItemId || ''),
        commentId
      );
      return auditAndRespond('DELETE_COMMENT', commentId, {});
    }

    if (action === 'delete-scene-chat') {
      const id = String(body.id || '').trim();
      if (!id) {
        return NextResponse.json(
          { error: 'Scene chat message ID is required' },
          { status: 400 }
        );
      }
      await archiveRepository.deleteSceneChatMessage(id);
      return auditAndRespond('DELETE_SCENE_CHAT', id, {});
    }

    // 8. Barter Market Auctions CRUD (Create, Update, Toggle, Delete)
    if (action === 'toggle-auction-sold') {
      const auctionId = String(body.auctionId || '').trim();
      const updated = await archiveRepository.markAuctionSoldByMediaOrId({
        auctionId,
        sold: Boolean(body.sold),
      });
      return auditAndRespond('TOGGLE_AUCTION_SOLD', auctionId, {
        auction: updated,
      });
    }

    if (action === 'add-auction') {
      const sourceType = parseMediaSource(
        body.sourceType,
        ['gdrive', 'r2', 'embedded'],
        'embedded'
      );
      const created = await archiveRepository.addAuctionItem({
        title: String(body.title || ''),
        ownerUsername: String(body.ownerUsername || ''),
        openingBid: String(body.openingBid || '$30'),
        pickupArea: String(body.pickupArea || 'Greenville Local Pickup'),
        sourceType,
        sourceIdOrUrl: String(body.sourceIdOrUrl || ''),
        igMediaId:
          typeof body.igMediaId === 'string' ? body.igMediaId : undefined,
        igPermalink: String(body.igPermalink || 'https://www.instagram.com/'),
        tags:
          body.tags !== undefined || body.tagsText !== undefined
            ? parseHashtags(body.tags ?? body.tagsText)
            : undefined,
      });
      return auditAndRespond('ADD_AUCTION', created.id, { auction: created });
    }

    if (action === 'update-auction') {
      const id = String(body.id || '').trim();
      if (!id) {
        return NextResponse.json(
          { error: 'Auction ID is required' },
          { status: 400 }
        );
      }
      const updated = await archiveRepository.updateAuctionItem(id, {
        title: typeof body.title === 'string' ? body.title : undefined,
        ownerUsername:
          typeof body.ownerUsername === 'string'
            ? body.ownerUsername
            : undefined,
        currentBidLabel:
          typeof body.currentBidLabel === 'string'
            ? body.currentBidLabel
            : undefined,
        pickupArea:
          typeof body.pickupArea === 'string' ? body.pickupArea : undefined,
        sourceType: body.sourceType
          ? parseMediaSource(
              body.sourceType,
              ['gdrive', 'r2', 'embedded'],
              'embedded'
            )
          : undefined,
        sourceIdOrUrl:
          typeof body.sourceIdOrUrl === 'string'
            ? body.sourceIdOrUrl
            : undefined,
        imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
        igMediaId:
          typeof body.igMediaId === 'string' ? body.igMediaId : undefined,
        igPermalink:
          typeof body.igPermalink === 'string' ? body.igPermalink : undefined,
        sold: typeof body.sold === 'boolean' ? body.sold : undefined,
        tags:
          body.tags !== undefined || body.tagsText !== undefined
            ? parseHashtags(body.tags ?? body.tagsText)
            : undefined,
      });
      if (!updated) {
        return NextResponse.json(
          { error: 'Auction item not found' },
          { status: 404 }
        );
      }
      return auditAndRespond('UPDATE_AUCTION', updated.id, {
        auction: updated,
      });
    }

    if (action === 'delete-auction') {
      const id = String(body.id || '').trim();
      await archiveRepository.deleteAuctionItem(id);
      return auditAndRespond('DELETE_AUCTION', id, {});
    }

    // 9. Calendar Shows CRUD (BUG-02 Fixed: Any YYYY-MM-DD Date + Scoped Custom CSS + Tags)
    if (action === 'publish-show') {
      const fallbackMonth =
        typeof body.monthKey === 'string' && /^\d{4}-\d{2}$/.test(body.monthKey)
          ? body.monthKey
          : '2026-11';
      const fallbackDay = String(
        Math.max(1, Math.min(31, Number(body.dayOfMonth) || 21))
      ).padStart(2, '0');
      const isoDate =
        typeof body.isoDate === 'string' && body.isoDate.trim()
          ? body.isoDate.trim()
          : `${fallbackMonth}-${fallbackDay}`;

      const flyerStyle: FlyerPresetStyle = [
        'punk-xerox',
        'concrete-stencil',
        'riso-zine',
        'custom-css',
      ].includes(body.flyerStyle)
        ? body.flyerStyle
        : 'punk-xerox';

      const created = await archiveRepository.publishCalendarShow({
        isoDate,
        title: String(body.title || '').trim(),
        venue: String(body.venue || '').trim(),
        doorsInfo: String(body.doorsInfo || '8:00 PM · DIY Bill').trim(),
        flyerStyle,
        flyerHeadlineNote: String(body.flyerHeadlineNote || '').trim(),
        scopedCustomCss:
          typeof body.scopedCustomCss === 'string'
            ? body.scopedCustomCss
            : undefined,
        tags:
          body.tags !== undefined || body.tagsText !== undefined
            ? parseHashtags(body.tags ?? body.tagsText)
            : ['greenville', 'diy'],
      });
      return auditAndRespond('PUBLISH_SHOW', created.id, { show: created });
    }

    if (action === 'update-show') {
      const id = String(body.id || '').trim();
      if (!id) {
        return NextResponse.json(
          { error: 'Show ID is required' },
          { status: 400 }
        );
      }
      const flyerStyle: FlyerPresetStyle | undefined = [
        'punk-xerox',
        'concrete-stencil',
        'riso-zine',
        'custom-css',
      ].includes(body.flyerStyle)
        ? body.flyerStyle
        : undefined;

      const updated = await archiveRepository.updateCalendarShow(id, {
        isoDate: typeof body.isoDate === 'string' ? body.isoDate : undefined,
        title: typeof body.title === 'string' ? body.title : undefined,
        venue: typeof body.venue === 'string' ? body.venue : undefined,
        doorsInfo:
          typeof body.doorsInfo === 'string' ? body.doorsInfo : undefined,
        flyerStyle,
        flyerHeadlineNote:
          typeof body.flyerHeadlineNote === 'string'
            ? body.flyerHeadlineNote
            : undefined,
        scopedCustomCss:
          typeof body.scopedCustomCss === 'string'
            ? body.scopedCustomCss
            : undefined,
        tags:
          body.tags !== undefined || body.tagsText !== undefined
            ? parseHashtags(body.tags ?? body.tagsText)
            : undefined,
      });
      if (!updated) {
        return NextResponse.json(
          { error: 'Calendar show not found' },
          { status: 404 }
        );
      }
      return auditAndRespond('UPDATE_SHOW', updated.id, { show: updated });
    }

    if (action === 'delete-show') {
      const id = String(body.id || '').trim();
      await archiveRepository.deleteCalendarShow(id);
      return auditAndRespond('DELETE_SHOW', id, {});
    }

    // 10. Subscribers CSV (Update & Remove)
    if (action === 'update-subscriber') {
      const id = String(body.id || '').trim();
      if (!id) {
        return NextResponse.json(
          { error: 'Subscriber ID is required' },
          { status: 400 }
        );
      }
      const source: SubscriberCsvRow['source'] | undefined =
        body.source === 'Message Us' || body.source === 'Live Chat'
          ? body.source
          : undefined;
      const subscriber = await archiveRepository.updateSubscriberRow(id, {
        createdAtIso:
          typeof body.createdAtIso === 'string' ? body.createdAtIso : undefined,
        source,
        name: typeof body.name === 'string' ? body.name : undefined,
        email: typeof body.email === 'string' ? body.email : undefined,
        interests:
          typeof body.interests === 'string' ? body.interests : undefined,
      });
      if (!subscriber) {
        return NextResponse.json(
          { error: 'Subscriber not found' },
          { status: 404 }
        );
      }
      const subscribers = await archiveRepository.listSubscribersAdminOnly();
      return auditAndRespond('UPDATE_SUBSCRIBER', id, {
        subscriber,
        subscribers,
      });
    }

    if (action === 'remove-subscriber') {
      const id = String(body.id || '').trim();
      await archiveRepository.removeSubscriberRow(id);
      const subscribers = await archiveRepository.listSubscribersAdminOnly();
      return auditAndRespond('REMOVE_SUBSCRIBER', id, { subscribers });
    }

    // 11. Next-Round & Cutover Ledger
    if (action === 'add-future-task') {
      const passPhase: FutureTaskLedgerItem['passPhase'] = [
        'Pass 5',
        'Pass 6',
        'Pass 7',
        'Pass 8',
        'Pass 9',
        'Pass 10',
        'Pass 11',
        'Hostinger',
        'Storage / CDN',
      ].includes(body.passPhase)
        ? body.passPhase
        : 'Pass 10';
      const area: FutureTaskLedgerItem['area'] = [
        'Auth & Security',
        'Puck Visual Studio',
        'UI & Media',
        'Hostinger MySQL',
        'Google Drive / R2',
        'IG Webhooks',
      ].includes(body.area)
        ? body.area
        : 'UI & Media';
      const priority: TaskPriority = ['P0', 'P1', 'P2'].includes(body.priority)
        ? body.priority
        : 'P1';

      const created = await archiveRepository.addFutureTask({
        passPhase,
        title: String(body.title || '').trim(),
        area,
        priority,
        status: 'Planned',
        rationale: String(body.rationale || '').trim(),
        prerequisite: String(body.prerequisite || '').trim(),
      });
      return auditAndRespond('ADD_FUTURE_TASK', created.id, { task: created });
    }

    if (action === 'update-future-task-status') {
      const status: TaskStatus = [
        'Planned',
        'In Progress',
        'Deferred',
        'Completed',
      ].includes(body.status)
        ? body.status
        : 'Planned';
      const id = String(body.id || '').trim();
      const updated = await archiveRepository.updateFutureTaskStatus(id, status);
      return auditAndRespond('UPDATE_TASK_STATUS', `${id}:${status}`, {
        task: updated,
      });
    }

    if (action === 'delete-future-task') {
      const id = String(body.id || '').trim();
      await archiveRepository.deleteFutureTask(id);
      return auditAndRespond('DELETE_FUTURE_TASK', id, {});
    }

    return NextResponse.json(
      { error: 'Unknown admin action' },
      { status: 400 }
    );
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : 'Failed to execute admin mutation';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
