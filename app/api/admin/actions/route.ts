// app/api/admin/actions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/dal/auth';
import { archiveRepository } from '@/lib/storage/repository';
import { parseMultilineTimestamps } from '@/lib/media/resolveMediaUrl';
import {
  ContrastMode,
  FlyerPresetStyle,
  FutureTaskLedgerItem,
  MediaSourceType,
  SceneArtist,
  SeasonTheme,
  TaskPriority,
  TaskStatus,
} from '@/types/archive';

function parseHashtags(raw: string): string[] {
  return String(raw || '')
    .split(/[\s,]+/)
    .map((t) => t.trim().toLowerCase().replace(/^#+/, ''))
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized admin session' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // 1. Theme & Site Config
    if (action === 'update-site-settings') {
      const allowedSeasons: SeasonTheme[] = ['fall', 'spring', 'summer', 'winter'];
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
      return NextResponse.json({ ok: true, siteSettings });
    }

    // 2. Videos CRUD
    if (action === 'add-video') {
      const timestamps = Array.isArray(body.timestamps)
        ? body.timestamps
        : parseMultilineTimestamps(String(body.timestampsText || '00:00 Full Set'));
      const video = await archiveRepository.addVideoTape({
        title: String(body.title || ''),
        venue: String(body.venue || ''),
        filmer: String(body.filmer || ''),
        recordedDate: String(body.recordedDate || ''),
        youtubeIdOrUrl: String(body.youtubeIdOrUrl || ''),
        posterSourceType: (body.posterSourceType as MediaSourceType) || 'embedded',
        posterSourceIdOrUrl: String(body.posterSourceIdOrUrl || ''),
        timestamps,
        tags: Array.isArray(body.tags) ? body.tags : parseHashtags(body.tagsText),
      });
      return NextResponse.json({ ok: true, video });
    }

    if (action === 'delete-video') {
      await archiveRepository.deleteVideoTape(String(body.id || ''));
      return NextResponse.json({ ok: true });
    }

    // 3. FLAC Audio CRUD
    if (action === 'add-flac') {
      const sourceType: MediaSourceType = ['samply', 'gdrive', 'r2', 'embedded'].includes(
        body.sourceType
      )
        ? body.sourceType
        : 'samply';
      const bitDepth = Number(body.bitDepth) === 16 ? 16 : 24;
      const rawSr = Number(body.sampleRateHz);
      const sampleRateHz: 44100 | 48000 | 96000 =
        rawSr === 96000 ? 96000 : rawSr === 44100 ? 44100 : 48000;

      const rawAltTakes = Array.isArray(body.altTakes) ? body.altTakes : [];
      const altTakes = rawAltTakes
        .map((t: Record<string, unknown>) => ({
          label: String(t?.label || '').trim(),
          sourceType: (['samply', 'gdrive', 'r2', 'embedded'].includes(
            String(t?.sourceType || '')
          )
            ? t.sourceType
            : 'gdrive') as MediaSourceType,
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
        primaryTakeLabel: body.primaryTakeLabel ? String(body.primaryTakeLabel) : undefined,
        altTakes,
        loudnessLufs:
          typeof body.loudnessLufs === 'number' && Number.isFinite(body.loudnessLufs)
            ? body.loudnessLufs
            : undefined,
        previewRootHz: Number(body.previewRootHz) || 196.0,
        waveformPeaks: Array.isArray(body.waveformPeaks) ? body.waveformPeaks : undefined,
        tags: Array.isArray(body.tags) ? body.tags : parseHashtags(body.tagsText),
      });
      return NextResponse.json({ ok: true, track });
    }

    if (action === 'delete-flac') {
      await archiveRepository.deleteFlacRecording(String(body.id || ''));
      return NextResponse.json({ ok: true });
    }

    // 4. 35mm Photos CRUD
    if (action === 'add-photo') {
      const sourceType: MediaSourceType = ['gdrive', 'r2', 'embedded'].includes(
        body.sourceType
      )
        ? body.sourceType
        : 'embedded';
      const photo = await archiveRepository.addPhotoPlate({
        title: String(body.title || ''),
        photographer: String(body.photographer || ''),
        venue: String(body.venue || ''),
        year: String(body.year || '2026'),
        sourceType,
        sourceIdOrUrl: String(body.sourceIdOrUrl || ''),
        dimensionsLabel: body.dimensionsLabel ? String(body.dimensionsLabel) : undefined,
        tags: Array.isArray(body.tags) ? body.tags : parseHashtags(body.tagsText),
      });
      return NextResponse.json({ ok: true, photo });
    }

    if (action === 'delete-photo') {
      await archiveRepository.deletePhotoPlate(String(body.id || ''));
      return NextResponse.json({ ok: true });
    }

    // 5. Scene Artists & Bands CRUD
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
        tags: Array.isArray(body.tags) ? body.tags : parseHashtags(body.tagsText),
      });
      return NextResponse.json({ ok: true, artist });
    }

    if (action === 'toggle-artist-active') {
      const artist = await archiveRepository.toggleSceneArtistActive(String(body.id || ''));
      return NextResponse.json({ ok: true, artist });
    }

    if (action === 'delete-artist') {
      await archiveRepository.deleteSceneArtist(String(body.id || ''));
      return NextResponse.json({ ok: true });
    }

    // 6. Comment Moderation
    if (action === 'delete-comment') {
      await archiveRepository.deleteComment(
        String(body.targetItemId || ''),
        String(body.commentId || '')
      );
      return NextResponse.json({ ok: true });
    }

    // 7. Barter Market Auctions CRUD
    if (action === 'toggle-auction-sold') {
      const updated = await archiveRepository.markAuctionSoldByMediaOrId({
        auctionId: String(body.auctionId || ''),
        sold: Boolean(body.sold),
      });
      return NextResponse.json({ ok: true, auction: updated });
    }

    if (action === 'add-auction') {
      const sourceType: MediaSourceType = ['gdrive', 'r2', 'embedded'].includes(
        body.sourceType
      )
        ? body.sourceType
        : 'embedded';
      const created = await archiveRepository.addAuctionItem({
        title: String(body.title || ''),
        ownerUsername: String(body.ownerUsername || ''),
        openingBid: String(body.openingBid || '$30'),
        pickupArea: String(body.pickupArea || 'Greenville Local Pickup'),
        sourceType,
        sourceIdOrUrl: String(body.sourceIdOrUrl || ''),
        igPermalink: String(body.igPermalink || 'https://www.instagram.com/'),
      });
      return NextResponse.json({ ok: true, auction: created });
    }

    if (action === 'delete-auction') {
      await archiveRepository.deleteAuctionItem(String(body.id || ''));
      return NextResponse.json({ ok: true });
    }

    // 8. Calendar Shows CRUD
    if (action === 'publish-show') {
      const monthKey = body.monthKey === '2026-12' ? '2026-12' : '2026-11';
      const dayOfMonth = Math.max(1, Math.min(31, Number(body.dayOfMonth) || 21));
      const isoDate = `${monthKey}-${String(dayOfMonth).padStart(2, '0')}`;
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
        monthKey,
        dayOfMonth,
        title: String(body.title || '').trim(),
        venue: String(body.venue || '').trim(),
        doorsInfo: String(body.doorsInfo || '8:00 PM · DIY Bill').trim(),
        flyerStyle,
        flyerHeadlineNote: String(body.flyerHeadlineNote || '').trim(),
        tags: ['greenville', 'diy'],
      });
      return NextResponse.json({ ok: true, show: created });
    }

    if (action === 'delete-show') {
      await archiveRepository.deleteCalendarShow(String(body.id || ''));
      return NextResponse.json({ ok: true });
    }

    // 9. Subscribers CSV
    if (action === 'remove-subscriber') {
      await archiveRepository.removeSubscriberRow(String(body.id || ''));
      const subscribers = await archiveRepository.listSubscribersAdminOnly();
      return NextResponse.json({ ok: true, subscribers });
    }

    // 10. Next-Round & Cutover Ledger
    if (action === 'add-future-task') {
      const passPhase: FutureTaskLedgerItem['passPhase'] = [
        'Pass 5',
        'Pass 6',
        'Hostinger',
        'Storage / CDN',
      ].includes(body.passPhase)
        ? body.passPhase
        : 'Pass 6';
      const area: FutureTaskLedgerItem['area'] = [
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
      return NextResponse.json({ ok: true, task: created });
    }

    if (action === 'update-future-task-status') {
      const status: TaskStatus = ['Planned', 'In Progress', 'Deferred', 'Completed'].includes(
        body.status
      )
        ? body.status
        : 'Planned';
      const updated = await archiveRepository.updateFutureTaskStatus(
        String(body.id || ''),
        status
      );
      return NextResponse.json({ ok: true, task: updated });
    }

    if (action === 'delete-future-task') {
      await archiveRepository.deleteFutureTask(String(body.id || ''));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown admin action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Failed to execute admin mutation' }, { status: 400 });
  }
}
