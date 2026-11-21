// components/admin/AdminLoginForm.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Lock, Unlock } from 'lucide-react';
import { ArchiveDataset, RuntimePostureSnapshot } from '@/types/archive';
import {
  adminFetch,
  setAdminMemoryToken,
} from '@/lib/dal/adminClientSession';
import LiquidGlassStage from '@/components/fx/LiquidGlassStage';

export type AdminHydratedPayload = ArchiveDataset & {
  storageDriver: 'hostinger-mysql' | 'preview-memory';
  runtimePosture?: RuntimePostureSnapshot;
};

interface AdminLoginFormProps {
  demoModeAvailable?: boolean;
  onUnlocked?: (payload: AdminHydratedPayload) => void;
}

export default function AdminLoginForm({
  demoModeAvailable = true,
  onUnlocked,
}: AdminLoginFormProps) {
  const router = useRouter();
  const [passkey, setPasskey] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const completeUnlock = async (body: Record<string, string>) => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await adminFetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok && data.authenticated) {
        if (typeof data.token === 'string' && data.token) {
          setAdminMemoryToken(data.token);
        }
        if (onUnlocked && data.adminPayload) {
          onUnlocked(data.adminPayload as AdminHydratedPayload);
          return;
        }
        router.push('/admin');
        router.refresh();
      } else {
        setErrorMsg(data.error || 'Invalid curator passkey');
        setSubmitting(false);
      }
    } catch {
      setErrorMsg('Connection error while unlocking manager');
      setSubmitting(false);
    }
  };

  const handleInstantDemoUnlock = () => {
    void completeUnlock({ mode: 'demo' });
  };

  const handlePasskeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passkey.trim()) return;
    void completeUnlock({ mode: 'passkey', passkey: passkey.trim() });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <LiquidGlassStage
        radius={12}
        bezel={18}
        thickness={14}
        specular={0.74}
        className="w-full max-w-md"
        contentClassName="p-7"
      >
        <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-[var(--grid-hairline)]">
          <span className="font-mono text-[11px] tracking-wider uppercase text-[var(--ink-mono)] inline-flex items-center gap-1.5 tabular-nums">
            <Lock className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>00 · Curator Gateway</span>
          </span>
          <Link href="/" className="typo-action">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Archive</span>
          </Link>
        </div>

        <h1 className="sec-title !text-xl mb-1.5">
          Greenville DIY · Admin Manager
        </h1>
        <p className="text-xs text-[var(--ink-2)] mb-5 leading-relaxed">
          {demoModeAvailable
            ? 'Port 3000 Demo Posture active: unlock in one click below, or test passkey login before Hostinger cutover.'
            : 'Hostinger Production Posture active: enter your curator passkey to manage archive records.'}
        </p>

        {demoModeAvailable && (
          <div className="mb-5">
            <button
              type="button"
              disabled={submitting}
              onClick={handleInstantDemoUnlock}
              className="btn-arch btn-cta-bright w-full py-2.5 justify-center text-xs"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>
                {submitting ? 'Unlocking Demo...' : 'Instant Demo Unlock'}
              </span>
            </button>
          </div>
        )}

        {demoModeAvailable && (
          <div className="flex items-center gap-3 my-4 text-[11px] font-mono text-[var(--ink-mono)]">
            <span className="h-px flex-1 bg-[var(--grid-hairline)]" />
            <span>or curator passkey</span>
            <span className="h-px flex-1 bg-[var(--grid-hairline)]" />
          </div>
        )}

        <form onSubmit={handlePasskeySubmit} className="flex flex-col gap-3.5">
          <div className="field-group">
            <label htmlFor="admin-curator-passkey" className="field-label">
              Curator Passkey
            </label>
            <input
              id="admin-curator-passkey"
              type="password"
              required
              value={passkey}
              onChange={(e) => setPasskey(e.target.value)}
              placeholder={
                demoModeAvailable ? 'Optional custom session key' : ''
              }
              className="input-clean w-full"
            />
          </div>

          {errorMsg && (
            <div className="text-xs font-mono text-[var(--cta-bright)] px-2.5 py-1.5 rounded-[var(--r-key)] bg-[var(--accent-soft)] border border-[var(--accent)]">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !passkey.trim()}
            className="btn-arch w-full py-2 justify-center"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{submitting ? 'Verifying...' : 'Unlock with Passkey'}</span>
          </button>
        </form>
      </LiquidGlassStage>
    </div>
  );
}
