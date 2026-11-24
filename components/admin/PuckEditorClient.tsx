// components/admin/PuckEditorClient.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Puck, type Data } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { ArrowLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { puckConfig, type ArchivePuckProps } from '@/lib/puck/puck.config';
import { PuckPageRecord, PuckSerializedData } from '@/types/archive';
import { adminFetch, setAdminMemoryToken } from '@/lib/dal/adminClientSession';

interface PuckEditorClientProps {
  page: PuckPageRecord;
}

export default function PuckEditorClient({ page }: PuckEditorClientProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2600);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const liveHref = page.isSlot
    ? page.slug === 'slot:remembered-top'
      ? '/?tab=remembered'
      : page.slug === 'slot:auctions-top'
      ? '/?tab=auction'
      : '/'
    : `/p/${page.slug}`;

  const handlePublish = async (data: Data<ArchivePuckProps>) => {
    setSaving(true);
    try {
      const rootTitle =
        typeof (data.root as { props?: { title?: unknown } })?.props?.title ===
          'string' &&
        String((data.root as { props?: { title?: string } }).props?.title).trim()
          ? String((data.root as { props?: { title?: string } }).props?.title).trim()
          : page.title;

      const res = await adminFetch('/api/admin/puck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          slug: page.slug,
          title: rootTitle,
          published: true,
          puckData: data as unknown as PuckSerializedData,
        }),
      });

      if (res.status === 401) {
        setAdminMemoryToken(null);
        router.push('/admin');
        return;
      }

      const json = await res.json();
      if (!res.ok || !json.ok) {
        setToastMsg(json.error || 'Could not publish Puck layout');
        return;
      }

      setToastMsg(
        page.isSlot
          ? `Published ${page.slug} inline slot`
          : `Published /p/${page.slug}`
      );
      router.refresh();
    } catch {
      setToastMsg('Network error saving layout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)]">
      <div className="masthead z-20">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/admin" prefetch={false} className="typo-action shrink-0">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Admin Manager</span>
          </Link>
          <span className="text-[var(--mute)] font-mono text-xs" aria-hidden="true">
            ·
          </span>
          <span className="status-stamp status-active shrink-0">
            <CheckCircle2 className="w-3 h-3" />
            <span>{page.isSlot ? 'Inline Slot' : 'Zine Page'}</span>
          </span>
          <span className="font-mono text-xs text-[var(--ink)] font-semibold truncate">
            {page.title}
          </span>
          <span className="font-mono text-[11px] text-[var(--mute)] hidden md:inline">
            ({page.isSlot ? page.slug : `/p/${page.slug}`})
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {saving && (
            <span className="font-mono text-xs text-[var(--accent)]">
              Saving...
            </span>
          )}
          <Link
            href={liveHref}
            prefetch={false}
            target="_blank"
            rel="noopener noreferrer"
            className="typo-action typo-action-accent"
          >
            <span>View Live</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Puck
          config={puckConfig}
          data={page.puckData as unknown as Data<ArchivePuckProps>}
          viewports={[
            { width: 390, height: 'auto', label: 'Mobile (390px)' },
            { width: 820, height: 'auto', label: 'Tablet (820px)' },
            { width: 1280, height: 'auto', label: 'Desktop (1280px)' },
          ]}
          onPublish={handlePublish}
        />
      </div>

      {toastMsg && (
        <div className="toast-banner" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
