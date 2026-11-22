// components/admin/PuckEditorSessionGate.tsx
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ContrastMode, PuckPageRecord, SeasonTheme } from '@/types/archive';
import {
  adminFetch,
  useAdminMemoryToken,
} from '@/lib/dal/adminClientSession';
import AdminLoginForm from '@/components/admin/AdminLoginForm';

const PuckEditorClient = dynamic(
  () => import('@/components/admin/PuckEditorClient'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center font-mono text-xs text-[var(--mute)]">
        Loading Puck Visual Studio...
      </div>
    ),
  }
);

interface PuckEditorSessionGateProps {
  slug: string;
  initialPage: PuckPageRecord | null;
  demoModeAvailable: boolean;
  setupError?: string;
  seasonTheme: SeasonTheme;
  defaultContrast: ContrastMode;
}

export default function PuckEditorSessionGate({
  slug,
  initialPage,
  demoModeAvailable,
  setupError,
  seasonTheme,
  defaultContrast,
}: PuckEditorSessionGateProps) {
  const [page, setPage] = useState<PuckPageRecord | null>(initialPage);
  const [notFoundErr, setNotFoundErr] = useState(false);
  const memoryToken = useAdminMemoryToken();
  const [resolvedTokenCheck, setResolvedTokenCheck] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-season', seasonTheme);
    if (defaultContrast === 'dark') {
      document.documentElement.setAttribute('data-contrast', 'dark');
    } else {
      document.documentElement.removeAttribute('data-contrast');
    }
  }, [seasonTheme, defaultContrast]);

  const fetchPuckPageAfterUnlock = useCallback(async () => {
    try {
      const res = await adminFetch(
        `/api/admin/puck?slug=${encodeURIComponent(slug)}`
      );
      if (res.status === 404) {
        setNotFoundErr(true);
        return;
      }
      const json = await res.json();
      if (res.ok && json.ok && json.page) {
        setPage(json.page as PuckPageRecord);
      }
    } catch {
      // Fall through to login form if unauthorized
    } finally {
      setResolvedTokenCheck(true);
    }
  }, [slug]);

  useEffect(() => {
    if (page || !memoryToken || setupError) return;
    let cancelled = false;

    adminFetch(`/api/admin/puck?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setNotFoundErr(true);
          return;
        }
        const json = await res.json();
        if (!cancelled && res.ok && json.ok && json.page) {
          setPage(json.page as PuckPageRecord);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setResolvedTokenCheck(true);
      });

    return () => {
      cancelled = true;
    };
  }, [page, memoryToken, slug, setupError]);

  if (notFoundErr) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4">
        <p className="font-mono text-sm text-[var(--ink)]">
          Puck layout &ldquo;{slug}&rdquo; was not found.
        </p>
        <Link href="/admin" className="btn-arch active">
          Back to Admin Manager
        </Link>
      </div>
    );
  }

  if (page) {
    return <PuckEditorClient page={page} />;
  }

  if (memoryToken && !resolvedTokenCheck && !setupError) {
    return (
      <div className="min-h-screen flex items-center justify-center font-mono text-xs text-[var(--mute)]">
        Opening Puck Visual Studio...
      </div>
    );
  }

  return (
    <AdminLoginForm
      demoModeAvailable={demoModeAvailable}
      setupError={setupError}
      onUnlocked={(payload) => {
        const matched = payload.puckPages?.find((p) => p.slug === slug);
        if (matched) {
          setPage(matched);
        } else {
          void fetchPuckPageAfterUnlock();
        }
      }}
    />
  );
}
