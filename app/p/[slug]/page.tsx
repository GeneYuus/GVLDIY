// app/p/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { Render } from '@puckeditor/core/rsc';
import type { Data } from '@puckeditor/core';
import { puckConfig, type ArchivePuckProps } from '@/lib/puck/puck.config';
import { archiveRepository } from '@/lib/storage/repository';
import { verifyAdminSession } from '@/lib/dal/auth';
import ZinePageChrome from '@/components/puck/ZinePageChrome';

export const dynamic = 'force-dynamic';

export default async function CustomPuckZinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug).trim();

  if (!decodedSlug || decodedSlug.startsWith('slot:')) {
    notFound();
  }

  const [page, payload, isAdminAuthenticated] = await Promise.all([
    archiveRepository.getPuckPageBySlug(decodedSlug),
    archiveRepository.getPublicPayload(),
    verifyAdminSession(),
  ]);

  if (!page || (!page.published && !isAdminAuthenticated)) {
    notFound();
  }

  return (
    <ZinePageChrome
      title={page.title}
      slug={page.slug}
      seasonTheme={payload.siteSettings.seasonTheme}
      defaultContrast={payload.siteSettings.defaultContrast}
      isAdminAuthenticated={isAdminAuthenticated}
    >
      <Render
        config={puckConfig}
        data={page.puckData as unknown as Data<ArchivePuckProps>}
      />
    </ZinePageChrome>
  );
}
