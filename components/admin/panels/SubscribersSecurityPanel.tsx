// components/admin/panels/SubscribersSecurityPanel.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  AdminMfaStatusSnapshot,
  AuditLogEntry,
  AuditLogPageResult,
  FutureTaskLedgerItem,
  RuntimePostureSnapshot,
  SubscriberCsvRow,
  TaskPriority,
  TaskStatus,
} from '@/types/archive';
import {
  adminFetch,
  downloadAuthenticatedFile,
  setAdminMemoryToken,
} from '@/lib/dal/adminClientSession';

interface SubscribersSecurityPanelProps {
  mode: 'csv' | 'ledger';
  storageDriver: 'hostinger-mysql' | 'preview-memory';
  runtimePosture?: RuntimePostureSnapshot;
  subscribers: SubscriberCsvRow[];
  setSubscribers: React.Dispatch<React.SetStateAction<SubscriberCsvRow[]>>;
  futureTasks: FutureTaskLedgerItem[];
  setFutureTasks: React.Dispatch<React.SetStateAction<FutureTaskLedgerItem[]>>;
  auditLogs: AuditLogEntry[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogEntry[]>>;
  auditTotal: number;
  setAuditTotal: React.Dispatch<React.SetStateAction<number>>;
  postAdminAction: (
    payload: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  syncAuditLogs: (logs?: unknown, total?: unknown) => void;
  showToast: (msg: string) => void;
  onLocked?: () => void;
}

const AUDIT_PAGE_SIZE = 50;

const AUDIT_FILTER_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'all', label: 'All Events' },
  { id: 'totp_enrolled', label: 'totp_enrolled' },
  { id: 'totp_verified', label: 'totp_verified' },
  { id: 'totp_replay_blocked', label: 'totp_replay_blocked' },
  { id: 'recovery_code_used', label: 'recovery_code_used' },
  { id: 'auth_security', label: 'Auth & Lockouts' },
];

export default function SubscribersSecurityPanel({
  mode,
  storageDriver,
  runtimePosture,
  subscribers,
  setSubscribers,
  futureTasks,
  setFutureTasks,
  auditLogs,
  setAuditLogs,
  auditTotal,
  setAuditTotal,
  postAdminAction,
  syncAuditLogs,
  showToast,
  onLocked,
}: SubscribersSecurityPanelProps) {
  const router = useRouter();

  // Subscriber Inline Edit State
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSub, setEditSub] = useState<{
    createdAtIso: string;
    source: SubscriberCsvRow['source'];
    name: string;
    email: string;
    interests: string;
  } | null>(null);

  // Task Ledger Form State
  const [taskPhase, setTaskPhase] =
    useState<FutureTaskLedgerItem['passPhase']>('Pass 11');
  const [taskArea, setTaskArea] =
    useState<FutureTaskLedgerItem['area']>('Hostinger MySQL');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('P1');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskRationale, setTaskRationale] = useState('');
  const [taskPrereq, setTaskPrereq] = useState('');

  // Passphrase Hash Generator & Session State
  const [passphraseDraft, setPassphraseDraft] = useState('');
  const [generatedEnvHashLine, setGeneratedEnvHashLine] = useState<string | null>(
    null
  );
  const [generatingHash, setGeneratingHash] = useState(false);
  const [revokingAllSessions, setRevokingAllSessions] = useState(false);

  // Two-Phase Authenticator 2FA State
  const [mfaStatus, setMfaStatus] = useState<AdminMfaStatusSnapshot>(
    runtimePosture?.mfaStatus || {
      active: false,
      dbEnabled: false,
      envFallbackConfigured: false,
      source: 'none',
      hasPendingSetup: false,
      remainingRecoveryCodes: 0,
      updatedAtIso: null,
    }
  );
  const [pendingSetup, setPendingSetup] = useState<{
    qrSvgDataUri: string;
    manualKeyFormatted: string;
    otpauthUri: string;
  } | null>(null);
  const [setupVerifyCode, setSetupVerifyCode] = useState('');
  const [freshRecoveryCodes, setFreshRecoveryCodes] = useState<string[] | null>(
    null
  );
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  // Step-Up Gate State (Rotate Authenticator Device / Disable 2FA)
  const [stepUpMode, setStepUpMode] = useState<'rotate' | 'disable' | null>(
    null
  );
  const [stepUpPassphrase, setStepUpPassphrase] = useState('');
  const [stepUpCode, setStepUpCode] = useState('');

  // Paginated & Filtered Security Audit Trail State
  const [auditFilter, setAuditFilter] = useState<string>('all');
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);

  const loadAuditSlice = async (nextFilter: string, nextPage: number) => {
    setAuditLoading(true);
    try {
      const qs = new URLSearchParams({
        filter: nextFilter,
        page: String(nextPage),
        pageSize: String(AUDIT_PAGE_SIZE),
      });
      const res = await adminFetch(`/api/admin/audit?${qs.toString()}`);
      if (res.status === 401) {
        setAdminMemoryToken(null);
        onLocked?.();
        return;
      }
      if (res.ok) {
        const json = (await res.json()) as AuditLogPageResult;
        if (Array.isArray(json.logs)) {
          setAuditLogs(json.logs);
          setAuditTotal(Number(json.total || 0));
        }
      }
    } catch {
      showToast('Could not load audit trail page');
    } finally {
      setAuditLoading(false);
    }
  };

  const handleSelectAuditFilter = (nextFilter: string) => {
    setAuditFilter(nextFilter);
    setAuditPage(1);
    void loadAuditSlice(nextFilter, 1);
  };

  const handleChangeAuditPage = (nextPage: number) => {
    setAuditPage(nextPage);
    void loadAuditSlice(auditFilter, nextPage);
  };

  const startEditSub = (r: SubscriberCsvRow) => {
    setEditingSubId(r.id);
    setEditSub({
      createdAtIso: r.createdAtIso,
      source: r.source,
      name: r.name,
      email: r.email,
      interests: r.interests,
    });
  };

  const handleSaveSubEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubId || !editSub) return;
    try {
      const data = await postAdminAction({
        action: 'update-subscriber',
        id: editingSubId,
        ...editSub,
      });
      if (data.ok && Array.isArray(data.subscribers)) {
        setSubscribers(data.subscribers as SubscriberCsvRow[]);
        syncAuditLogs(data.auditLogs, data.auditTotal);
        setEditingSubId(null);
        setEditSub(null);
        showToast('Updated subscriber record');
      } else {
        showToast(String(data.error || 'Could not update subscriber'));
      }
    } catch {
      showToast('Failed to update subscriber');
    }
  };

  const handleRemoveSubscriber = async (id: string) => {
    const data = await postAdminAction({ action: 'remove-subscriber', id });
    if (data.ok && Array.isArray(data.subscribers)) {
      setSubscribers(data.subscribers as SubscriberCsvRow[]);
      syncAuditLogs(data.auditLogs, data.auditTotal);
      if (editingSubId === id) setEditingSubId(null);
      showToast('Removed subscriber entry');
    }
  };

  const handleBeginTotpSetup = async () => {
    setMfaBusy(true);
    setMfaError(null);
    setFreshRecoveryCodes(null);
    try {
      const data = await postAdminAction({ action: 'begin-totp-setup' });
      if (
        data.ok &&
        typeof data.qrSvgDataUri === 'string' &&
        data.qrSvgDataUri.startsWith('data:image/svg+xml;base64,') &&
        typeof data.manualKeyFormatted === 'string'
      ) {
        setPendingSetup({
          qrSvgDataUri: data.qrSvgDataUri,
          manualKeyFormatted: data.manualKeyFormatted,
          otpauthUri: String(data.otpauthUri || ''),
        });
        if (data.mfaStatus) {
          setMfaStatus(data.mfaStatus as AdminMfaStatusSnapshot);
        }
        setSetupVerifyCode('');
      } else {
        setMfaError(String(data.error || 'Could not start authenticator setup'));
      }
    } catch {
      setMfaError('Failed to start authenticator setup');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleConfirmTotpSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupVerifyCode.trim()) return;
    setMfaBusy(true);
    setMfaError(null);
    try {
      const data = await postAdminAction({
        action: 'confirm-totp-setup',
        totpCode: setupVerifyCode.trim(),
      });
      if (data.ok) {
        setPendingSetup(null);
        setSetupVerifyCode('');
        if (data.mfaStatus) {
          setMfaStatus(data.mfaStatus as AdminMfaStatusSnapshot);
        }
        if (Array.isArray(data.recoveryCodes)) {
          setFreshRecoveryCodes(data.recoveryCodes as string[]);
        }
        syncAuditLogs(data.auditLogs, data.auditTotal);
        setAuditFilter('all');
        setAuditPage(1);
        showToast('Authenticator 2FA activated and backup codes generated');
      } else {
        setMfaError(String(data.error || 'Invalid 6-digit verification code'));
      }
    } catch {
      setMfaError('Could not confirm authenticator setup');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleStepUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stepUpMode || !stepUpPassphrase.trim() || !stepUpCode.trim()) return;
    setMfaBusy(true);
    setMfaError(null);
    try {
      const actionName =
        stepUpMode === 'rotate' ? 'rotate-totp-setup' : 'disable-totp';
      const data = await postAdminAction({
        action: actionName,
        currentPassphrase: stepUpPassphrase,
        verificationCode: stepUpCode.trim(),
      });

      if (!data.ok) {
        setMfaError(String(data.error || 'Verification failed'));
        return;
      }

      syncAuditLogs(data.auditLogs, data.auditTotal);
      setStepUpPassphrase('');
      setStepUpCode('');

      if (stepUpMode === 'rotate') {
        setStepUpMode(null);
        setFreshRecoveryCodes(null);
        if (
          typeof data.qrSvgDataUri === 'string' &&
          data.qrSvgDataUri.startsWith('data:image/svg+xml;base64,') &&
          typeof data.manualKeyFormatted === 'string'
        ) {
          setPendingSetup({
            qrSvgDataUri: data.qrSvgDataUri,
            manualKeyFormatted: data.manualKeyFormatted,
            otpauthUri: String(data.otpauthUri || ''),
          });
        }
        if (data.mfaStatus) {
          setMfaStatus(data.mfaStatus as AdminMfaStatusSnapshot);
        }
        showToast('Scan the new QR code and confirm 6-digit code to finish rotation');
      } else {
        setStepUpMode(null);
        setPendingSetup(null);
        setFreshRecoveryCodes(null);
        if (data.mfaStatus) {
          setMfaStatus(data.mfaStatus as AdminMfaStatusSnapshot);
        }
        showToast('Authenticator 2FA disabled');
      }
    } catch {
      setMfaError('Could not complete 2FA security action');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDownloadRecoveryTxt = (codes: string[]) => {
    const body = [
      'GREENVILLE DIY ARCHIVE & BARTER MARKET — BACKUP RECOVERY CODES',
      `Generated: ${new Date().toISOString()}`,
      'Each code below can be used ONCE if your authenticator phone is unavailable:',
      '',
      ...codes.map((c, idx) => `0${idx + 1}. ${c}`),
      '',
    ].join('\n');
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'greenville_diy_2fa_recovery_codes.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Downloaded recovery codes .TXT');
  };

  const handleGeneratePasswordHash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphraseDraft.length < 16) {
      showToast('Passphrase must be at least 16 characters long');
      return;
    }
    setGeneratingHash(true);
    try {
      const data = await postAdminAction({
        action: 'generate-password-hash',
        passphrase: passphraseDraft,
      });
      if (data.ok && typeof data.envLine === 'string') {
        setGeneratedEnvHashLine(data.envLine);
        setPassphraseDraft('');
        syncAuditLogs(data.auditLogs, data.auditTotal);
        showToast('Generated salted scrypt hash (N=65536, r=8, p=2)');
      } else {
        showToast(String(data.error || 'Failed to generate passphrase hash'));
      }
    } catch {
      showToast('Could not generate passphrase hash');
    } finally {
      setGeneratingHash(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    setRevokingAllSessions(true);
    try {
      await postAdminAction({ action: 'revoke-all-sessions' });
      setAdminMemoryToken(null);
      onLocked?.();
      router.push('/admin');
      router.refresh();
    } catch {
      setRevokingAllSessions(false);
      showToast('Could not revoke active sessions');
    }
  };

  const handleAddFutureTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskRationale.trim()) return;
    const data = await postAdminAction({
      action: 'add-future-task',
      passPhase: taskPhase,
      area: taskArea,
      priority: taskPriority,
      title: taskTitle,
      rationale: taskRationale,
      prerequisite: taskPrereq || 'Set required Hostinger env vars',
    });
    if (data.ok && data.task) {
      setFutureTasks((prev) => [data.task as FutureTaskLedgerItem, ...prev]);
      syncAuditLogs(data.auditLogs, data.auditTotal);
      setTaskTitle('');
      setTaskRationale('');
      setTaskPrereq('');
      showToast(`Logged task to ${taskPhase} Ledger`);
    }
  };

  const handleUpdateTaskStatus = async (id: string, status: TaskStatus) => {
    const data = await postAdminAction({
      action: 'update-future-task-status',
      id,
      status,
    });
    if (data.ok && data.task) {
      const updated = data.task as FutureTaskLedgerItem;
      setFutureTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      syncAuditLogs(data.auditLogs, data.auditTotal);
      showToast(`${id} -> ${status}`);
    }
  };

  const handleDeleteTask = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-future-task', id });
    if (data.ok) {
      setFutureTasks((prev) => prev.filter((t) => t.id !== id));
      syncAuditLogs(data.auditLogs, data.auditTotal);
      showToast('Removed task');
    }
  };

  if (mode === 'csv') {
    return (
      <div className="flex flex-col gap-4 anim-in">
        <div className="glass-panel p-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-[var(--ink-2)]">
            Private ledger ingested from public <strong>Message Us</strong> &amp;{' '}
            <strong>Live Chat</strong> opt-ins.
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="typo-action whitespace-nowrap"
              onClick={() => {
                navigator.clipboard?.writeText(
                  'Filter this CSV spreadsheet for rows whose Interests match [TOPIC], and return only their Email addresses as a comma-separated list for Mailchimp.'
                );
                showToast('Copied Mailchimp filter prompt');
              }}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Mailchimp Filter Prompt</span>
            </button>
            <button
              type="button"
              className="btn-arch btn-cta-bright whitespace-nowrap"
              onClick={async () => {
                const ok = await downloadAuthenticatedFile(
                  '/api/admin/subscribers?format=csv',
                  'greenville_diy_admin_subscribers.csv'
                );
                showToast(
                  ok ? 'Downloading RFC-4180 .CSV' : 'Could not export .CSV'
                );
              }}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .CSV</span>
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th>Name</th>
                <th>Email</th>
                <th>Scene Interests / Message</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((r) => (
                <React.Fragment key={r.id}>
                  <tr>
                    <td className="font-mono text-xs tabular-nums">{r.createdAtIso}</td>
                    <td className="font-mono text-xs">{r.source}</td>
                    <td><strong>{r.name}</strong></td>
                    <td className="font-mono text-xs">{r.email}</td>
                    <td>{r.interests}</td>
                    <td>
                      <div className="inline-flex flex-wrap items-center gap-2.5">
                        <button type="button" onClick={() => (editingSubId === r.id ? setEditingSubId(null) : startEditSub(r))} className="btn-arch !py-1 !px-2.5 !text-[11px] font-mono whitespace-nowrap">[ EDIT ]</button>
                        <button type="button" onClick={() => handleRemoveSubscriber(r.id)} className="typo-action typo-action-danger whitespace-nowrap"><Trash2 className="w-3.5 h-3.5" /><span>Remove</span></button>
                      </div>
                    </td>
                  </tr>
                  {editingSubId === r.id && editSub && (
                    <tr>
                      <td colSpan={6} className="!p-3 bg-[var(--bg-ground)]/50">
                        <form onSubmit={handleSaveSubEdit} className="glass-panel p-5 grid grid-cols-1 sm:grid-cols-12 items-end gap-3">
                          <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">Editing Subscriber · {r.id}</div>
                          <div className="field-group sm:col-span-2"><label className="field-label">Date</label><input type="text" required value={editSub.createdAtIso} onChange={(e) => setEditSub({ ...editSub, createdAtIso: e.target.value })} className="input-clean font-mono tabular-nums" /></div>
                          <div className="field-group sm:col-span-2"><label className="field-label">Source</label><select value={editSub.source} onChange={(e) => setEditSub({ ...editSub, source: e.target.value as SubscriberCsvRow['source'] })} className="input-clean"><option value="Message Us">Message Us</option><option value="Live Chat">Live Chat</option></select></div>
                          <div className="field-group sm:col-span-4"><label className="field-label">Name</label><input type="text" required value={editSub.name} onChange={(e) => setEditSub({ ...editSub, name: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-4"><label className="field-label">Email</label><input type="email" required value={editSub.email} onChange={(e) => setEditSub({ ...editSub, email: e.target.value })} className="input-clean font-mono" /></div>
                          <div className="field-group sm:col-span-7"><label className="field-label">Scene Interests / Notes</label><input type="text" value={editSub.interests} onChange={(e) => setEditSub({ ...editSub, interests: e.target.value })} className="input-clean" /></div>
                          <div className="sm:col-span-5 flex items-center justify-end gap-2">
                            <button type="button" onClick={() => { setEditingSubId(null); setEditSub(null); }} className="btn-arch py-2 px-3.5 whitespace-nowrap">Cancel</button>
                            <button type="submit" className="btn-arch btn-cta-bright py-2 px-4 whitespace-nowrap">Save Changes</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE));
  const rangeStart = auditTotal === 0 ? 0 : (auditPage - 1) * AUDIT_PAGE_SIZE + 1;
  const rangeEnd = Math.min(auditTotal, auditPage * AUDIT_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-5 anim-in">
      {/* Runtime Posture + 5-Step Hostinger Cutover Runbook */}
      <section className="glass-panel p-5 sm:p-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--grid-hairline-strong)] pb-4">
          <div>
            <div className="sec-kicker">08 · Zero-Edit Runtime Switch &amp; Hostinger Runbook</div>
            <h2 className="sec-title !text-xl">Demo Port-3000 Posture → Hostinger Live Cutover</h2>
            <p className="text-xs text-[var(--ink-2)] max-w-2xl mt-1.5 mb-0 leading-relaxed">
              Port 3000, in-memory archive seeding, and iframe-safe Demo Unlock remain active while <code className="font-mono">DB_HOST</code> is empty. Setting the Hostinger hPanel environment variables switches automatically to <code className="font-mono">$PORT</code>, local MySQL <code className="font-mono">127.0.0.1:3306</code>, and two-factor curator auth.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              className="btn-arch whitespace-nowrap"
              onClick={() => {
                const envBlock = [
                  'NODE_ENV=production',
                  'DB_HOST=127.0.0.1',
                  'DB_PORT=3306',
                  'DB_NAME=u123456789_gvl_diy',
                  'DB_USER=u123456789_curator',
                  'DB_PASSWORD=replace-with-mysql-password',
                  'ADMIN_PASSWORD_HASH="replace-with-generated-scrypt-hash"',
                  'ADMIN_SESSION_SECRET=replace-with-64-char-hex',
                  'ADMIN_TOTP_SECRET=',
                ].join('\n');
                navigator.clipboard?.writeText(envBlock);
                showToast('Copied hPanel environment template');
              }}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy hPanel .env Template</span>
            </button>
            <button
              type="button"
              className="btn-arch btn-cta-bright whitespace-nowrap"
              onClick={async () => {
                const ok = await downloadAuthenticatedFile(
                  '/api/admin/schema',
                  'greenville_diy_hostinger_mysql_schema.sql'
                );
                showToast(ok ? 'Downloading phpMyAdmin SQL schema' : 'Could not download SQL schema');
              }}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download mysql-schema.sql</span>
            </button>
          </div>
        </div>

        <div className="cutover-grid" aria-label="Runtime Posture Status">
          <div className="cutover-cell">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mono)]">Runtime Mode</span>
            <span className={`status-stamp ${runtimePosture?.mode === 'hostinger-production' ? 'status-active' : 'status-live'}`}>
              {runtimePosture?.mode === 'hostinger-production' ? 'Hostinger Production' : 'Preview Demo (Steady)'}
            </span>
          </div>
          <div className="cutover-cell">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mono)]">Port Binding</span>
            <span className="font-mono text-xs font-bold tabular-nums">Port {runtimePosture?.activePort || '3000'}</span>
          </div>
          <div className="cutover-cell">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mono)]">Storage Engine</span>
            <span className="font-mono text-xs font-bold tabular-nums">
              {storageDriver === 'hostinger-mysql' ? `MySQL · ${runtimePosture?.mysqlHostDisplay}` : 'In-Memory Seed Store'}
            </span>
          </div>
          <div className="cutover-cell">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mono)]">2FA Posture</span>
            <span className={`status-stamp ${mfaStatus.active ? 'status-active' : 'status-muted'}`}>
              {mfaStatus.dbEnabled
                ? 'TOTP 2FA Enrolled'
                : mfaStatus.envFallbackConfigured
                ? 'Env Fallback 2FA'
                : 'Passphrase Only'}
            </span>
          </div>
        </div>

        <div className="cutover-grid" aria-label="5-Step Hostinger Guide">
          <div className="cutover-cell"><span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">01 · Node.js App Setup</span><div className="text-xs font-bold">Connect Repo in hPanel</div><p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">Node 20/22 · Build <code className="font-mono">npm run build</code> · Start <code className="font-mono">npm run start</code>.</p></div>
          <div className="cutover-cell"><span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">02 · Local MySQL 127.0.0.1</span><div className="text-xs font-bold">Create Database</div><p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">Tables auto-create on first boot or via <code className="font-mono">mysql-schema.sql</code>.</p></div>
          <div className="cutover-cell"><span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">03 · Paste hPanel Keys</span><div className="text-xs font-bold">Zero-Edit Env Flip</div><p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">Set <code className="font-mono">DB_HOST=127.0.0.1</code>, <code className="font-mono">ADMIN_PASSWORD_HASH</code>, and <code className="font-mono">ADMIN_SESSION_SECRET</code>.</p></div>
          <div className="cutover-cell"><span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">04 · Enroll TOTP 2FA</span><div className="text-xs font-bold">Pair Authenticator App</div><p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">Scan server SVG QR below and store your 8 single-use recovery codes.</p></div>
          <div className="cutover-cell"><span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">05 · DNS &amp; Verify</span><div className="text-xs font-bold">Point Domain</div><p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">Point <code className="font-mono">greenvillediyarchive.org</code> and verify <code className="font-mono">Hostinger Production</code>.</p></div>
        </div>
      </section>

      {/* Two-Phase Anti-Lockout Authenticator 2FA (RFC 6238 TOTP) */}
      <section
        className="glass-panel p-5 sm:p-6 flex flex-col gap-4"
        aria-label="Two-Factor Authenticator Security"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[var(--grid-hairline)]">
          <div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[var(--ink-mono)] mb-1 tabular-nums">
              <span>RFC 6238 TOTP 2FA</span>
              <span aria-hidden="true">·</span>
              <span className={mfaStatus.active ? 'text-[var(--green-sold)] font-bold' : ''}>
                {mfaStatus.dbEnabled
                  ? 'Active (Database Enrolled)'
                  : mfaStatus.envFallbackConfigured
                  ? 'Active (.env Read-Only Fallback)'
                  : 'Not Enrolled'}
              </span>
              {mfaStatus.dbEnabled && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {mfaStatus.remainingRecoveryCodes} / 8 Recovery Codes Remaining
                  </span>
                </>
              )}
            </div>
            <h3 className="plate-title text-base m-0">
              Hardware &amp; Mobile Authenticator Two-Factor Protection
            </h3>
            <p className="text-xs text-[var(--ink-2)] mt-1 mb-0 max-w-2xl leading-relaxed">
              Compatible with Microsoft Authenticator and Google Authenticator (HMAC-SHA1 · 6 digits · 30s rotation). Two-phase enrollment keeps 2FA off until you confirm a live 6-digit code from your phone.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!mfaStatus.dbEnabled && !pendingSetup && (
              <button
                type="button"
                disabled={mfaBusy}
                onClick={handleBeginTotpSetup}
                className="btn-arch btn-cta-bright py-2 px-4 text-xs whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {mfaBusy
                    ? 'Generating Secret...'
                    : mfaStatus.envFallbackConfigured
                    ? 'Enroll Live 2FA (Override .env)'
                    : 'Set Up Authenticator 2FA'}
                </span>
              </button>
            )}

            {mfaStatus.active && !pendingSetup && (
              <>
                <button
                  type="button"
                  disabled={mfaBusy}
                  onClick={() => {
                    setStepUpMode((cur) => (cur === 'rotate' ? null : 'rotate'));
                    setMfaError(null);
                  }}
                  className="btn-arch py-2 px-3.5 text-xs whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Rotate Authenticator Device</span>
                </button>
                {mfaStatus.dbEnabled && (
                  <button
                    type="button"
                    disabled={mfaBusy}
                    onClick={() => {
                      setStepUpMode((cur) => (cur === 'disable' ? null : 'disable'));
                      setMfaError(null);
                    }}
                    className="btn-arch py-2 px-3.5 text-xs whitespace-nowrap"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Disable 2FA</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {mfaError && (
          <div
            role="alert"
            className="text-xs font-mono text-[var(--cta-bright)] px-3 py-2 rounded-[var(--r-key)] bg-[var(--accent-soft)] border border-[var(--accent)]"
          >
            {mfaError}
          </div>
        )}

        {/* Step 1 + Step 2 Two-Phase Provisioning View */}
        {pendingSetup && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-1 items-start">
            <div className="md:col-span-4 flex flex-col items-center sm:items-start gap-2">
              <div className="p-2.5 bg-white rounded-[var(--r-key)] border border-[var(--grid-hairline-strong)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pendingSetup.qrSvgDataUri}
                  alt="Scan this QR code in Microsoft Authenticator or Google Authenticator"
                  referrerPolicy="no-referrer"
                  className="w-44 h-44 block"
                />
              </div>
              <span className="font-mono text-[10.5px] text-[var(--ink-mono)] tabular-nums">
                Step 1 / 2 · Pending Verification (2FA Still Off)
              </span>
            </div>

            <div className="md:col-span-8 flex flex-col gap-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-[var(--grid-hairline)] text-xs">
                <div>
                  <div className="font-mono text-[10.5px] uppercase tracking-wider text-[var(--ink-mono)] mb-0.5">
                    Microsoft Authenticator
                  </div>
                  <div className="text-[var(--ink)]">
                    Tap <code className="font-mono">+</code> → <strong>Other account</strong> → <strong>Scan QR</strong>
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10.5px] uppercase tracking-wider text-[var(--ink-mono)] mb-0.5">
                    Google Authenticator
                  </div>
                  <div className="text-[var(--ink)]">
                    Tap <code className="font-mono">+</code> → <strong>Scan a QR code</strong>
                  </div>
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="totp-manual-base32" className="field-label">
                  Manual Base32 Setup Key (SHA1 · 6 Digits · 30s)
                </label>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <input
                    id="totp-manual-base32"
                    type="text"
                    readOnly
                    value={pendingSetup.manualKeyFormatted}
                    onFocus={(e) => e.currentTarget.select()}
                    className="input-clean font-mono text-xs tracking-wider w-full tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(
                        pendingSetup.manualKeyFormatted.replace(/\s+/g, '')
                      );
                      showToast('Copied Base32 setup key');
                    }}
                    className="btn-arch py-2 px-3.5 text-xs whitespace-nowrap shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Key</span>
                  </button>
                </div>
              </div>

              <form
                onSubmit={handleConfirmTotpSetup}
                className="grid grid-cols-1 sm:grid-cols-12 items-end gap-3 pt-1"
              >
                <div className="field-group sm:col-span-6">
                  <label htmlFor="totp-confirm-input" className="field-label">
                    Step 2 · Live 6-Digit Authenticator Code
                  </label>
                  <input
                    id="totp-confirm-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    required
                    value={setupVerifyCode}
                    onChange={(e) => setSetupVerifyCode(e.target.value)}
                    placeholder="000000"
                    className="input-clean font-mono text-sm tracking-widest tabular-nums w-full"
                  />
                </div>
                <div className="sm:col-span-6 flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={mfaBusy || setupVerifyCode.replace(/\D/g, '').length !== 6}
                    className="btn-arch btn-cta-bright py-2 px-4 whitespace-nowrap"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>
                      {mfaBusy ? 'Activating...' : 'Verify & Enable 2FA'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={mfaBusy}
                    onClick={() => {
                      setPendingSetup(null);
                      setSetupVerifyCode('');
                      setMfaError(null);
                    }}
                    className="btn-arch py-2 px-3.5 whitespace-nowrap"
                  >
                    <span>Cancel</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Step-Up Verification Form for Rotate Device or Disable 2FA */}
        {stepUpMode && !pendingSetup && (
          <form
            onSubmit={handleStepUpSubmit}
            className="pt-3 border-t border-[var(--grid-hairline)] grid grid-cols-1 sm:grid-cols-12 items-end gap-3"
          >
            <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)]">
              {stepUpMode === 'rotate'
                ? 'Step-Up Verification · Confirm Current Passphrase + 2FA Code to Rotate Authenticator Device'
                : 'Step-Up Verification · Confirm Current Passphrase + 2FA Code to Disable 2FA'}
            </div>
            <div className="field-group sm:col-span-5">
              <label htmlFor="stepup-passphrase" className="field-label">
                Current Curator Passphrase
              </label>
              <input
                id="stepup-passphrase"
                type="password"
                required
                autoComplete="current-password"
                value={stepUpPassphrase}
                onChange={(e) => setStepUpPassphrase(e.target.value)}
                className="input-clean w-full"
              />
            </div>
            <div className="field-group sm:col-span-4">
              <label htmlFor="stepup-totp" className="field-label">
                6-Digit TOTP or Recovery Code
              </label>
              <input
                id="stepup-totp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={stepUpCode}
                onChange={(e) => setStepUpCode(e.target.value)}
                placeholder="000000 or XXXX-XXXX"
                className="input-clean font-mono tabular-nums w-full"
              />
            </div>
            <div className="sm:col-span-3 flex items-center gap-2">
              <button
                type="submit"
                disabled={mfaBusy || !stepUpPassphrase.trim() || !stepUpCode.trim()}
                className="btn-arch btn-cta-bright py-2 px-3.5 whitespace-nowrap flex-1 justify-center"
              >
                <span>
                  {mfaBusy
                    ? 'Verifying...'
                    : stepUpMode === 'rotate'
                    ? 'Begin Rotation'
                    : 'Confirm Disable'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStepUpMode(null);
                  setStepUpPassphrase('');
                  setStepUpCode('');
                  setMfaError(null);
                }}
                className="btn-arch py-2 px-3 whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* One-Time 8 Backup Recovery Codes Reveal */}
        {freshRecoveryCodes && freshRecoveryCodes.length > 0 && (
          <div className="pt-3 border-t border-[var(--grid-hairline-strong)] flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-xs font-bold text-[var(--accent)]">
                  Save Your 8 Single-Use Backup Recovery Codes Now
                </div>
                <p className="text-xs text-[var(--ink-2)] m-0 mt-0.5">
                  Stored only as SHA-256 hashes on the server. Each code works once if your phone is lost or reset.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(freshRecoveryCodes.join('\n'));
                    showToast('Copied all 8 recovery codes');
                  }}
                  className="btn-arch py-1.5 px-3 text-xs whitespace-nowrap"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy 8 Codes</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadRecoveryTxt(freshRecoveryCodes)}
                  className="btn-arch btn-cta-bright py-1.5 px-3 text-xs whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .TXT</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFreshRecoveryCodes(null)}
                  className="typo-action !text-xs ml-1 whitespace-nowrap"
                >
                  Done Saving
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-l border-[var(--grid-hairline-strong)]">
              {freshRecoveryCodes.map((code, idx) => (
                <div
                  key={code}
                  className="px-3 py-2.5 border-r border-b border-[var(--grid-hairline-strong)] font-mono text-xs tabular-nums flex items-center justify-between gap-2"
                >
                  <span className="text-[var(--ink-mono)]">0{idx + 1}</span>
                  <strong className="tracking-wider text-[var(--ink)]">{code}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Passphrase Hash Generator + Global Session Revocation */}
      <section className="glass-panel p-5 sm:p-6 flex flex-col gap-4" aria-label="Curator Security and Hash Generator">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[var(--grid-hairline)]">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-mono)] block mb-0.5 tabular-nums">Memory-Hard Auth &amp; Session Control</span>
            <h3 className="plate-title text-base m-0">16+ Character Passphrase Hash Generator &amp; Global Session Revoke</h3>
          </div>
          <button type="button" disabled={revokingAllSessions} onClick={handleRevokeAllSessions} className="btn-arch py-2 px-3.5 text-xs shrink-0 whitespace-nowrap">
            <Lock className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>{revokingAllSessions ? 'Revoking...' : 'Revoke All Active Sessions'}</span>
          </button>
        </div>

        <form onSubmit={handleGeneratePasswordHash} className="grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5">
          <div className="field-group sm:col-span-8">
            <label htmlFor="cutover-passphrase" className="field-label">New Curator Passphrase (16+ Characters Minimum · {passphraseDraft.length} entered)</label>
            <input id="cutover-passphrase" type="password" minLength={16} maxLength={256} required value={passphraseDraft} onChange={(e) => setPassphraseDraft(e.target.value)} placeholder="Enter a 16+ character curator passphrase" className="input-clean w-full" />
          </div>
          <div className="sm:col-span-4 flex sm:justify-end">
            <button type="submit" disabled={generatingHash || passphraseDraft.length < 16} className="btn-arch btn-cta-bright py-2 px-4 w-full sm:w-auto justify-center whitespace-nowrap">
              <span>{generatingHash ? 'Deriving 64 MiB Hash...' : 'Generate ADMIN_PASSWORD_HASH'}</span>
            </button>
          </div>
        </form>

        {generatedEnvHashLine && (
          <div className="grid grid-cols-1 sm:grid-cols-12 items-end gap-3 pt-2 border-t border-[var(--grid-hairline)]">
            <div className="field-group sm:col-span-9">
              <label htmlFor="cutover-generated-hash" className="field-label">Hostinger hPanel Environment Variable Line (Copy Only)</label>
              <input id="cutover-generated-hash" type="text" readOnly value={generatedEnvHashLine} onFocus={(e) => e.currentTarget.select()} className="input-clean font-mono text-xs w-full" />
            </div>
            <div className="sm:col-span-3 flex sm:justify-end">
              <button type="button" onClick={() => { navigator.clipboard?.writeText(generatedEnvHashLine); showToast('Copied ADMIN_PASSWORD_HASH line'); }} className="btn-arch py-2 px-4 w-full sm:w-auto justify-center whitespace-nowrap">
                <Copy className="w-3.5 h-3.5" /><span>Copy Env Line</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Next-Iteration Task Ledger */}
      <form onSubmit={handleAddFutureTask} className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5">
        <div className="field-group sm:col-span-4"><label htmlFor="task-phase" className="field-label">Iteration Phase</label><select id="task-phase" value={taskPhase} onChange={(e) => setTaskPhase(e.target.value as FutureTaskLedgerItem['passPhase'])} className="input-clean"><option value="Pass 11">Pass 11 (Deep Links &amp; Runtime)</option><option value="Pass 10">Pass 10 (TOTP 2FA &amp; Audit Hardening)</option><option value="Pass 9">Pass 9 (Carved Typography &amp; Calendar)</option><option value="Pass 8">Pass 8 (Iteration 4)</option><option value="Pass 7">Pass 7 (Iteration 3)</option><option value="Pass 6">Pass 6 (Iteration 2)</option><option value="Pass 5">Pass 5 (Iteration 1)</option><option value="Hostinger">Hostinger</option><option value="Storage / CDN">Storage / CDN</option></select></div>
        <div className="field-group sm:col-span-4"><label htmlFor="task-area" className="field-label">Subsystem Area</label><select id="task-area" value={taskArea} onChange={(e) => setTaskArea(e.target.value as FutureTaskLedgerItem['area'])} className="input-clean"><option value="Hostinger MySQL">Hostinger MySQL</option><option value="Auth & Security">Auth &amp; Security</option><option value="UI & Media">UI &amp; Media</option><option value="Puck Visual Studio">Puck Visual Studio</option><option value="Google Drive / R2">Google Drive / R2</option><option value="IG Webhooks">IG Webhooks</option></select></div>
        <div className="field-group sm:col-span-4"><label htmlFor="task-priority" className="field-label">Priority</label><select id="task-priority" value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as TaskPriority)} className="input-clean"><option value="P0">P0 · Launch Cutover</option><option value="P1">P1 · High</option><option value="P2">P2 · Optional</option></select></div>
        <div className="field-group sm:col-span-12"><label htmlFor="task-title" className="field-label">Task Title</label><input id="task-title" type="text" required value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Describe next-iteration or cutover task" className="input-clean" /></div>
        <div className="field-group sm:col-span-7"><label htmlFor="task-rationale" className="field-label">Architectural Rationale</label><input id="task-rationale" type="text" required value={taskRationale} onChange={(e) => setTaskRationale(e.target.value)} className="input-clean" /></div>
        <div className="field-group sm:col-span-5"><label htmlFor="task-prereq" className="field-label">Prerequisite or Env Var</label><input id="task-prereq" type="text" value={taskPrereq} onChange={(e) => setTaskPrereq(e.target.value)} className="input-clean" /></div>
        <div className="sm:col-span-12 flex justify-end"><button type="submit" className="btn-arch btn-cta-bright py-2 px-5 whitespace-nowrap">+ Log Next-Round Task</button></div>
      </form>

      <div className="table-wrap">
        <table className="clean-table">
          <thead>
            <tr><th>ID / Phase</th><th>Area</th><th>Task, Rationale &amp; Prerequisite</th><th>Status</th><th>Transition</th></tr>
          </thead>
          <tbody>
            {futureTasks.map((t) => (
              <tr key={t.id}>
                <td className="font-mono text-xs whitespace-nowrap tabular-nums"><div className="font-bold text-[var(--ink)]">{t.id}</div><div className="text-[10.5px] text-[var(--mute)]">{t.passPhase} · {t.priority}</div></td>
                <td className="font-mono text-xs whitespace-nowrap">{t.area}</td>
                <td><strong>{t.title}</strong><p className="text-xs text-[var(--ink-2)] my-1 leading-relaxed">{t.rationale}</p>{t.prerequisite && <div className="font-mono text-[11px] text-[var(--mute)]">Prereq: {t.prerequisite}</div>}</td>
                <td><span className={`status-stamp ${t.status === 'Completed' ? 'status-active' : t.status === 'In Progress' ? 'status-live' : 'status-muted'}`}>{t.status}</span></td>
                <td>
                  <div className="flex flex-wrap items-center gap-2">
                    {(['Planned', 'In Progress', 'Deferred', 'Completed'] as TaskStatus[]).filter((s) => s !== t.status).map((s) => (
                      <button key={s} type="button" onClick={() => handleUpdateTaskStatus(t.id, s)} className="typo-action !text-[10.5px] whitespace-nowrap">{s}</button>
                    ))}
                    <button type="button" onClick={() => handleDeleteTask(t.id)} className="typo-action typo-action-danger !text-[10.5px] whitespace-nowrap">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Live Security & Curator Audit Trail (Event Filtering + 50-Row Pagination + Formula-Safe CSV Export) */}
      <section className="glass-panel p-5 sm:p-6 flex flex-col gap-3.5" aria-label="Security and Curator Audit Trail">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--grid-hairline)]">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-mono)] block mb-0.5 tabular-nums">
              Indefinite Retention · {auditTotal} Matching Events
            </span>
            <h3 className="plate-title text-base m-0">
              Authentication, 2FA &amp; Curator Audit Trail
            </h3>
          </div>
          <button
            type="button"
            onClick={async () => {
              const qs = new URLSearchParams({
                format: 'csv',
                filter: auditFilter,
              });
              const ok = await downloadAuthenticatedFile(
                `/api/admin/audit?${qs.toString()}`,
                'greenville_diy_security_audit_log.csv'
              );
              showToast(
                ok
                  ? 'Downloading formula-sanitized Audit Log .CSV'
                  : 'Could not export Audit Log .CSV'
              );
            }}
            className="btn-arch btn-cta-bright py-2 px-4 text-xs whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Audit Log .CSV</span>
          </button>
        </div>

        {/* Event Filter Bar */}
        <div
          role="group"
          aria-label="Filter Audit Events"
          className="flex flex-wrap items-center gap-1.5"
        >
          {AUDIT_FILTER_OPTIONS.map((opt) => {
            const active = auditFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => handleSelectAuditFilter(opt.id)}
                className={`btn-arch !py-1 !px-2.5 !text-[11px] font-mono whitespace-nowrap ${
                  active ? 'btn-cta-bright' : ''
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="table-wrap">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Timestamp (UTC)</th>
                <th>Actor</th>
                <th>Event</th>
                <th>Target Reference</th>
              </tr>
            </thead>
            <tbody>
              {auditLoading ? (
                <tr>
                  <td colSpan={4} className="font-mono text-xs text-[var(--mute)]">
                    Loading audit log page...
                  </td>
                </tr>
              ) : auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="font-mono text-xs text-[var(--mute)]">
                    No events match filter &ldquo;{auditFilter}&rdquo;.
                  </td>
                </tr>
              ) : (
                auditLogs.map((entry) => {
                  const act = entry.actionName;
                  const isAlert =
                    act === 'totp_replay_blocked' ||
                    act === 'recovery_code_used' ||
                    act === 'totp_disabled' ||
                    act.includes('FAIL') ||
                    act.includes('LOCKOUT') ||
                    act.includes('BURST') ||
                    act.includes('BLOCKED') ||
                    act.includes('REVOKE') ||
                    act.includes('DELETE');
                  const isOk =
                    act === 'totp_enrolled' ||
                    act === 'totp_verified' ||
                    act.includes('LOGIN_') ||
                    act === 'HASH_GENERATED' ||
                    act.includes('UPDATE_') ||
                    act.includes('ADD_') ||
                    act.includes('PUBLISH_');
                  return (
                    <tr key={entry.id}>
                      <td className="font-mono text-xs whitespace-nowrap tabular-nums text-[var(--ink-2)]">
                        {entry.createdAtIso.replace('T', ' ').replace(/\.\d+Z$/, 'Z')}
                      </td>
                      <td className="font-mono text-xs whitespace-nowrap">
                        {entry.curatorUsername}
                      </td>
                      <td>
                        <span
                          className={`status-stamp ${
                            isAlert
                              ? 'status-live'
                              : isOk
                              ? 'status-active'
                              : 'status-muted'
                          }`}
                        >
                          {entry.actionName}
                        </span>
                      </td>
                      <td className="font-mono text-xs text-[var(--ink-mono)] tabular-nums">
                        {entry.targetId || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 50-Row Pagination Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 font-mono text-xs tabular-nums">
          <span className="text-[var(--ink-mono)]">
            Showing {String(rangeStart).padStart(2, '0')}–{String(rangeEnd).padStart(2, '0')} of {auditTotal} · Page {auditPage} / {totalPages} (50 / page)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={auditLoading || auditPage <= 1}
              onClick={() => handleChangeAuditPage(auditPage - 1)}
              className="btn-arch !py-1 !px-2.5 !text-[11px] whitespace-nowrap"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev 50</span>
            </button>
            <button
              type="button"
              disabled={auditLoading || auditPage >= totalPages}
              onClick={() => handleChangeAuditPage(auditPage + 1)}
              className="btn-arch !py-1 !px-2.5 !text-[11px] whitespace-nowrap"
            >
              <span>Next 50</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
