// app/page.tsx
import { headers } from 'next/headers';
import { archiveRepository, PublicArchivePayload } from '@/lib/storage/repository';
import { verifyAdminSession } from '@/lib/dal/auth';
import { PublicArchiveSection } from '@/types/archive';
import ResponsiveArchiveShell from '@/components/shell/ResponsiveArchiveShell';

export const dynamic = 'force-dynamic';

const VALID_SECTIONS: PublicArchiveSection[] = [
  'videos',
  'audio',
  'photos',
  'artists',
  'calendar',
  'timeline',
  'remembered',
  'auction',
];

function sanitizeItemParam(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(trimmed) ? trimmed : undefined;
}

function sanitizeMonthParam(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed) ? trimmed : undefined;
}

function parseTimeSecondsParam(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (/^\d{1,6}$/.test(trimmed)) {
    return Math.min(86400, Math.max(0, Number(trimmed)));
  }
  const mmSs = trimmed.match(/^(\d{1,3}):(\d{2})$/);
  if (mmSs) {
    return Math.min(86400, Number(mmSs[1]) * 60 + Math.min(59, Number(mmSs[2])));
  }
  const hmsUnit = trimmed.match(/^(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (hmsUnit && (hmsUnit[1] || hmsUnit[2])) {
    const mins = Number(hmsUnit[1] || 0);
    const secs = Number(hmsUnit[2] || 0);
    return Math.min(86400, mins * 60 + secs);
  }
  return undefined;
}

function resolveInitialSection(
  tabParam: string | undefined,
  itemId: string | undefined,
  monthKey: string | undefined,
  payload: PublicArchivePayload,
  hostHeader: string
): PublicArchiveSection {
  if (tabParam) {
    const normalized = tabParam.trim().toLowerCase();
    if (normalized === 'auctions' || normalized === 'barter') {
      return 'auction';
    }
    if (normalized === 'flac') {
      return 'audio';
    }
    if (normalized === 'memorials' || normalized === 'places') {
      return 'remembered';
    }
    if ((VALID_SECTIONS as string[]).includes(normalized)) {
      return normalized as PublicArchiveSection;
    }
  }

  if (monthKey) {
    return 'calendar';
  }

  if (itemId) {
    if (payload.videos.some((v) => v.id === itemId)) return 'videos';
    if (payload.audio.some((a) => a.id === itemId)) return 'audio';
    if (payload.photos.some((p) => p.id === itemId)) return 'photos';
    if (payload.calendar.some((c) => c.id === itemId)) return 'calendar';
    if (payload.remembered.some((r) => r.id === itemId)) return 'remembered';
    if (payload.auctions.some((a) => a.id === itemId)) return 'auction';
    if (payload.artists.some((a) => a.id === itemId)) return 'artists';
    if (payload.timeline.some((t) => t.id === itemId)) return 'timeline';
  }

  if (hostHeader.toLowerCase().includes('thebartermarket')) {
    return 'auction';
  }

  return 'videos';
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    item?: string;
    t?: string;
    month?: string;
  }>;
}) {
  const [resolvedParams, headerStore, isAdminAuthenticated, initialPayload] =
    await Promise.all([
      searchParams,
      headers(),
      verifyAdminSession(),
      archiveRepository.getPublicPayload(),
    ]);

  const host =
    headerStore.get('x-forwarded-host') || headerStore.get('host') || '';
  const itemId = sanitizeItemParam(resolvedParams?.item);
  const timeSec = parseTimeSecondsParam(resolvedParams?.t);
  const monthKey = sanitizeMonthParam(resolvedParams?.month);

  const initialSection = resolveInitialSection(
    resolvedParams?.tab,
    itemId,
    monthKey,
    initialPayload,
    host
  );

  return (
    <ResponsiveArchiveShell
      initialPayload={initialPayload}
      isAdminAuthenticated={isAdminAuthenticated}
      initialSection={initialSection}
      initialDeepLink={{
        itemId,
        timeSec,
        monthKey,
      }}
    />
  );
}
