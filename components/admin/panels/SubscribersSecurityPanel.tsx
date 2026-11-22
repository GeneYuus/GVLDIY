// components/admin/panels/SubscribersSecurityPanel.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Download, Lock, Trash2 } from 'lucide-react';
import {
  AuditLogEntry,
  FutureTaskLedgerItem,
  RuntimePostureSnapshot,
  SubscriberCsvRow,
  TaskPriority,
  TaskStatus,
} from '@/types/archive';
import {
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
  postAdminAction: (
    payload: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  syncAuditLogs: (logs?: unknown) => void;
  showToast: (msg: string) => void;
  onLocked?: () => void;
}

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
    useState<FutureTaskLedgerItem['passPhase']>('Pass 7');
  const [taskArea, setTaskArea] =
    useState<FutureTaskLedgerItem['area']>('Hostinger MySQL');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('P1');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskRationale, setTaskRationale] = useState('');
  const [taskPrereq, setTaskPrereq] = useState('');

  // Security Controls State
  const [passphraseDraft, setPassphraseDraft] = useState('');
  const [generatedEnvHashLine, setGeneratedEnvHashLine] = useState<string | null>(
    null
  );
  const [generatingHash, setGeneratingHash] = useState(false);
  const [revokingAllSessions, setRevokingAllSessions] = useState(false);

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
        syncAuditLogs(data.auditLogs);
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
      syncAuditLogs(data.auditLogs);
      if (editingSubId === id) setEditingSubId(null);
      showToast('Removed subscriber entry');
    }
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
        if (Array.isArray(data.auditLogs)) {
          setAuditLogs(data.auditLogs as AuditLogEntry[]);
        }
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
      syncAuditLogs(data.auditLogs);
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
      syncAuditLogs(data.auditLogs);
      showToast(`${id} -> ${status}`);
    }
  };

  const handleDeleteTask = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-future-task', id });
    if (data.ok) {
      setFutureTasks((prev) => prev.filter((t) => t.id !== id));
      syncAuditLogs(data.auditLogs);
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
              className="typo-action"
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
              className="btn-arch btn-cta-bright"
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
                        <button type="button" onClick={() => (editingSubId === r.id ? setEditingSubId(null) : startEditSub(r))} className="btn-arch !py-1 !px-2.5 !text-[11px] font-mono">[ EDIT ]</button>
                        <button type="button" onClick={() => handleRemoveSubscriber(r.id)} className="typo-action typo-action-danger"><Trash2 className="w-3.5 h-3.5" /><span>Remove</span></button>
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
                            <button type="button" onClick={() => { setEditingSubId(null); setEditSub(null); }} className="btn-arch py-2 px-3.5">CANCEL</button>
                            <button type="submit" className="btn-arch btn-cta-bright py-2 px-4">SAVE CHANGES</button>
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

  return (
    <div className="flex flex-col gap-5 anim-in">
      {/* Runtime Posture + 5-Step Hostinger Cutover Runbook */}
      <section className="glass-panel p-5 sm:p-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--grid-hairline-strong)] pb-4">
          <div>
            <div className="sec-kicker">08 · Zero-Edit Runtime Switch &amp; Hostinger Runbook</div>
            <h2 className="sec-title !text-xl">Demo Port-3000 Posture → Hostinger Live Cutover</h2>
            <p className="text-xs text-[var(--ink-2)] max-w-2xl mt-1.5 mb-0 leading-relaxed">
              Port 3000, in-memory archive seeding, and iframe-safe Demo Unlock remain active while <code className="font-mono">DB_HOST</code> is empty. Setting the Hostinger hPanel environment variables switches automatically to <code className="font-mono">$PORT</code>, local MySQL <code className="font-mono">127.0.0.1:3306</code>, and memory-hard passkey auth.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              className="btn-arch"
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
              className="btn-arch btn-cta-bright"
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
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mono)]">Admin Auth Gate</span>
            <span className={`status-stamp ${runtimePosture?.demoUnlockEnabled === false ? 'status-active' : 'status-live'}`}>
              {runtimePosture?.demoUnlockEnabled === false ? 'Passkey Enforced' : 'Demo Unlock + Passkey'}
            </span>
          </div>
        </div>

        <div className="cutover-grid" aria-label="5-Step Hostinger Guide">
          <div className="cutover-cell"><span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">01 · Node.js App Setup</span><div className="text-xs font-bold">Connect Repo in hPanel</div><p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">Node 20/22 · Build <code className="font-mono">npm run build</code> · Start <code className="font-mono">npm run start</code>.</p></div>
          <div className="cutover-cell"><span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">02 · Local MySQL 127.0.0.1</span><div className="text-xs font-bold">Create Database</div><p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">Tables auto-create on first boot or via <code className="font-mono">mysql-schema.sql</code>.</p></div>
          <div className="cutover-cell"><span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">03 · Paste hPanel Keys</span><div className="text-xs font-bold">Zero-Edit Env Flip</div><p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">Set <code className="font-mono">DB_HOST=127.0.0.1</code>, <code className="font-mono">ADMIN_PASSWORD_HASH</code>, and <code className="font-mono">ADMIN_SESSION_SECRET</code>.</p></div>
          <div className="cutover-cell"><span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">04 · Off-Hostinger Media</span><div className="text-xs font-bold">Drive 206 Proxy &amp; R2</div><p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">Add <code className="font-mono">GDRIVE_CLIENT_EMAIL</code> + <code className="font-mono">GDRIVE_PRIVATE_KEY</code> or R2 URL.</p></div>
          <div className="cutover-cell"><span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">05 · DNS &amp; Verify</span><div className="text-xs font-bold">Point Domain</div><p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">Point <code className="font-mono">greenvillediyarchive.org</code> and verify <code className="font-mono">Hostinger Production</code>.</p></div>
        </div>
      </section>

      {/* Passphrase Hash Generator + Global Session Revocation */}
      <section className="glass-panel p-5 sm:p-6 flex flex-col gap-4" aria-label="Curator Security and Hash Generator">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[var(--grid-hairline)]">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-mono)] block mb-0.5 tabular-nums">Memory-Hard Auth &amp; Session Control</span>
            <h3 className="text-base font-extrabold tracking-tight m-0">16+ Character Passphrase Hash Generator &amp; Global Session Revoke</h3>
          </div>
          <button type="button" disabled={revokingAllSessions} onClick={handleRevokeAllSessions} className="btn-arch py-2 px-3.5 text-xs shrink-0">
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
            <button type="submit" disabled={generatingHash || passphraseDraft.length < 16} className="btn-arch btn-cta-bright py-2 px-4 w-full sm:w-auto justify-center">
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
              <button type="button" onClick={() => { navigator.clipboard?.writeText(generatedEnvHashLine); showToast('Copied ADMIN_PASSWORD_HASH line'); }} className="btn-arch py-2 px-4 w-full sm:w-auto justify-center">
                <Copy className="w-3.5 h-3.5" /><span>Copy Env Line</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Next-Iteration Task Ledger */}
      <form onSubmit={handleAddFutureTask} className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5">
        <div className="field-group sm:col-span-4"><label htmlFor="task-phase" className="field-label">Iteration Phase</label><select id="task-phase" value={taskPhase} onChange={(e) => setTaskPhase(e.target.value as FutureTaskLedgerItem['passPhase'])} className="input-clean"><option value="Pass 7">Pass 7 (Iteration 3)</option><option value="Pass 8">Pass 8 (Iteration 4)</option><option value="Pass 6">Pass 6 (Iteration 2)</option><option value="Pass 5">Pass 5 (Iteration 1)</option><option value="Hostinger">Hostinger</option><option value="Storage / CDN">Storage / CDN</option></select></div>
        <div className="field-group sm:col-span-4"><label htmlFor="task-area" className="field-label">Subsystem Area</label><select id="task-area" value={taskArea} onChange={(e) => setTaskArea(e.target.value as FutureTaskLedgerItem['area'])} className="input-clean"><option value="Hostinger MySQL">Hostinger MySQL</option><option value="Auth & Security">Auth &amp; Security</option><option value="UI & Media">UI &amp; Media</option><option value="Puck Visual Studio">Puck Visual Studio</option><option value="Google Drive / R2">Google Drive / R2</option><option value="IG Webhooks">IG Webhooks</option></select></div>
        <div className="field-group sm:col-span-4"><label htmlFor="task-priority" className="field-label">Priority</label><select id="task-priority" value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as TaskPriority)} className="input-clean"><option value="P0">P0 · Launch Cutover</option><option value="P1">P1 · High</option><option value="P2">P2 · Optional</option></select></div>
        <div className="field-group sm:col-span-12"><label htmlFor="task-title" className="field-label">Task Title</label><input id="task-title" type="text" required value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Describe next-iteration or cutover task" className="input-clean" /></div>
        <div className="field-group sm:col-span-7"><label htmlFor="task-rationale" className="field-label">Architectural Rationale</label><input id="task-rationale" type="text" required value={taskRationale} onChange={(e) => setTaskRationale(e.target.value)} className="input-clean" /></div>
        <div className="field-group sm:col-span-5"><label htmlFor="task-prereq" className="field-label">Prerequisite or Env Var</label><input id="task-prereq" type="text" value={taskPrereq} onChange={(e) => setTaskPrereq(e.target.value)} className="input-clean" /></div>
        <div className="sm:col-span-12 flex justify-end"><button type="submit" className="btn-arch btn-cta-bright py-2 px-5">+ Log Next-Round Task</button></div>
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
                      <button key={s} type="button" onClick={() => handleUpdateTaskStatus(t.id, s)} className="typo-action !text-[10.5px]">{s}</button>
                    ))}
                    <button type="button" onClick={() => handleDeleteTask(t.id)} className="typo-action typo-action-danger !text-[10.5px]">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Live Security & Curator Audit Trail */}
      <section className="flex flex-col gap-2.5" aria-label="Recent Security Audit Trail">
        <div className="flex items-baseline justify-between gap-2 px-0.5">
          <h3 className="text-sm font-extrabold tracking-tight m-0">Recent Authentication &amp; Curator Audit Trail</h3>
          <span className="font-mono text-[11px] text-[var(--ink-mono)] tabular-nums">{auditLogs.length} recorded events</span>
        </div>
        <div className="table-wrap">
          <table className="clean-table">
            <thead>
              <tr><th>Timestamp (UTC)</th><th>Actor</th><th>Event</th><th>Target Reference</th></tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr><td colSpan={4} className="font-mono text-xs text-[var(--mute)]">No authentication or curator events logged yet.</td></tr>
              ) : (
                auditLogs.slice(0, 30).map((entry) => {
                  const isAlert = entry.actionName.includes('FAIL') || entry.actionName.includes('LOCKOUT') || entry.actionName.includes('BLOCKED') || entry.actionName.includes('REVOKE') || entry.actionName.includes('DELETE');
                  const isOk = entry.actionName.includes('LOGIN_') || entry.actionName === 'HASH_GENERATED' || entry.actionName.includes('UPDATE_') || entry.actionName.includes('ADD_');
                  return (
                    <tr key={entry.id}>
                      <td className="font-mono text-xs whitespace-nowrap tabular-nums text-[var(--ink-2)]">{entry.createdAtIso.replace('T', ' ').replace(/\.\d+Z$/, 'Z')}</td>
                      <td className="font-mono text-xs whitespace-nowrap">{entry.curatorUsername}</td>
                      <td><span className={`status-stamp ${isAlert ? 'status-live' : isOk ? 'status-active' : 'status-muted'}`}>{entry.actionName}</span></td>
                      <td className="font-mono text-xs text-[var(--ink-mono)] tabular-nums">{entry.targetId || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
