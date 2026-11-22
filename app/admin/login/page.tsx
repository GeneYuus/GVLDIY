// app/admin/login/page.tsx
import {
  checkProductionAuthPosture,
  isPreviewDemoModeEnabled,
  verifyAdminSession,
} from '@/lib/dal/auth';
import { archiveRepository } from '@/lib/storage/repository';
import AdminSessionGate from '@/components/admin/AdminSessionGate';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
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
    const adminPayload = await archiveRepository.getAdminFullPayload();
    return (
      <AdminSessionGate
        initialAdminData={adminPayload}
        demoModeAvailable={demoModeAvailable}
        seasonTheme={adminPayload.siteSettings.seasonTheme}
        defaultContrast={adminPayload.siteSettings.defaultContrast}
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
