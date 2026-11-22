// app/admin/editor/[slug]/page.tsx
import { notFound } from 'next/navigation';
import {
  checkProductionAuthPosture,
  isPreviewDemoModeEnabled,
  verifyAdminSession,
} from '@/lib/dal/auth';
import { archiveRepository } from '@/lib/storage/repository';
import PuckEditorSessionGate from '@/components/admin/PuckEditorSessionGate';

export const dynamic = 'force-dynamic';

export default async function AdminPuckEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug).trim();
  if (!decodedSlug) {
    notFound();
  }

  const prodPosture = checkProductionAuthPosture();
  const demoModeAvailable = isPreviewDemoModeEnabled();

  if (!prodPosture.ok) {
    const publicPayload = await archiveRepository.getPublicPayload();
    return (
      <PuckEditorSessionGate
        slug={decodedSlug}
        initialPage={null}
        demoModeAvailable={false}
        setupError={prodPosture.reason}
        seasonTheme={publicPayload.siteSettings.seasonTheme}
        defaultContrast={publicPayload.siteSettings.defaultContrast}
      />
    );
  }

  const authenticated = await verifyAdminSession();

  if (authenticated) {
    const [page, publicPayload] = await Promise.all([
      archiveRepository.getPuckPageBySlug(decodedSlug),
      archiveRepository.getPublicPayload(),
    ]);
    if (!page) {
      notFound();
    }
    return (
      <PuckEditorSessionGate
        slug={decodedSlug}
        initialPage={page}
        demoModeAvailable={demoModeAvailable}
        seasonTheme={publicPayload.siteSettings.seasonTheme}
        defaultContrast={publicPayload.siteSettings.defaultContrast}
      />
    );
  }

  const publicPayload = await archiveRepository.getPublicPayload();
  return (
    <PuckEditorSessionGate
      slug={decodedSlug}
      initialPage={null}
      demoModeAvailable={demoModeAvailable}
      seasonTheme={publicPayload.siteSettings.seasonTheme}
      defaultContrast={publicPayload.siteSettings.defaultContrast}
    />
  );
}
