// components/puck/ZinePageChrome.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  Flower2,
  Leaf,
  Snowflake,
  Sun,
} from 'lucide-react';
import { ContrastMode, SeasonTheme } from '@/types/archive';
import { useAdminMemoryToken } from '@/lib/dal/adminClientSession';

interface ZinePageChromeProps {
  title: string;
  slug: string;
  seasonTheme: SeasonTheme;
  defaultContrast: ContrastMode;
  isAdminAuthenticated: boolean;
  children: React.ReactNode;
}

function SeasonEmblem({ season }: { season: SeasonTheme }) {
  const cls = 'w-4 h-4 text-[var(--accent)] shrink-0';
  if (season === 'spring') return <Flower2 className={cls} aria-hidden="true" />;
  if (season === 'summer') return <Sun className={cls} aria-hidden="true" />;
  if (season === 'winter') return <Snowflake className={cls} aria-hidden="true" />;
  return <Leaf className={cls} aria-hidden="true" />;
}

export default function ZinePageChrome({
  title,
  slug,
  seasonTheme,
  defaultContrast,
  isAdminAuthenticated,
  children,
}: ZinePageChromeProps) {
  const [contrast, setContrast] = useState<ContrastMode>(defaultContrast);
  const memoryToken = useAdminMemoryToken();
  const canEdit = isAdminAuthenticated || Boolean(memoryToken);

  useEffect(() => {
    document.documentElement.setAttribute('data-season', seasonTheme);
  }, [seasonTheme]);

  useEffect(() => {
    if (contrast === 'dark') {
      document.documentElement.setAttribute('data-contrast', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.removeAttribute('data-contrast');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.classList.remove('dark');
    }
  }, [contrast]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="masthead">
        <div className="brand-wrap min-w-0">
          <Link href="/" prefetch={false} className="typo-action shrink-0" aria-label="Back to Archive">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Archive</span>
          </Link>
          <span className="text-[var(--mute)] font-mono text-xs hidden sm:inline" aria-hidden="true">
            /
          </span>
          <SeasonEmblem season={seasonTheme} />
          <h1 className="brand-title truncate">{title}</h1>
        </div>

        <div className="top-bar-actions shrink-0">
          {canEdit && (
            <Link
              href={`/admin/editor/${encodeURIComponent(slug)}`}
              prefetch={false}
              className="typo-action typo-action-accent"
            >
              <span>Edit in Puck</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          )}
          <button
            type="button"
            className="typo-action"
            onClick={() => setContrast((c) => (c === 'dark' ? 'light' : 'dark'))}
          >
            {contrast === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <main className="workspace max-w-5xl w-full mx-auto flex-1">
        {children}
      </main>
    </div>
  );
}
