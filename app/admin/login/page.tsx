// app/admin/login/page.tsx
import {
  isPreviewDemoModeEnabled,
  verifyAdminSession,
} from '@/lib/dal/auth';
import { archiveRepository } from '@/lib/storage/repository';
import AdminSessionGate from '@/components/admin/AdminSessionGate';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  const authenticated = await verifyAdminSession();
  const demoModeAvailable = isPreviewDemoModeEnabled();

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
