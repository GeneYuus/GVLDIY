// app/page.tsx
import { headers } from 'next/headers';
import { archiveRepository } from '@/lib/storage/repository';
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

function resolveInitialSection(
  tabParam: string | undefined,
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
    if ((VALID_SECTIONS as string[]).includes(normalized)) {
      return normalized as PublicArchiveSection;
    }
  }

  if (hostHeader.toLowerCase().includes('thebartermarket')) {
    return 'auction';
  }

  return 'videos';
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [resolvedParams, headerStore, isAdminAuthenticated, initialPayload] =
    await Promise.all([
      searchParams,
      headers(),
      verifyAdminSession(),
      archiveRepository.getPublicPayload(),
    ]);

  const host = headerStore.get('x-forwarded-host') || headerStore.get('host') || '';
  const initialSection = resolveInitialSection(resolvedParams?.tab, host);

  return (
    <ResponsiveArchiveShell
      initialPayload={initialPayload}
      isAdminAuthenticated={isAdminAuthenticated}
      initialSection={initialSection}
    />
  );
}
