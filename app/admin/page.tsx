// app/admin/page.tsx
import {
  checkProductionAuthPosture,
  getAdminMfaStatus,
  isPreviewDemoModeEnabled,
  verifyAdminSession,
} from '@/lib/dal/auth';
import { archiveRepository } from '@/lib/storage/repository';
import AdminSessionGate from '@/components/admin/AdminSessionGate';

export const dynamic = 'force-dynamic';

export default async function AdminManagerPage() {
  const prodPosture = checkProductionAuthPosture();
  const demoModeAvailable = isPreviewDemoModeEnabled();

  if (!prodPosture.ok) {
    const publicPayload = await archiveRepository.getPublicPayload();
    return (
      <AdminSessionGate
        initialAdminData={null}
        demoModeAvailable={false}
        setupError={prodPosture.reason}
        seasonTheme={publicPayload.siteSettings.seasonTheme}
        defaultContrast={publicPayload.siteSettings.defaultContrast}
      />
    );
  }

  const authenticated = await verifyAdminSession();

  if (authenticated) {
    const [adminPayload, mfaStatus] = await Promise.all([
      archiveRepository.getAdminFullPayload(),
      getAdminMfaStatus(),
    ]);
    const enrichedPayload = {
      ...adminPayload,
      runtimePosture: {
        ...adminPayload.runtimePosture,
        mfaStatus,
      },
    };
    return (
      <AdminSessionGate
        initialAdminData={enrichedPayload}
        demoModeAvailable={demoModeAvailable}
        seasonTheme={enrichedPayload.siteSettings.seasonTheme}
        defaultContrast={enrichedPayload.siteSettings.defaultContrast}
      />
    );
  }

  const publicPayload = await archiveRepository.getPublicPayload();
  return (
    <AdminSessionGate
      initialAdminData={null}
      demoModeAvailable={demoModeAvailable}
      seasonTheme={publicPayload.siteSettings.seasonTheme}
      defaultContrast={publicPayload.siteSettings.defaultContrast}
    />
  );
}
