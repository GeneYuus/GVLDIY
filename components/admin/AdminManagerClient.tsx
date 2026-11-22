// components/admin/AdminManagerClient.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Compass,
  Copy,
  Database,
  Gavel,
  LayoutGrid,
  Lock,
  Music,
  Palette,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import {
  AdminSiteSettings,
  ArchiveDataset,
  AuditLogEntry,
  CommentNode,
  FlacRecording,
  FutureTaskLedgerItem,
  InstagramAuctionItem,
  PhotoPlate,
  PuckPageRecord,
  RememberedPlace,
  RuntimePostureSnapshot,
  SceneArtist,
  SceneChatMessage,
  SeasonTheme,
  ShowCalendarEvent,
  SubscriberCsvRow,
  TimelineEra,
  VideoTape,
} from '@/types/archive';
import { adminFetch, setAdminMemoryToken } from '@/lib/dal/adminClientSession';
import VideosFlacPanel from '@/components/admin/panels/VideosFlacPanel';
import PhotosArtistsPanel from '@/components/admin/panels/PhotosArtistsPanel';
import TimelineRememberedPanel from '@/components/admin/panels/TimelineRememberedPanel';
import CalendarAuctionsPanel from '@/components/admin/panels/CalendarAuctionsPanel';
import SubscribersSecurityPanel from '@/components/admin/panels/SubscribersSecurityPanel';

interface AdminManagerClientProps {
  initialData: ArchiveDataset & {
    storageDriver: 'hostinger-mysql' | 'preview-memory';
    runtimePosture?: RuntimePostureSnapshot;
    auditLogs?: AuditLogEntry[];
  };
  onLocked?: () => void;
}

type ManagerTab = 'puck' | 'theme' | 'media' | 'timeline' | 'calendar' | 'auctions' | 'csv' | 'ledger';
type MediaSubSection = 'flac' | 'videos' | 'photos' | 'artists' | 'comments';

export default function AdminManagerClient({ initialData, onLocked }: AdminManagerClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ManagerTab>('puck');
  const [mediaSub, setMediaSub] = useState<MediaSubSection>('flac');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [siteSettings, setSiteSettings] = useState<AdminSiteSettings>(initialData.siteSettings);
  const [puckPages, setPuckPages] = useState<PuckPageRecord[]>(initialData.puckPages || []);
  const [videos, setVideos] = useState<VideoTape[]>(initialData.videos);
  const [audioTracks, setAudioTracks] = useState<FlacRecording[]>(initialData.audio);
  const [photos, setPhotos] = useState<PhotoPlate[]>(initialData.photos);
  const [artists, setArtists] = useState<SceneArtist[]>(initialData.artists);
  const [timeline, setTimeline] = useState<TimelineEra[]>(initialData.timeline);
  const [remembered, setRemembered] = useState<RememberedPlace[]>(initialData.remembered);
  const [calendarEvents, setCalendarEvents] = useState<ShowCalendarEvent[]>(initialData.calendar);
  const [auctions, setAuctions] = useState<InstagramAuctionItem[]>(initialData.auctions);
  const [commentsByItem, setCommentsByItem] = useState<Record<string, CommentNode[]>>(initialData.commentsByItem);
  const [sceneChat, setSceneChat] = useState<SceneChatMessage[]>(initialData.sceneChat || []);
  const [subscribers, setSubscribers] = useState<SubscriberCsvRow[]>(initialData.subscribers);
  const [futureTasks, setFutureTasks] = useState<FutureTaskLedgerItem[]>(initialData.futureTasks);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(initialData.auditLogs || []);
  const [newZineTitle, setNewZineTitle] = useState('');
  const [newZineSlug, setNewZineSlug] = useState('');

  const showToast = (msg: string) => setToastMsg(msg);
  const syncAuditLogs = (maybeLogs?: unknown) => {
    if (Array.isArray(maybeLogs)) setAuditLogs(maybeLogs as AuditLogEntry[]);
  };

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2600);
    return () => clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => {
    document.documentElement.setAttribute('data-season', siteSettings.seasonTheme);
    if (siteSettings.defaultContrast === 'dark') {
      document.documentElement.setAttribute('data-contrast', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.removeAttribute('data-contrast');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.classList.remove('dark');
    }
  }, [siteSettings.seasonTheme, siteSettings.defaultContrast]);

  const postAdminAction = async (payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const res = await adminFetch('/api/admin/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      setAdminMemoryToken(null);
      if (onLocked) onLocked();
      else router.push('/admin/login');
      throw new Error('Session expired');
    }
    return res.json();
  };

  const handleLogout = async () => {
    await adminFetch('/api/admin/auth', { method: 'DELETE' });
    setAdminMemoryToken(null);
    onLocked?.();
    router.push('/');
    router.refresh();
  };

  const handleSaveSiteSettings = async (patch: Partial<Omit<AdminSiteSettings, 'updatedAtIso'>>, label?: string) => {
    try {
      const data = await postAdminAction({ action: 'update-site-settings', ...patch });
      if (data.ok && data.siteSettings) {
        setSiteSettings(data.siteSettings as AdminSiteSettings);
        syncAuditLogs(data.auditLogs);
        showToast(label || 'Saved site configuration');
      }
    } catch {
      showToast('Could not save settings');
    }
  };

  const handleCreatePuckPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZineTitle.trim() || !newZineSlug.trim()) return;
    try {
      const res = await adminFetch('/api/admin/puck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', title: newZineTitle.trim(), slug: newZineSlug.trim() }),
      });
      if (res.status === 401) {
        setAdminMemoryToken(null);
        if (onLocked) onLocked();
        else router.push('/admin/login');
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.ok) return showToast(data.error || 'Could not create zine page');
      setPuckPages((prev) => [...prev, data.page]);
      setNewZineTitle('');
      setNewZineSlug('');
      showToast(`Created /p/${data.page.slug}`);
    } catch {
      showToast('Failed to create zine page');
    }
  };

  const handleDeleteOrClearPuck = async (slug: string, isSlot: boolean) => {
    try {
      const res = await adminFetch('/api/admin/puck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', slug }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.pages)) {
        setPuckPages(data.pages);
        showToast(isSlot ? `Cleared ${slug} blocks` : `Deleted /p/${slug}`);
      }
    } catch {
      showToast('Could not update Puck record');
    }
  };

  const totalCommentsCount = Object.values(commentsByItem).reduce((sum, list) => sum + list.length, 0);
  const navTabs: { id: ManagerTab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'puck', label: `01. Visual Studio (${puckPages.length})`, Icon: LayoutGrid },
    { id: 'theme', label: '02. Theme & Config', Icon: Palette },
    { id: 'media', label: '03. Media CRUD', Icon: Music },
    { id: 'timeline', label: `04. Timeline & Places (${timeline.length + remembered.length})`, Icon: Compass },
    { id: 'calendar', label: `05. Calendar (${calendarEvents.length})`, Icon: Calendar },
    { id: 'auctions', label: `06. Auctions (${auctions.length})`, Icon: Gavel },
    { id: 'csv', label: `07. Subscribers (${subscribers.length})`, Icon: Users },
    { id: 'ledger', label: `08. Cutover & Next Pass (${futureTasks.length})`, Icon: ClipboardList },
  ];

  return (
    <div className="min-h-screen pb-24">
      <header className="masthead">
        <div className="brand-wrap">
          <CheckCircle2 className="w-4 h-4 text-[var(--green-sold)] shrink-0" />
          <h1 className="brand-title whitespace-nowrap">Greenville DIY · Admin</h1>
          <span className="font-mono text-[11px] text-[var(--ink-mono)] hidden sm:inline-flex items-center gap-1.5 tabular-nums">
            <span>·</span><Database className="w-3 h-3" />
            <span>{initialData.storageDriver === 'hostinger-mysql' ? 'Hostinger MySQL · 127.0.0.1' : `Port ${initialData.runtimePosture?.activePort || '3000'} · Demo Memory`}</span>
          </span>
        </div>
        <div className="top-bar-actions">
          <Link href="/" className="typo-action"><ArrowLeft className="w-3.5 h-3.5" /><span>Archive</span></Link>
          <span className="text-[var(--mute)] font-mono text-xs" aria-hidden="true">·</span>
          <button type="button" onClick={handleLogout} className="typo-action"><Lock className="w-3.5 h-3.5" /><span>Lock Session</span></button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-9 pt-7">
        <nav aria-label="Manager Sections" className="admin-tab-strip mb-7">
          {navTabs.map(({ id, label, Icon }) => (
            <button key={id} type="button" className={`admin-tab-btn ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
              <Icon className="w-3.5 h-3.5" /><span>{label}</span>
            </button>
          ))}
        </nav>

        {/* ==================== 01. PUCK VISUAL STUDIO ==================== */}
        {activeTab === 'puck' && (
          <div className="flex flex-col gap-5 anim-in">
            <section className="glass-panel p-5 sm:p-6 flex flex-col gap-4">
              <div>
                <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent)] m-0 mb-1">
                  Inline Archive Drop-Slots (Videos · Remembered · Auctions)
                </h2>
                <p className="text-xs text-[var(--mute)] m-0">
                  Drag custom banners, 2-column layouts, mixed-media flyers, or sandboxed HTML zines above archive tabs. Empty slots stay invisible to visitors.
                </p>
              </div>
              <div className="brutal-grid">
                {puckPages.filter((p) => p.isSlot).map((slot) => {
                  const count = slot.puckData?.content?.length || 0;
                  return (
                    <div key={slot.slug} className="arch-plate p-4 justify-between gap-3">
                      <div>
                        <div className="font-mono text-[11px] text-[var(--accent)] font-semibold">{slot.slug}</div>
                        <div className="text-sm font-bold mt-0.5">{slot.title}</div>
                        <div className="font-mono text-xs text-[var(--ink-mono)] mt-1 tabular-nums">
                          {count} {count === 1 ? 'block' : 'blocks'} active
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--grid-hairline)]">
                        <Link href={`/admin/editor/${encodeURIComponent(slot.slug)}`} className="typo-action typo-action-accent">
                          <span>Open in Puck</span><ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                        {count > 0 && (
                          <button type="button" onClick={() => handleDeleteOrClearPuck(slot.slug, true)} className="typo-action typo-action-danger">
                            Clear Slot
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="glass-panel p-5 sm:p-6 flex flex-col gap-4">
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent)] m-0">
                Create Standalone Zine / Landing Page (/p/[slug])
              </h2>
              <form onSubmit={handleCreatePuckPage} className="grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5">
                <div className="field-group sm:col-span-5">
                  <label htmlFor="puck-zine-title" className="field-label">Zine Page Title</label>
                  <input
                    id="puck-zine-title"
                    type="text"
                    required
                    value={newZineTitle}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewZineTitle(val);
                      if (!newZineSlug) {
                        setNewZineSlug(val.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, ''));
                      }
                    }}
                    placeholder="e.g. Barn Winter Zine"
                    className="input-clean"
                  />
                </div>
                <div className="field-group sm:col-span-4">
                  <label htmlFor="puck-zine-slug" className="field-label">URL Slug (/p/...)</label>
                  <input
                    id="puck-zine-slug"
                    type="text"
                    required
                    value={newZineSlug}
                    onChange={(e) => setNewZineSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, ''))}
                    placeholder="e.g. barn-winter-zine"
                    className="input-clean font-mono"
                  />
                </div>
                <div className="sm:col-span-3 flex">
                  <button type="submit" className="btn-arch btn-cta-bright w-full py-2">
                    <Plus className="w-3.5 h-3.5" /><span>Create Zine Page</span>
                  </button>
                </div>
              </form>

              <div className="table-wrap">
                <table className="clean-table">
                  <thead>
                    <tr><th>Title</th><th>Public Route</th><th>Blocks</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {puckPages.filter((p) => !p.isSlot).map((p) => (
                      <tr key={p.slug}>
                        <td><strong>{p.title}</strong></td>
                        <td className="font-mono text-xs text-[var(--accent)]">/p/{p.slug}</td>
                        <td className="font-mono text-xs tabular-nums">{p.puckData?.content?.length || 0}</td>
                        <td>
                          <div className="inline-flex flex-wrap items-center gap-3">
                            <Link href={`/admin/editor/${encodeURIComponent(p.slug)}`} className="typo-action typo-action-accent">
                              <span>Edit in Puck</span><ArrowUpRight className="w-3 h-3" />
                            </Link>
                            <span className="text-[var(--mute)]" aria-hidden="true">·</span>
                            <Link href={`/p/${p.slug}`} target="_blank" rel="noopener noreferrer" className="typo-action">
                              <span>View</span><ArrowUpRight className="w-3 h-3" />
                            </Link>
                            <span className="text-[var(--mute)]" aria-hidden="true">·</span>
                            <button
                              type="button"
                              className="typo-action"
                              onClick={() => {
                                navigator.clipboard?.writeText(`${window.location.origin}/p/${p.slug}`);
                                showToast(`Copied /p/${p.slug}`);
                              }}
                            >
                              <Copy className="w-3 h-3" /><span>Copy URL</span>
                            </button>
                            <span className="text-[var(--mute)]" aria-hidden="true">·</span>
                            <button type="button" className="typo-action typo-action-danger" onClick={() => handleDeleteOrClearPuck(p.slug, false)}>
                              <Trash2 className="w-3 h-3" /><span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ==================== 02. THEME & SITE CONFIG ==================== */}
        {activeTab === 'theme' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 anim-in">
            <section className="glass-panel p-6 flex flex-col justify-between gap-5">
              <div>
                <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent)] mb-1.5">
                  Global Seasonal Silhouette &amp; Ambient Palette
                </h2>
                <p className="text-xs text-[var(--mute)] mb-4">
                  Controls the seasonal ambient color pools and monochrome emblem for all public visitors.
                </p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-6 pb-5 border-b border-[var(--glass-border)]">
                  {([
                    { id: 'fall', label: 'Fall · Sienna' },
                    { id: 'spring', label: 'Spring · Sage' },
                    { id: 'summer', label: 'Summer · Sun' },
                    { id: 'winter', label: 'Winter · Ice' },
                  ] as { id: SeasonTheme; label: string }[]).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={siteSettings.seasonTheme === s.id}
                      className={`typo-action ${siteSettings.seasonTheme === s.id ? 'active' : ''}`}
                      onClick={() => handleSaveSiteSettings({ seasonTheme: s.id }, `Season switched to ${s.id.toUpperCase()}`)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent)] mb-2.5">
                  Default Site Polarity
                </h2>
                <div className="flex flex-wrap items-center gap-5">
                  <button
                    type="button"
                    aria-pressed={siteSettings.defaultContrast === 'light'}
                    className={`typo-action ${siteSettings.defaultContrast === 'light' ? 'active' : ''}`}
                    onClick={() => handleSaveSiteSettings({ defaultContrast: 'light' }, 'Default contrast: Light Specular Glass')}
                  >
                    Light Specular Glass
                  </button>
                  <span className="text-[var(--mute)] font-mono text-xs">/</span>
                  <button
                    type="button"
                    aria-pressed={siteSettings.defaultContrast === 'dark'}
                    className={`typo-action ${siteSettings.defaultContrast === 'dark' ? 'active' : ''}`}
                    onClick={() => handleSaveSiteSettings({ defaultContrast: 'dark' }, 'Default contrast: Dark Obsidian Glass')}
                  >
                    Dark Obsidian Glass
                  </button>
                </div>
              </div>
            </section>

            <section className="glass-panel p-6 flex flex-col justify-between gap-4">
              <div className="flex flex-col gap-3.5">
                <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent)] m-0">
                  Curator Submission Mailboxes
                </h2>
                <div className="field-group">
                  <label htmlFor="cfg-archive-email" className="field-label">FLAC &amp; Scan Submissions Email</label>
                  <input id="cfg-archive-email" type="email" value={siteSettings.archiveSubmissionEmail} onChange={(e) => setSiteSettings((p) => ({ ...p, archiveSubmissionEmail: e.target.value }))} className="input-clean w-full" />
                </div>
                <div className="field-group">
                  <label htmlFor="cfg-calendar-email" className="field-label">Calendar Flyer Submissions Email</label>
                  <input id="cfg-calendar-email" type="email" value={siteSettings.calendarSubmissionEmail} onChange={(e) => setSiteSettings((p) => ({ ...p, calendarSubmissionEmail: e.target.value }))} className="input-clean w-full" />
                </div>
                <div className="field-group">
                  <label htmlFor="cfg-auction-email" className="field-label">Barter Market Auctions Email</label>
                  <input id="cfg-auction-email" type="email" value={siteSettings.auctionSubmissionEmail} onChange={(e) => setSiteSettings((p) => ({ ...p, auctionSubmissionEmail: e.target.value }))} className="input-clean w-full" />
                </div>
              </div>
              <button
                type="button"
                className="btn-arch btn-cta-bright mt-1"
                onClick={() =>
                  handleSaveSiteSettings({
                    archiveSubmissionEmail: siteSettings.archiveSubmissionEmail,
                    calendarSubmissionEmail: siteSettings.calendarSubmissionEmail,
                    auctionSubmissionEmail: siteSettings.auctionSubmissionEmail,
                  })
                }
              >
                Save Mailbox Routing
              </button>
            </section>
          </div>
        )}

        {/* ==================== 03. MEDIA & MODERATION CRUD ==================== */}
        {activeTab === 'media' && (
          <div className="flex flex-col gap-5 anim-in">
            <div className="admin-tab-strip">
              <button type="button" className={`admin-tab-btn ${mediaSub === 'flac' ? 'active' : ''}`} onClick={() => setMediaSub('flac')}>24-Bit FLAC Audio ({audioTracks.length})</button>
              <button type="button" className={`admin-tab-btn ${mediaSub === 'videos' ? 'active' : ''}`} onClick={() => setMediaSub('videos')}>Videos &amp; Chapters ({videos.length})</button>
              <button type="button" className={`admin-tab-btn ${mediaSub === 'photos' ? 'active' : ''}`} onClick={() => setMediaSub('photos')}>35mm Photo Plates ({photos.length})</button>
              <button type="button" className={`admin-tab-btn ${mediaSub === 'artists' ? 'active' : ''}`} onClick={() => setMediaSub('artists')}>Bands &amp; Artists ({artists.length})</button>
              <button type="button" className={`admin-tab-btn ${mediaSub === 'comments' ? 'active' : ''}`} onClick={() => setMediaSub('comments')}>Scene Notes &amp; Chat ({totalCommentsCount + sceneChat.length})</button>
            </div>

            {(mediaSub === 'flac' || mediaSub === 'videos') && (
              <VideosFlacPanel mode={mediaSub} videos={videos} setVideos={setVideos} audioTracks={audioTracks} setAudioTracks={setAudioTracks} postAdminAction={postAdminAction} syncAuditLogs={syncAuditLogs} showToast={showToast} />
            )}

            {(mediaSub === 'photos' || mediaSub === 'artists' || mediaSub === 'comments') && (
              <PhotosArtistsPanel mode={mediaSub} photos={photos} setPhotos={setPhotos} artists={artists} setArtists={setArtists} commentsByItem={commentsByItem} setCommentsByItem={setCommentsByItem} sceneChat={sceneChat} setSceneChat={setSceneChat} postAdminAction={postAdminAction} syncAuditLogs={syncAuditLogs} showToast={showToast} />
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <TimelineRememberedPanel timeline={timeline} setTimeline={setTimeline} remembered={remembered} setRemembered={setRemembered} postAdminAction={postAdminAction} syncAuditLogs={syncAuditLogs} showToast={showToast} />
        )}

        {(activeTab === 'calendar' || activeTab === 'auctions') && (
          <CalendarAuctionsPanel mode={activeTab} calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents} auctions={auctions} setAuctions={setAuctions} postAdminAction={postAdminAction} syncAuditLogs={syncAuditLogs} showToast={showToast} />
        )}

        {(activeTab === 'csv' || activeTab === 'ledger') && (
          <SubscribersSecurityPanel mode={activeTab} storageDriver={initialData.storageDriver} runtimePosture={initialData.runtimePosture} subscribers={subscribers} setSubscribers={setSubscribers} futureTasks={futureTasks} setFutureTasks={setFutureTasks} auditLogs={auditLogs} setAuditLogs={setAuditLogs} postAdminAction={postAdminAction} syncAuditLogs={syncAuditLogs} showToast={showToast} onLocked={onLocked} />
        )}
      </main>

      {toastMsg && (
        <div role="status" className="fixed bottom-5 right-5 z-50 glass-panel px-4 py-2.5 font-mono text-xs font-semibold text-[var(--ink)] shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
