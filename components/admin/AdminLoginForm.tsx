// components/admin/AdminLoginForm.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Lock, ShieldCheck, Unlock } from 'lucide-react';
import {
  ArchiveDataset,
  AuditLogEntry,
  RuntimePostureSnapshot,
} from '@/types/archive';
import {
  adminFetch,
  setAdminMemoryToken,
} from '@/lib/dal/adminClientSession';
import LiquidGlassStage from '@/components/fx/LiquidGlassStage';

export type AdminHydratedPayload = ArchiveDataset & {
  storageDriver: 'hostinger-mysql' | 'preview-memory';
  runtimePosture?: RuntimePostureSnapshot;
  auditLogs?: AuditLogEntry[];
  auditTotal?: number;
};

interface AdminLoginFormProps {
  demoModeAvailable?: boolean;
  setupError?: string;
  onUnlocked?: (payload: AdminHydratedPayload) => void;
}

export default function AdminLoginForm({
  demoModeAvailable = true,
  setupError,
  onUnlocked,
}: AdminLoginFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<'passphrase' | 'totp'>('passphrase');
  const [passkey, setPasskey] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const totpInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step === 'totp') {
      totpInputRef.current?.focus();
    }
  }, [step, useRecoveryCode]);

  const submitAuthRequest = async (body: Record<string, string>) => {
    if (setupError) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await adminFetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok && data.mfaRequired && !data.authenticated) {
        setStep('totp');
        setTotpCode('');
        setSubmitting(false);
        return;
      }

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
        return;
      }

      if (data.mfaRequired) {
        setStep('totp');
      }
      setErrorMsg(data.error || 'Invalid curator credentials');
      setSubmitting(false);
    } catch {
      setErrorMsg('Connection error while verifying credentials');
      setSubmitting(false);
    }
  };

  const handleInstantDemoUnlock = () => {
    void submitAuthRequest({ mode: 'demo' });
  };

  const handlePasskeyStepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passkey.trim() || setupError) return;
    void submitAuthRequest({
      mode: 'passkey',
      passkey: passkey.trim(),
    });
  };

  const handleTotpStepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passkey.trim() || !totpCode.trim() || setupError) return;
    void submitAuthRequest({
      mode: 'passkey',
      passkey: passkey.trim(),
      totpCode: totpCode.trim(),
    });
  };

  const handleBackToPassphrase = () => {
    setStep('passphrase');
    setTotpCode('');
    setUseRecoveryCode(false);
    setErrorMsg(null);
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
            {step === 'totp' ? (
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-[var(--accent)]" />
            )}
            <span>
              {step === 'totp'
                ? '00 · Step 2 / 2 · 2FA Verification'
                : '00 · Curator Gateway'}
            </span>
          </span>
          <Link href="/" prefetch={false} className="typo-action whitespace-nowrap shrink-0">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Archive</span>
          </Link>
        </div>

        <h1 className="sec-title !text-xl mb-1.5">
          {step === 'totp'
            ? 'Authenticator Verification'
            : 'Greenville DIY · Admin Manager'}
        </h1>
        <p className="text-xs text-[var(--ink-2)] mb-5 leading-relaxed">
          {setupError
            ? 'Production fail-closed posture active: configure required Hostinger environment secrets before curator sign-in.'
            : step === 'totp'
            ? useRecoveryCode
              ? 'Enter one of your single-use XXXX-XXXX backup recovery codes to unlock this session.'
              : 'Enter the 6-digit code from Microsoft Authenticator or Google Authenticator to complete sign-in.'
            : demoModeAvailable
            ? 'Port 3000 Demo Posture active: unlock in one click below, or sign in with curator passkey (enforces 2FA when enrolled).'
            : 'Hostinger Production Posture active: enter your curator passkey to manage archive records.'}
        </p>

        {setupError && (
          <div
            role="alert"
            className="mb-5 text-xs font-mono text-[var(--cta-bright)] px-3 py-2.5 rounded-[var(--r-key)] bg-[var(--accent-soft)] border border-[var(--accent)] leading-relaxed"
          >
            <div className="font-bold uppercase tracking-wider mb-1">
              503 · Production Setup Required
            </div>
            <div>{setupError}</div>
          </div>
        )}

        {step === 'passphrase' ? (
          <>
            {!setupError && demoModeAvailable && (
              <div className="mb-5">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleInstantDemoUnlock}
                  className="btn-arch btn-cta-bright w-full py-2.5 justify-center text-xs whitespace-nowrap"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>
                    {submitting ? 'Unlocking Demo...' : 'Instant Demo Unlock'}
                  </span>
                </button>
              </div>
            )}

            {!setupError && demoModeAvailable && (
              <div className="flex items-center gap-3 my-4 text-[11px] font-mono text-[var(--ink-mono)]">
                <span className="h-px flex-1 bg-[var(--grid-hairline)]" />
                <span>or curator passkey</span>
                <span className="h-px flex-1 bg-[var(--grid-hairline)]" />
              </div>
            )}

            <form onSubmit={handlePasskeyStepSubmit} className="flex flex-col gap-3.5">
              <div className="field-group">
                <label htmlFor="admin-curator-passkey" className="field-label">
                  Curator Passkey
                </label>
                <input
                  id="admin-curator-passkey"
                  type="password"
                  required
                  autoComplete="current-password"
                  disabled={Boolean(setupError)}
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  placeholder={
                    demoModeAvailable ? 'Optional custom session key' : ''
                  }
                  className="input-clean w-full"
                />
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="text-xs font-mono text-[var(--cta-bright)] px-2.5 py-1.5 rounded-[var(--r-key)] bg-[var(--accent-soft)] border border-[var(--accent)]"
                >
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !passkey.trim() || Boolean(setupError)}
                className="btn-arch w-full py-2 justify-center whitespace-nowrap"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{submitting ? 'Verifying...' : 'Continue with Passkey'}</span>
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={handleTotpStepSubmit} className="flex flex-col gap-3.5">
            <div className="field-group">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="admin-totp-code" className="field-label">
                  {useRecoveryCode
                    ? 'Backup Recovery Code (XXXX-XXXX)'
                    : '6-Digit Authenticator / Recovery Code'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setUseRecoveryCode((v) => !v);
                    setTotpCode('');
                    setErrorMsg(null);
                  }}
                  className="typo-action !text-[10.5px] whitespace-nowrap shrink-0"
                >
                  {useRecoveryCode ? 'Use 6-Digit Code' : 'Use Recovery Code'}
                </button>
              </div>
              <input
                ref={totpInputRef}
                id="admin-totp-code"
                type="text"
                inputMode={useRecoveryCode ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                spellCheck={false}
                autoCapitalize="characters"
                maxLength={useRecoveryCode ? 11 : 11}
                required
                value={totpCode}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!useRecoveryCode && /[A-Za-z-]/.test(val)) {
                    setUseRecoveryCode(true);
                  }
                  setTotpCode(val);
                }}
                placeholder={useRecoveryCode ? 'XXXX-XXXX' : '000000'}
                className="input-clean w-full font-mono text-sm tracking-widest tabular-nums"
              />
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="text-xs font-mono text-[var(--cta-bright)] px-2.5 py-1.5 rounded-[var(--r-key)] bg-[var(--accent-soft)] border border-[var(--accent)]"
              >
                {errorMsg}
              </div>
            )}

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={handleBackToPassphrase}
                className="btn-arch py-2 px-3.5 whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <button
                type="submit"
                disabled={submitting || !totpCode.trim()}
                className="btn-arch btn-cta-bright flex-1 py-2 justify-center whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {submitting ? 'Verifying 2FA...' : 'Verify & Unlock Session'}
                </span>
              </button>
            </div>
          </form>
        )}
      </LiquidGlassStage>
    </div>
  );
}
