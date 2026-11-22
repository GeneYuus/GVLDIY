// components/admin/AdminSessionGate.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { ContrastMode, SeasonTheme } from '@/types/archive';
import {
  adminFetch,
  useAdminMemoryToken,
} from '@/lib/dal/adminClientSession';
import AdminLoginForm, {
  AdminHydratedPayload,
} from '@/components/admin/AdminLoginForm';
import AdminManagerClient from '@/components/admin/AdminManagerClient';

interface AdminSessionGateProps {
  initialAdminData: AdminHydratedPayload | null;
  demoModeAvailable: boolean;
  setupError?: string;
  seasonTheme: SeasonTheme;
  defaultContrast: ContrastMode;
}

export default function AdminSessionGate({
  initialAdminData,
  demoModeAvailable,
  setupError,
  seasonTheme,
  defaultContrast,
}: AdminSessionGateProps) {
  const [adminData, setAdminData] = useState<AdminHydratedPayload | null>(
    initialAdminData
  );
  // Hydration-safe via useSyncExternalStore (null on SSR + hydration, token string post-hydration)
  const memoryToken = useAdminMemoryToken();
  const [resolvedTokenCheck, setResolvedTokenCheck] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-season', seasonTheme);
    if (defaultContrast === 'dark') {
      document.documentElement.setAttribute('data-contrast', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.removeAttribute('data-contrast');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.classList.remove('dark');
    }
  }, [seasonTheme, defaultContrast]);

  // Hydrate via in-memory Bearer token when third-party iframe cookies are blocked
  useEffect(() => {
    if (adminData || !memoryToken || setupError) return;

    let cancelled = false;
    adminFetch('/api/admin/auth')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.authenticated && json.adminPayload) {
          setAdminData(json.adminPayload as AdminHydratedPayload);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setResolvedTokenCheck(true);
      });

    return () => {
      cancelled = true;
    };
  }, [adminData, memoryToken, setupError]);

  if (adminData) {
    return (
      <AdminManagerClient
        initialData={adminData}
        onLocked={() => setAdminData(null)}
      />
    );
  }

  if (memoryToken && !resolvedTokenCheck && !setupError) {
    return (
      <div className="min-h-screen flex items-center justify-center font-mono text-xs text-[var(--mute)]">
        Loading Admin Manager...
      </div>
    );
  }

  return (
    <AdminLoginForm
      demoModeAvailable={demoModeAvailable}
      setupError={setupError}
      onUnlocked={(payload) => setAdminData(payload)}
    />
  );
}
