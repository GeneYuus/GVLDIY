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
  Copy,
  Database,
  Download,
  Gavel,
  LayoutGrid,
  Lock,
  Music,
  Palette,
  Plus,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import {
  AdminSiteSettings,
  ArchiveDataset,
  CommentNode,
  FlacRecording,
  FlyerPresetStyle,
  FutureTaskLedgerItem,
  InstagramAuctionItem,
  MediaSourceType,
  PhotoPlate,
  PuckPageRecord,
  RuntimePostureSnapshot,
  SceneArtist,
  SeasonTheme,
  ShowCalendarEvent,
  SubscriberCsvRow,
  TaskPriority,
  TaskStatus,
  VideoTape,
} from '@/types/archive';
import {
  extractGoogleDriveFileId,
  extractImageDimensionsClient,
  extractWaveformPeaksFromAudioFile,
} from '@/lib/media/resolveMediaUrl';
import {
  adminFetch,
  downloadAuthenticatedFile,
  setAdminMemoryToken,
} from '@/lib/dal/adminClientSession';

interface AdminManagerClientProps {
  initialData: ArchiveDataset & {
    storageDriver: 'hostinger-mysql' | 'preview-memory';
    runtimePosture?: RuntimePostureSnapshot;
  };
  onLocked?: () => void;
}

type ManagerTab =
  | 'puck'
  | 'theme'
  | 'media'
  | 'calendar'
  | 'auctions'
  | 'csv'
  | 'ledger';

type MediaSubSection = 'videos' | 'flac' | 'photos' | 'artists' | 'comments';

interface AltTakeDraft {
  label: string;
  sourceType: MediaSourceType;
  sourceIdOrUrl: string;
  bitDepth: 16 | 24;
  sampleRateHz: 44100 | 48000 | 96000;
}

export default function AdminManagerClient({
  initialData,
  onLocked,
}: AdminManagerClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ManagerTab>('puck');
  const [mediaSub, setMediaSub] = useState<MediaSubSection>('flac');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Managed datasets
  const [siteSettings, setSiteSettings] = useState<AdminSiteSettings>(
    initialData.siteSettings
  );
  const [puckPages, setPuckPages] = useState<PuckPageRecord[]>(
    initialData.puckPages || []
  );
  const [videos, setVideos] = useState<VideoTape[]>(initialData.videos);
  const [audioTracks, setAudioTracks] = useState<FlacRecording[]>(
    initialData.audio
  );
  const [photos, setPhotos] = useState<PhotoPlate[]>(initialData.photos);
  const [artists, setArtists] = useState<SceneArtist[]>(initialData.artists);
  const [calendarEvents, setCalendarEvents] = useState<ShowCalendarEvent[]>(
    initialData.calendar
  );
  const [auctions, setAuctions] = useState<InstagramAuctionItem[]>(
    initialData.auctions
  );
  const [commentsByItem, setCommentsByItem] = useState<
    Record<string, CommentNode[]>
  >(initialData.commentsByItem);
  const [subscribers, setSubscribers] = useState<SubscriberCsvRow[]>(
    initialData.subscribers
  );
  const [futureTasks, setFutureTasks] = useState<FutureTaskLedgerItem[]>(
    initialData.futureTasks
  );

  // Puck Visual Studio Create Page Form State
  const [newZineTitle, setNewZineTitle] = useState('');
  const [newZineSlug, setNewZineSlug] = useState('');

  // Video Form State
  const [vidTitle, setVidTitle] = useState('');
  const [vidVenue, setVidVenue] = useState('The Barn');
  const [vidFilmer, setVidFilmer] = useState('');
  const [vidDate, setVidDate] = useState('2026-11-20');
  const [vidYtInput, setVidYtInput] = useState('');
  const [vidPosterType, setVidPosterType] =
    useState<MediaSourceType>('embedded');
  const [vidPosterUrl, setVidPosterUrl] = useState('');
  const [vidTimestampsText, setVidTimestampsText] = useState(
    '00:00 Soundcheck & Load-In\n03:45 Opening Song'
  );
  const [vidTagsText, setVidTagsText] = useState('the-barn punk-rock greenville');

  // FLAC Form State + Browser Web Audio Peak Analyzer
  const [flacTitle, setFlacTitle] = useState('');
  const [flacArtist, setFlacArtist] = useState('');
  const [flacVenue, setFlacVenue] = useState('The Barn');
  const [flacSourceType, setFlacSourceType] =
    useState<MediaSourceType>('gdrive');
  const [flacSourceIdOrUrl, setFlacSourceIdOrUrl] = useState('');
  const [flacBitDepth, setFlacBitDepth] = useState<16 | 24>(24);
  const [flacSampleRate, setFlacSampleRate] = useState<44100 | 48000 | 96000>(
    48000
  );
  const [flacDurationSec, setFlacDurationSec] = useState(195);
  const [flacRootHz, setFlacRootHz] = useState(196);
  const [flacLufs, setFlacLufs] = useState<number>(-14.0);
  const [flacPrimaryLabel, setFlacPrimaryLabel] = useState('Primary Mix');
  const [flacAltTakes, setFlacAltTakes] = useState<AltTakeDraft[]>([]);
  const [flacPeaks, setFlacPeaks] = useState<number[] | null>(null);
  const [flacAnalyzing, setFlacAnalyzing] = useState(false);
  const [flacTagsText, setFlacTagsText] = useState('the-barn greenville flac');

  // Photo Form State
  const [phoTitle, setPhoTitle] = useState('');
  const [phoPhotographer, setPhoPhotographer] = useState('');
  const [phoVenue, setPhoVenue] = useState('Poe Mill DIY');
  const [phoYear, setPhoYear] = useState('2026');
  const [phoSourceType, setPhoSourceType] =
    useState<MediaSourceType>('gdrive');
  const [phoSourceUrl, setPhoSourceUrl] = useState('');
  const [phoDimensions, setPhoDimensions] = useState('');
  const [phoTagsText, setPhoTagsText] = useState('poe-mill 35mm greenville');

  // Artist Form State
  const [artName, setArtName] = useState('');
  const [artRole, setArtRole] = useState<SceneArtist['role']>('Band');
  const [artGenre, setArtGenre] = useState('');
  const [artArea, setArtArea] = useState('Greenville, SC');
  const [artActive, setArtActive] = useState(true);
  const [artTagsText, setArtTagsText] = useState('band punk-rock greenville');

  // Calendar Show Form State
  const [calMonth, setCalMonth] = useState<'2026-11' | '2026-12'>('2026-11');
  const [calDay, setCalDay] = useState(25);
  const [calVenue, setCalVenue] = useState('');
  const [calDoors, setCalDoors] = useState('8:00 PM · $8 PWYC');
  const [calStyle, setCalStyle] = useState<FlyerPresetStyle>('punk-xerox');
  const [calTitle, setCalTitle] = useState('');
  const [calNote, setCalNote] = useState('');

  // Auction Form State
  const [aucTitle, setAucTitle] = useState('');
  const [aucArtist, setAucArtist] = useState('');
  const [aucBid, setAucBid] = useState('$40');
  const [aucPickup, setAucPickup] = useState('Greenville Local Pickup');
  const [aucSourceType, setAucSourceType] =
    useState<MediaSourceType>('embedded');
  const [aucSourceUrl, setAucSourceUrl] = useState('');
  const [aucIgLink, setAucIgLink] = useState('https://www.instagram.com/');

  // Next-Iteration & Cutover Ledger Form State
  const [taskPhase, setTaskPhase] =
    useState<FutureTaskLedgerItem['passPhase']>('Pass 6');
  const [taskArea, setTaskArea] =
    useState<FutureTaskLedgerItem['area']>('UI & Media');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('P1');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskRationale, setTaskRationale] = useState('');
  const [taskPrereq, setTaskPrereq] = useState('');

  const showToast = (msg: string) => setToastMsg(msg);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2600);
    return () => clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-season',
      siteSettings.seasonTheme
    );
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

  const postAdminAction = async (payload: Record<string, unknown>) => {
    const res = await adminFetch('/api/admin/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      setAdminMemoryToken(null);
      if (onLocked) {
        onLocked();
      } else {
        router.push('/admin/login');
      }
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

  // Theme & Site Config Save
  const handleSaveSiteSettings = async (
    patch: Partial<Omit<AdminSiteSettings, 'updatedAtIso'>>,
    label?: string
  ) => {
    try {
      const data = await postAdminAction({
        action: 'update-site-settings',
        ...patch,
      });
      if (data.ok && data.siteSettings) {
        setSiteSettings(data.siteSettings);
        showToast(label || 'Saved site configuration');
      }
    } catch {
      showToast('Could not save settings');
    }
  };

  // Puck Visual Studio API Actions
  const handleCreatePuckPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZineTitle.trim() || !newZineSlug.trim()) return;
    try {
      const res = await adminFetch('/api/admin/puck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          title: newZineTitle.trim(),
          slug: newZineSlug.trim(),
        }),
      });
      if (res.status === 401) {
        setAdminMemoryToken(null);
        if (onLocked) {
          onLocked();
        } else {
          router.push('/admin/login');
        }
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(data.error || 'Could not create zine page');
        return;
      }
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

  // Client-Side Web Audio 72-Bar Peak + Integrated LUFS Analyzer
  const handleAnalyzeLocalAudio = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFlacAnalyzing(true);
    try {
      const result = await extractWaveformPeaksFromAudioFile(file, 72);
      setFlacPeaks(result.peaks);
      setFlacDurationSec(result.durationSec);
      setFlacSampleRate(result.sampleRateHz);
      setFlacLufs(result.loudnessLufs);
      if (!flacTitle) {
        setFlacTitle(file.name.replace(/\.[^.]+$/, ''));
      }
      showToast(
        `Decoded 72 bars (${result.durationSec}s · ${result.sampleRateHz} Hz · ${result.loudnessLufs} LUFS)`
      );
    } catch {
      showToast('Browser could not decode audio file');
    } finally {
      setFlacAnalyzing(false);
    }
  };

  // Client-Side Image Dimensions Inspector
  const handleInspectLocalPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const info = await extractImageDimensionsClient(file);
      setPhoDimensions(info.dimensionsLabel);
      if (!phoTitle) {
        setPhoTitle(file.name.replace(/\.[^.]+$/, ''));
      }
      showToast(`Inspected scan (${info.dimensionsLabel})`);
    } catch {
      showToast('Could not inspect image scan');
    }
  };

  // CRUD Handlers
  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vidTitle.trim() || !vidYtInput.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'add-video',
        title: vidTitle,
        venue: vidVenue,
        filmer: vidFilmer,
        recordedDate: vidDate,
        youtubeIdOrUrl: vidYtInput,
        posterSourceType: vidPosterType,
        posterSourceIdOrUrl: vidPosterUrl,
        timestampsText: vidTimestampsText,
        tagsText: vidTagsText,
      });
      if (data.ok && data.video) {
        setVideos((prev) => [data.video, ...prev]);
        setVidTitle('');
        setVidYtInput('');
        showToast('Published video tape');
      }
    } catch {
      showToast('Failed to add video');
    }
  };

  const handleDeleteVideo = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-video', id });
    if (data.ok) {
      setVideos((prev) => prev.filter((v) => v.id !== id));
      showToast('Removed video tape');
    }
  };

  const handleAddFlac = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flacTitle.trim() || !flacArtist.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'add-flac',
        title: flacTitle,
        artist: flacArtist,
        venue: flacVenue,
        durationSec: flacDurationSec,
        bitDepth: flacBitDepth,
        sampleRateHz: flacSampleRate,
        sourceType: flacSourceType,
        sourceIdOrUrl: flacSourceIdOrUrl || 'smp-preview',
        primaryTakeLabel: flacPrimaryLabel,
        altTakes: flacAltTakes.filter((t) => t.label.trim()),
        loudnessLufs: flacLufs,
        previewRootHz: flacRootHz,
        waveformPeaks: flacPeaks || undefined,
        tagsText: flacTagsText,
      });
      if (data.ok && data.track) {
        setAudioTracks((prev) => [data.track, ...prev]);
        setFlacTitle('');
        setFlacArtist('');
        setFlacSourceIdOrUrl('');
        setFlacAltTakes([]);
        setFlacPeaks(null);
        showToast('Published lossless FLAC track');
      }
    } catch {
      showToast('Failed to add FLAC track');
    }
  };

  const handleDeleteFlac = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-flac', id });
    if (data.ok) {
      setAudioTracks((prev) => prev.filter((a) => a.id !== id));
      showToast('Removed FLAC track');
    }
  };

  const handleAddPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoTitle.trim() || !phoPhotographer.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'add-photo',
        title: phoTitle,
        photographer: phoPhotographer,
        venue: phoVenue,
        year: phoYear,
        sourceType: phoSourceType,
        sourceIdOrUrl: phoSourceUrl,
        dimensionsLabel: phoDimensions || undefined,
        tagsText: phoTagsText,
      });
      if (data.ok && data.photo) {
        setPhotos((prev) => [data.photo, ...prev]);
        setPhoTitle('');
        setPhoSourceUrl('');
        setPhoDimensions('');
        showToast('Added 35mm photo plate');
      }
    } catch {
      showToast('Failed to add photo');
    }
  };

  const handleDeletePhoto = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-photo', id });
    if (data.ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      showToast('Removed photo plate');
    }
  };

  const handleAddArtist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artName.trim() || !artGenre.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'add-artist',
        name: artName,
        role: artRole,
        genre: artGenre,
        area: artArea,
        active: artActive,
        tagsText: artTagsText,
      });
      if (data.ok && data.artist) {
        setArtists((prev) => [data.artist, ...prev]);
        setArtName('');
        setArtGenre('');
        showToast('Added scene artist');
      }
    } catch {
      showToast('Failed to add artist');
    }
  };

  const handleToggleArtist = async (id: string) => {
    const data = await postAdminAction({ action: 'toggle-artist-active', id });
    if (data.ok && data.artist) {
      setArtists((prev) => prev.map((a) => (a.id === id ? data.artist : a)));
      showToast(`${data.artist.name} -> ${data.artist.active ? 'ACTIVE' : 'INACTIVE'}`);
    }
  };

  const handleDeleteArtist = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-artist', id });
    if (data.ok) {
      setArtists((prev) => prev.filter((a) => a.id !== id));
      showToast('Removed artist');
    }
  };

  const handleDeleteComment = async (targetItemId: string, commentId: string) => {
    const data = await postAdminAction({
      action: 'delete-comment',
      targetItemId,
      commentId,
    });
    if (data.ok) {
      setCommentsByItem((prev) => ({
        ...prev,
        [targetItemId]: (prev[targetItemId] || []).filter(
          (c) => c.id !== commentId
        ),
      }));
      showToast('Deleted comment');
    }
  };

  const handlePublishShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calTitle.trim() || !calVenue.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'publish-show',
        monthKey: calMonth,
        dayOfMonth: calDay,
        venue: calVenue,
        doorsInfo: calDoors,
        flyerStyle: calStyle,
        title: calTitle,
        flyerHeadlineNote: calNote,
      });
      if (data.ok && data.show) {
        setCalendarEvents((prev) => [...prev, data.show]);
        setCalTitle('');
        setCalVenue('');
        setCalNote('');
        showToast('Published show & flyer to Calendar');
      }
    } catch {
      showToast('Failed to publish show');
    }
  };

  const handleDeleteShow = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-show', id });
    if (data.ok) {
      setCalendarEvents((prev) => prev.filter((c) => c.id !== id));
      showToast('Removed calendar show');
    }
  };

  const handleAddAuction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aucTitle.trim() || !aucArtist.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'add-auction',
        title: aucTitle,
        ownerUsername: aucArtist,
        openingBid: aucBid,
        pickupArea: aucPickup,
        sourceType: aucSourceType,
        sourceIdOrUrl: aucSourceUrl,
        igPermalink: aucIgLink,
      });
      if (data.ok && data.auction) {
        setAuctions((prev) => [data.auction, ...prev]);
        setAucTitle('');
        setAucArtist('');
        setAucSourceUrl('');
        showToast('Published Barter Market auction');
      }
    } catch {
      showToast('Failed to publish auction');
    }
  };

  const handleToggleAuctionSold = async (item: InstagramAuctionItem) => {
    const data = await postAdminAction({
      action: 'toggle-auction-sold',
      auctionId: item.id,
      sold: !item.sold,
    });
    if (data.ok && data.auction) {
      setAuctions((prev) =>
        prev.map((a) => (a.id === item.id ? data.auction : a))
      );
      showToast(`Auction marked ${data.auction.sold ? 'SOLD' : 'LIVE'}`);
    }
  };

  const handleSimulateIgWebhook = async (auction: InstagramAuctionItem) => {
    try {
      const res = await fetch('/api/webhooks/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object: 'instagram',
          entry: [
            {
              id: 'ig-business-account',
              time: Date.now(),
              changes: [
                {
                  field: 'comments',
                  value: {
                    id: `cmt-${Date.now()}`,
                    text: 'SOLD to highest comment bid!',
                    from: { username: auction.ownerUsername.replace(/^@/, '') },
                    media: { id: auction.igMediaId || '' },
                  },
                },
              ],
            },
          ],
        }),
      });
      const data = await res.json();
      if (
        data.ok &&
        Array.isArray(data.updatedItems) &&
        data.updatedItems.length > 0
      ) {
        const updated = data.updatedItems[0];
        setAuctions((prev) =>
          prev.map((a) => (a.id === updated.id ? updated : a))
        );
        showToast(`Verified @${auction.ownerUsername} IG comment "SOLD"`);
      }
    } catch {
      showToast('Webhook simulation error');
    }
  };

  const handleDeleteAuction = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-auction', id });
    if (data.ok) {
      setAuctions((prev) => prev.filter((a) => a.id !== id));
      showToast('Removed auction item');
    }
  };

  const handleRemoveSubscriber = async (id: string) => {
    const data = await postAdminAction({ action: 'remove-subscriber', id });
    if (data.ok && Array.isArray(data.subscribers)) {
      setSubscribers(data.subscribers);
      showToast('Removed subscriber entry');
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
      setFutureTasks((prev) => [data.task, ...prev]);
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
      setFutureTasks((prev) => prev.map((t) => (t.id === id ? data.task : t)));
      showToast(`${id} -> ${status}`);
    }
  };

  const handleDeleteTask = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-future-task', id });
    if (data.ok) {
      setFutureTasks((prev) => prev.filter((t) => t.id !== id));
      showToast('Removed task');
    }
  };

  const allFlattenedComments = Object.entries(commentsByItem).flatMap(
    ([itemId, list]) => list.map((c) => ({ ...c, targetItemId: itemId }))
  );

  const parsedFlacDriveId =
    flacSourceType === 'gdrive' && flacSourceIdOrUrl
      ? extractGoogleDriveFileId(flacSourceIdOrUrl)
      : '';

  const parsedPhotoDriveId =
    phoSourceType === 'gdrive' && phoSourceUrl
      ? extractGoogleDriveFileId(phoSourceUrl)
      : '';

  return (
    <div className="min-h-screen pb-24">
      {/* Admin Top Specular Frosted Masthead */}
      <header className="masthead">
        <div className="brand-wrap">
          <CheckCircle2 className="w-4 h-4 text-[var(--green-sold)] shrink-0" />
          <h1 className="brand-title whitespace-nowrap">
            Greenville DIY · Admin
          </h1>
          <span className="font-mono text-[11px] text-[var(--ink-mono)] hidden sm:inline-flex items-center gap-1.5 tabular-nums">
            <span>·</span>
            <Database className="w-3 h-3" />
            <span>
              {initialData.storageDriver === 'hostinger-mysql'
                ? 'Hostinger MySQL · 127.0.0.1'
                : `Port ${initialData.runtimePosture?.activePort || '3000'} · Demo Memory`}
            </span>
          </span>
        </div>

        <div className="top-bar-actions">
          <Link href="/" className="typo-action">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Archive</span>
          </Link>
          <span className="text-[var(--mute)] font-mono text-xs" aria-hidden="true">
            ·
          </span>
          <button type="button" onClick={handleLogout} className="typo-action">
            <Lock className="w-3.5 h-3.5" />
            <span>Lock Session</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-9 pt-7">
        {/* 7-Tab Hairlined Brutalist Typographic Admin Switcher */}
        <nav aria-label="Manager Sections" className="admin-tab-strip mb-7">
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'puck' ? 'active' : ''}`}
            onClick={() => setActiveTab('puck')}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>01. Visual Studio ({puckPages.length})</span>
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'theme' ? 'active' : ''}`}
            onClick={() => setActiveTab('theme')}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>02. Theme &amp; Config</span>
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'media' ? 'active' : ''}`}
            onClick={() => setActiveTab('media')}
          >
            <Music className="w-3.5 h-3.5" />
            <span>03. Media CRUD</span>
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
            onClick={() => setActiveTab('calendar')}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>04. Calendar ({calendarEvents.length})</span>
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'auctions' ? 'active' : ''}`}
            onClick={() => setActiveTab('auctions')}
          >
            <Gavel className="w-3.5 h-3.5" />
            <span>05. Auctions ({auctions.length})</span>
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'csv' ? 'active' : ''}`}
            onClick={() => setActiveTab('csv')}
          >
            <Users className="w-3.5 h-3.5" />
            <span>06. Subscribers ({subscribers.length})</span>
          </button>
          <button
            type="button"
            className={`admin-tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
            onClick={() => setActiveTab('ledger')}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>07. Cutover &amp; Next Pass ({futureTasks.length})</span>
          </button>
        </nav>

        {/* ==================== TAB 1: PUCK VISUAL STUDIO ==================== */}
        {activeTab === 'puck' && (
          <div className="flex flex-col gap-5 anim-in">
            <section className="glass-panel p-5 sm:p-6 flex flex-col gap-4">
              <div>
                <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent)] m-0 mb-1">
                  Inline Archive Drop-Slots (Videos · Remembered · Auctions)
                </h2>
                <p className="text-xs text-[var(--mute)] m-0">
                  Drag custom banners, 2-column layouts, mixed-media flyers, or
                  sandboxed HTML zines above archive tabs. Empty slots stay
                  invisible to visitors.
                </p>
              </div>

              <div className="brutal-grid">
                {puckPages
                  .filter((p) => p.isSlot)
                  .map((slot) => {
                    const count = slot.puckData?.content?.length || 0;
                    return (
                      <div
                        key={slot.slug}
                        className="arch-plate p-4 justify-between gap-3"
                      >
                        <div>
                          <div className="font-mono text-[11px] text-[var(--accent)] font-semibold">
                            {slot.slug}
                          </div>
                          <div className="text-sm font-bold mt-0.5">
                            {slot.title}
                          </div>
                          <div className="font-mono text-xs text-[var(--ink-mono)] mt-1 tabular-nums">
                            {count} {count === 1 ? 'block' : 'blocks'} active
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--grid-hairline)]">
                          <Link
                            href={`/admin/editor/${encodeURIComponent(slot.slug)}`}
                            className="typo-action typo-action-accent"
                          >
                            <span>Open in Puck</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                          {count > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteOrClearPuck(slot.slug, true)
                              }
                              className="typo-action typo-action-danger"
                              title="Clear blocks in slot"
                            >
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

              <form
                onSubmit={handleCreatePuckPage}
                className="grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5"
              >
                <div className="field-group sm:col-span-5">
                  <label htmlFor="puck-zine-title" className="field-label">
                    Zine Page Title
                  </label>
                  <input
                    id="puck-zine-title"
                    type="text"
                    required
                    value={newZineTitle}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewZineTitle(val);
                      if (!newZineSlug) {
                        setNewZineSlug(
                          val
                            .toLowerCase()
                            .replace(/[^a-z0-9-]+/g, '-')
                            .replace(/(^-|-$)/g, '')
                        );
                      }
                    }}
                    placeholder="e.g. Barn Winter Zine"
                    className="input-clean"
                  />
                </div>
                <div className="field-group sm:col-span-4">
                  <label htmlFor="puck-zine-slug" className="field-label">
                    URL Slug (/p/...)
                  </label>
                  <input
                    id="puck-zine-slug"
                    type="text"
                    required
                    value={newZineSlug}
                    onChange={(e) =>
                      setNewZineSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]+/g, '-')
                          .replace(/(^-|-$)/g, '')
                      )
                    }
                    placeholder="e.g. barn-winter-zine"
                    className="input-clean font-mono"
                  />
                </div>
                <div className="sm:col-span-3 flex">
                  <button
                    type="submit"
                    className="btn-arch btn-cta-bright w-full py-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Zine Page</span>
                  </button>
                </div>
              </form>

              <div className="table-wrap">
                <table className="clean-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Public Route</th>
                      <th>Blocks</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {puckPages
                      .filter((p) => !p.isSlot)
                      .map((p) => (
                        <tr key={p.slug}>
                          <td>
                            <strong>{p.title}</strong>
                          </td>
                          <td className="font-mono text-xs text-[var(--accent)]">
                            /p/{p.slug}
                          </td>
                          <td className="font-mono text-xs tabular-nums">
                            {p.puckData?.content?.length || 0}
                          </td>
                          <td>
                            <div className="inline-flex flex-wrap items-center gap-3">
                              <Link
                                href={`/admin/editor/${encodeURIComponent(p.slug)}`}
                                className="typo-action typo-action-accent"
                              >
                                <span>Edit in Puck</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </Link>
                              <span
                                className="text-[var(--mute)]"
                                aria-hidden="true"
                              >
                                ·
                              </span>
                              <Link
                                href={`/p/${p.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="typo-action"
                              >
                                <span>View</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </Link>
                              <span
                                className="text-[var(--mute)]"
                                aria-hidden="true"
                              >
                                ·
                              </span>
                              <button
                                type="button"
                                className="typo-action"
                                onClick={() => {
                                  const url = `${window.location.origin}/p/${p.slug}`;
                                  navigator.clipboard?.writeText(url);
                                  showToast(`Copied /p/${p.slug}`);
                                }}
                              >
                                <Copy className="w-3 h-3" />
                                <span>Copy URL</span>
                              </button>
                              <span
                                className="text-[var(--mute)]"
                                aria-hidden="true"
                              >
                                ·
                              </span>
                              <button
                                type="button"
                                className="typo-action typo-action-danger"
                                onClick={() =>
                                  handleDeleteOrClearPuck(p.slug, false)
                                }
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
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

        {/* ==================== TAB 2: THEME & SITE CONFIG ==================== */}
        {activeTab === 'theme' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 anim-in">
            <section className="glass-panel p-6 flex flex-col justify-between gap-5">
              <div>
                <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--accent)] mb-1.5">
                  Global Seasonal Silhouette &amp; Ambient Palette
                </h2>
                <p className="text-xs text-[var(--mute)] mb-4">
                  Controls the seasonal ambient color pools and monochrome emblem
                  for all public visitors.
                </p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-6 pb-5 border-b border-[var(--glass-border)]">
                  {(
                    [
                      { id: 'fall', label: 'Fall · Sienna' },
                      { id: 'spring', label: 'Spring · Sage' },
                      { id: 'summer', label: 'Summer · Sun' },
                      { id: 'winter', label: 'Winter · Ice' },
                    ] as { id: SeasonTheme; label: string }[]
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={siteSettings.seasonTheme === s.id}
                      className={`typo-action ${
                        siteSettings.seasonTheme === s.id ? 'active' : ''
                      }`}
                      onClick={() =>
                        handleSaveSiteSettings(
                          { seasonTheme: s.id },
                          `Season switched to ${s.id.toUpperCase()}`
                        )
                      }
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
                    className={`typo-action ${
                      siteSettings.defaultContrast === 'light' ? 'active' : ''
                    }`}
                    onClick={() =>
                      handleSaveSiteSettings(
                        { defaultContrast: 'light' },
                        'Default contrast: Light Specular Glass'
                      )
                    }
                  >
                    Light Specular Glass
                  </button>
                  <span className="text-[var(--mute)] font-mono text-xs">
                    /
                  </span>
                  <button
                    type="button"
                    aria-pressed={siteSettings.defaultContrast === 'dark'}
                    className={`typo-action ${
                      siteSettings.defaultContrast === 'dark' ? 'active' : ''
                    }`}
                    onClick={() =>
                      handleSaveSiteSettings(
                        { defaultContrast: 'dark' },
                        'Default contrast: Dark Obsidian Glass'
                      )
                    }
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
                  <label htmlFor="cfg-archive-email" className="field-label">
                    FLAC &amp; Scan Submissions Email
                  </label>
                  <input
                    id="cfg-archive-email"
                    type="email"
                    value={siteSettings.archiveSubmissionEmail}
                    onChange={(e) =>
                      setSiteSettings((p) => ({
                        ...p,
                        archiveSubmissionEmail: e.target.value,
                      }))
                    }
                    className="input-clean w-full"
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="cfg-calendar-email" className="field-label">
                    Calendar Flyer Submissions Email
                  </label>
                  <input
                    id="cfg-calendar-email"
                    type="email"
                    value={siteSettings.calendarSubmissionEmail}
                    onChange={(e) =>
                      setSiteSettings((p) => ({
                        ...p,
                        calendarSubmissionEmail: e.target.value,
                      }))
                    }
                    className="input-clean w-full"
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="cfg-auction-email" className="field-label">
                    Barter Market Auctions Email
                  </label>
                  <input
                    id="cfg-auction-email"
                    type="email"
                    value={siteSettings.auctionSubmissionEmail}
                    onChange={(e) =>
                      setSiteSettings((p) => ({
                        ...p,
                        auctionSubmissionEmail: e.target.value,
                      }))
                    }
                    className="input-clean w-full"
                  />
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

        {/* ==================== TAB 3: MEDIA & ARCHIVE CRUD ==================== */}
        {activeTab === 'media' && (
          <div className="flex flex-col gap-5 anim-in">
            <div className="admin-tab-strip">
              <button
                type="button"
                className={`admin-tab-btn ${mediaSub === 'flac' ? 'active' : ''}`}
                onClick={() => setMediaSub('flac')}
              >
                24-Bit FLAC Audio ({audioTracks.length})
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${mediaSub === 'videos' ? 'active' : ''}`}
                onClick={() => setMediaSub('videos')}
              >
                Videos &amp; Chapters ({videos.length})
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${mediaSub === 'photos' ? 'active' : ''}`}
                onClick={() => setMediaSub('photos')}
              >
                35mm Photo Plates ({photos.length})
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${mediaSub === 'artists' ? 'active' : ''}`}
                onClick={() => setMediaSub('artists')}
              >
                Bands &amp; Artists ({artists.length})
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${mediaSub === 'comments' ? 'active' : ''}`}
                onClick={() => setMediaSub('comments')}
              >
                Scene Notes ({allFlattenedComments.length})
              </button>
            </div>

            {/* SUB-TAB: 24-BIT FLAC AUDIO + BROWSER PEAK EXTRACTOR */}
            {mediaSub === 'flac' && (
              <div className="flex flex-col gap-4">
                <form
                  onSubmit={handleAddFlac}
                  className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5"
                >
                  <div className="sm:col-span-12 flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--glass-border)]">
                    <span className="font-mono text-xs font-bold text-[var(--accent)]">
                      Add Off-Hostinger 24-Bit FLAC Recording (Drive v3 / R2 / Samply)
                    </span>
                    <label className="typo-action typo-action-accent cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {flacAnalyzing
                          ? 'Decoding 72-Bar RMS...'
                          : 'Analyze Local Audio File (72-Bar RMS & LUFS)'}
                      </span>
                      <input
                        type="file"
                        accept="audio/*,.flac,.wav"
                        onChange={handleAnalyzeLocalAudio}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="field-group sm:col-span-4">
                    <label htmlFor="flac-title" className="field-label">
                      Track Title
                    </label>
                    <input
                      id="flac-title"
                      type="text"
                      required
                      value={flacTitle}
                      onChange={(e) => setFlacTitle(e.target.value)}
                      placeholder='e.g. "Poinsett Static"'
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-4">
                    <label htmlFor="flac-artist" className="field-label">
                      Band or Artist
                    </label>
                    <input
                      id="flac-artist"
                      type="text"
                      required
                      value={flacArtist}
                      onChange={(e) => setFlacArtist(e.target.value)}
                      placeholder="e.g. Rocco and His Bones"
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-4">
                    <label htmlFor="flac-venue" className="field-label">
                      Venue
                    </label>
                    <input
                      id="flac-venue"
                      type="text"
                      required
                      value={flacVenue}
                      onChange={(e) => setFlacVenue(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-4">
                    <label htmlFor="flac-provider" className="field-label">
                      Stream Provider
                    </label>
                    <select
                      id="flac-provider"
                      value={flacSourceType}
                      onChange={(e) =>
                        setFlacSourceType(e.target.value as MediaSourceType)
                      }
                      className="input-clean"
                    >
                      <option value="gdrive">
                        Google Drive Folder (API v3 Range Proxy)
                      </option>
                      <option value="r2">Cloudflare R2 CDN ($0 Egress)</option>
                      <option value="samply">Samply Lossless Player ID</option>
                    </select>
                  </div>

                  <div className="field-group sm:col-span-8">
                    <label htmlFor="flac-source" className="field-label">
                      Drive File ID, Share Link, or Stream URL
                    </label>
                    <input
                      id="flac-source"
                      type="text"
                      value={flacSourceIdOrUrl}
                      onChange={(e) => setFlacSourceIdOrUrl(e.target.value)}
                      placeholder={
                        flacSourceType === 'gdrive'
                          ? 'Google Drive share URL or fileId'
                          : flacSourceType === 'r2'
                          ? 'https://media.greenvillediyarchive.org/...'
                          : 'Samply Player ID or URL'
                      }
                      className="input-clean"
                    />
                  </div>

                  {parsedFlacDriveId && (
                    <div className="sm:col-span-12 font-mono text-xs text-[var(--ink-2)] px-3 py-1.5 rounded-[var(--r-xs)] bg-[var(--glass-pill)] border border-[var(--glass-border)]">
                      Resolved Stream Proxy:{' '}
                      <code>/api/media/drive/{parsedFlacDriveId}</code> (HTTP 206
                      Range + Immutable CDN Cache)
                    </div>
                  )}

                  <div className="field-group sm:col-span-3">
                    <label htmlFor="flac-bit-depth" className="field-label">
                      Bit Depth
                    </label>
                    <select
                      id="flac-bit-depth"
                      value={flacBitDepth}
                      onChange={(e) =>
                        setFlacBitDepth(Number(e.target.value) === 16 ? 16 : 24)
                      }
                      className="input-clean"
                    >
                      <option value={24}>24-Bit Lossless</option>
                      <option value={16}>16-Bit Redbook</option>
                    </select>
                  </div>

                  <div className="field-group sm:col-span-3">
                    <label htmlFor="flac-sample-rate" className="field-label">
                      Sample Rate
                    </label>
                    <select
                      id="flac-sample-rate"
                      value={flacSampleRate}
                      onChange={(e) =>
                        setFlacSampleRate(
                          Number(e.target.value) as 44100 | 48000 | 96000
                        )
                      }
                      className="input-clean"
                    >
                      <option value={48000}>48 kHz</option>
                      <option value={96000}>96 kHz</option>
                      <option value={44100}>44.1 kHz</option>
                    </select>
                  </div>

                  <div className="field-group sm:col-span-2">
                    <label htmlFor="flac-duration" className="field-label">
                      Duration (sec)
                    </label>
                    <input
                      id="flac-duration"
                      type="number"
                      min={5}
                      value={flacDurationSec}
                      onChange={(e) => setFlacDurationSec(Number(e.target.value))}
                      className="input-clean tabular-nums"
                    />
                  </div>

                  <div className="field-group sm:col-span-2">
                    <label htmlFor="flac-lufs" className="field-label">
                      Integrated LUFS
                    </label>
                    <input
                      id="flac-lufs"
                      type="number"
                      step="0.1"
                      min={-40}
                      max={0}
                      value={flacLufs}
                      onChange={(e) => setFlacLufs(Number(e.target.value))}
                      className="input-clean font-mono tabular-nums"
                    />
                  </div>

                  <div className="field-group sm:col-span-2">
                    <label htmlFor="flac-root-hz" className="field-label">
                      Preview Root (Hz)
                    </label>
                    <input
                      id="flac-root-hz"
                      type="number"
                      min={80}
                      max={880}
                      value={flacRootHz}
                      onChange={(e) => setFlacRootHz(Number(e.target.value))}
                      className="input-clean tabular-nums"
                    />
                  </div>

                  {/* Multi-Take A/B Mix Switcher Builder */}
                  <div className="sm:col-span-12 p-4 rounded-[var(--r-sm)] bg-[var(--glass-pill)] border border-[var(--glass-border)] flex flex-col gap-3">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="field-group flex-1 min-w-[200px] max-w-sm">
                        <label
                          htmlFor="flac-primary-label"
                          className="field-label"
                        >
                          Primary Mix Label (A/B Stack)
                        </label>
                        <input
                          id="flac-primary-label"
                          type="text"
                          value={flacPrimaryLabel}
                          onChange={(e) => setFlacPrimaryLabel(e.target.value)}
                          placeholder="e.g. Board + Room"
                          className="input-clean py-1.5 px-2.5 text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        className="typo-action typo-action-accent pb-1.5"
                        onClick={() =>
                          setFlacAltTakes((prev) => [
                            ...prev,
                            {
                              label:
                                prev.length === 0
                                  ? 'Room Mics'
                                  : `Alt Take ${prev.length + 1}`,
                              sourceType: 'gdrive',
                              sourceIdOrUrl: '',
                              bitDepth: flacBitDepth,
                              sampleRateHz: flacSampleRate,
                            },
                          ])
                        }
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Alternate Mix Take (A/B)</span>
                      </button>
                    </div>

                    {flacAltTakes.map((take, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-3 border-t border-[var(--glass-border)]"
                      >
                        <div className="field-group sm:col-span-3">
                          <label
                            htmlFor={`alt-take-label-${idx}`}
                            className="field-label"
                          >
                            Take Label
                          </label>
                          <input
                            id={`alt-take-label-${idx}`}
                            type="text"
                            value={take.label}
                            onChange={(e) =>
                              setFlacAltTakes((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? { ...item, label: e.target.value }
                                    : item
                                )
                              )
                            }
                            className="input-clean py-1.5 px-2.5 text-xs"
                          />
                        </div>
                        <div className="field-group sm:col-span-2">
                          <label
                            htmlFor={`alt-take-provider-${idx}`}
                            className="field-label"
                          >
                            Provider
                          </label>
                          <select
                            id={`alt-take-provider-${idx}`}
                            value={take.sourceType}
                            onChange={(e) =>
                              setFlacAltTakes((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        sourceType: e.target
                                          .value as MediaSourceType,
                                      }
                                    : item
                                )
                              )
                            }
                            className="input-clean py-1.5 px-2 text-xs"
                          >
                            <option value="gdrive">Drive v3</option>
                            <option value="r2">Cloudflare R2</option>
                            <option value="samply">PCM Preview</option>
                          </select>
                        </div>
                        <div className="field-group sm:col-span-5">
                          <label
                            htmlFor={`alt-take-src-${idx}`}
                            className="field-label"
                          >
                            Drive File ID or Stream URL
                          </label>
                          <input
                            id={`alt-take-src-${idx}`}
                            type="text"
                            value={take.sourceIdOrUrl}
                            onChange={(e) =>
                              setFlacAltTakes((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? { ...item, sourceIdOrUrl: e.target.value }
                                    : item
                                )
                              )
                            }
                            placeholder="Blank uses alt PCM preview"
                            className="input-clean py-1.5 px-2.5 text-xs"
                          />
                        </div>
                        <div className="field-group sm:col-span-1">
                          <label
                            htmlFor={`alt-take-bits-${idx}`}
                            className="field-label"
                          >
                            Bits
                          </label>
                          <select
                            id={`alt-take-bits-${idx}`}
                            value={take.bitDepth}
                            onChange={(e) =>
                              setFlacAltTakes((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        bitDepth:
                                          Number(e.target.value) === 16 ? 16 : 24,
                                      }
                                    : item
                                )
                              )
                            }
                            className="input-clean py-1.5 px-2 text-xs"
                          >
                            <option value={24}>24b</option>
                            <option value={16}>16b</option>
                          </select>
                        </div>
                        <div className="sm:col-span-1 flex justify-end pb-1">
                          <button
                            type="button"
                            onClick={() =>
                              setFlacAltTakes((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="typo-action typo-action-danger"
                            title="Remove alternate take"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="field-group sm:col-span-8">
                    <label htmlFor="flac-tags" className="field-label">
                      Archive Hashtags (space-separated)
                    </label>
                    <input
                      id="flac-tags"
                      type="text"
                      value={flacTagsText}
                      onChange={(e) => setFlacTagsText(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="sm:col-span-4 flex">
                    <button
                      type="submit"
                      className="btn-arch btn-cta-bright w-full py-2"
                    >
                      + Publish FLAC Track
                    </button>
                  </div>

                  {flacPeaks && (
                    <div className="sm:col-span-12 flex items-end gap-0.5 h-11 p-2 rounded-[var(--r-xs)] bg-[var(--glass-pill)] border border-[var(--glass-border)]">
                      {flacPeaks.map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-[1px] bg-[var(--accent)]"
                          style={{
                            height: `${Math.min(34, Math.round(h * 0.7))}px`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </form>

                <div className="table-wrap">
                  <table className="clean-table">
                    <thead>
                      <tr>
                        <th>Track</th>
                        <th>Venue / Spec / LUFS</th>
                        <th>Mixes &amp; Provider</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audioTracks.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <strong>{t.title}</strong>
                          </td>
                          <td className="font-mono text-xs text-[var(--mute)] tabular-nums">
                            {t.venue} · {t.specLabel}
                            {typeof t.loudnessLufs === 'number'
                              ? ` · ${t.loudnessLufs} LUFS`
                              : ''}
                          </td>
                          <td className="font-mono text-xs text-[var(--ink-2)]">
                            {t.sourceType.toUpperCase()}
                            {t.altVersions && t.altVersions.length > 1
                              ? ` · ${t.altVersions.length} Mixes`
                              : ''}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleDeleteFlac(t.id)}
                              className="typo-action typo-action-danger"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-TAB: VIDEOS + TIMESTAMPS */}
            {mediaSub === 'videos' && (
              <div className="flex flex-col gap-4">
                <form
                  onSubmit={handleAddVideo}
                  className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5"
                >
                  <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">
                    Publish Unlisted YouTube Tape &amp; Chapter Timestamps
                  </div>

                  <div className="field-group sm:col-span-8">
                    <label htmlFor="vid-title" className="field-label">
                      Tape Title
                    </label>
                    <input
                      id="vid-title"
                      type="text"
                      required
                      value={vidTitle}
                      onChange={(e) => setVidTitle(e.target.value)}
                      placeholder="e.g. Vernon Tape #05"
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-4">
                    <label htmlFor="vid-yt" className="field-label">
                      YouTube Unlisted URL or 11-Char ID
                    </label>
                    <input
                      id="vid-yt"
                      type="text"
                      required
                      value={vidYtInput}
                      onChange={(e) => setVidYtInput(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-4">
                    <label htmlFor="vid-venue" className="field-label">
                      Venue
                    </label>
                    <input
                      id="vid-venue"
                      type="text"
                      required
                      value={vidVenue}
                      onChange={(e) => setVidVenue(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-4">
                    <label htmlFor="vid-filmer" className="field-label">
                      Filmer Handle
                    </label>
                    <input
                      id="vid-filmer"
                      type="text"
                      required
                      value={vidFilmer}
                      onChange={(e) => setVidFilmer(e.target.value)}
                      placeholder="e.g. Vernon"
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-4">
                    <label htmlFor="vid-date" className="field-label">
                      Recorded Date
                    </label>
                    <input
                      id="vid-date"
                      type="date"
                      value={vidDate}
                      onChange={(e) => setVidDate(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-4">
                    <label htmlFor="vid-poster-type" className="field-label">
                      Poster Provider
                    </label>
                    <select
                      id="vid-poster-type"
                      value={vidPosterType}
                      onChange={(e) =>
                        setVidPosterType(e.target.value as MediaSourceType)
                      }
                      className="input-clean"
                    >
                      <option value="embedded">Default Poe Mill Poster</option>
                      <option value="gdrive">Google Drive Poster File ID</option>
                      <option value="r2">Cloudflare R2 Poster URL</option>
                    </select>
                  </div>

                  <div className="field-group sm:col-span-8">
                    <label htmlFor="vid-poster-url" className="field-label">
                      Poster File ID or URL (Optional)
                    </label>
                    <input
                      id="vid-poster-url"
                      type="text"
                      value={vidPosterUrl}
                      onChange={(e) => setVidPosterUrl(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-12">
                    <label htmlFor="vid-timestamps" className="field-label">
                      Chapter Timestamps (One MM:SS Label per Line)
                    </label>
                    <textarea
                      id="vid-timestamps"
                      rows={3}
                      value={vidTimestampsText}
                      onChange={(e) => setVidTimestampsText(e.target.value)}
                      className="auto-textarea font-mono"
                    />
                  </div>

                  <div className="field-group sm:col-span-8">
                    <label htmlFor="vid-tags" className="field-label">
                      Archive Hashtags (space-separated)
                    </label>
                    <input
                      id="vid-tags"
                      type="text"
                      value={vidTagsText}
                      onChange={(e) => setVidTagsText(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="sm:col-span-4 flex">
                    <button
                      type="submit"
                      className="btn-arch btn-cta-bright w-full py-2"
                    >
                      + Publish Video Tape
                    </button>
                  </div>
                </form>

                <div className="table-wrap">
                  <table className="clean-table">
                    <thead>
                      <tr>
                        <th>Tape Title</th>
                        <th>Venue / Filmer</th>
                        <th>Segments</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {videos.map((v) => (
                        <tr key={v.id}>
                          <td>
                            <strong>{v.title}</strong>
                          </td>
                          <td className="font-mono text-xs text-[var(--mute)]">
                            {v.venue} · {v.filmer}
                          </td>
                          <td className="font-mono text-xs tabular-nums">
                            {v.timestamps.length} clips
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleDeleteVideo(v.id)}
                              className="typo-action typo-action-danger"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-TAB: 35MM PHOTO PLATES */}
            {mediaSub === 'photos' && (
              <div className="flex flex-col gap-4">
                <form
                  onSubmit={handleAddPhoto}
                  className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5"
                >
                  <div className="sm:col-span-12 flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--glass-border)]">
                    <span className="font-mono text-xs font-bold text-[var(--accent)]">
                      Add 35mm Archival Photo Plate (Google Drive / R2)
                    </span>
                    <label className="typo-action typo-action-accent cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Inspect Local Scan Dimensions</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleInspectLocalPhoto}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="field-group sm:col-span-4">
                    <label htmlFor="pho-title" className="field-label">
                      Photo Title
                    </label>
                    <input
                      id="pho-title"
                      type="text"
                      required
                      value={phoTitle}
                      onChange={(e) => setPhoTitle(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-4">
                    <label htmlFor="pho-photographer" className="field-label">
                      Photographer
                    </label>
                    <input
                      id="pho-photographer"
                      type="text"
                      required
                      value={phoPhotographer}
                      onChange={(e) => setPhoPhotographer(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-3">
                    <label htmlFor="pho-venue" className="field-label">
                      Venue
                    </label>
                    <input
                      id="pho-venue"
                      type="text"
                      required
                      value={phoVenue}
                      onChange={(e) => setPhoVenue(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-1">
                    <label htmlFor="pho-year" className="field-label">
                      Year
                    </label>
                    <input
                      id="pho-year"
                      type="text"
                      required
                      value={phoYear}
                      onChange={(e) => setPhoYear(e.target.value)}
                      className="input-clean tabular-nums"
                    />
                  </div>

                  <div className="field-group sm:col-span-4">
                    <label htmlFor="pho-source-type" className="field-label">
                      Image Provider
                    </label>
                    <select
                      id="pho-source-type"
                      value={phoSourceType}
                      onChange={(e) =>
                        setPhoSourceType(e.target.value as MediaSourceType)
                      }
                      className="input-clean"
                    >
                      <option value="gdrive">Google Drive File ID / Link</option>
                      <option value="r2">Cloudflare R2 Public URL</option>
                      <option value="embedded">Preview Archival Plate</option>
                    </select>
                  </div>

                  <div className="field-group sm:col-span-8">
                    <label htmlFor="pho-source-url" className="field-label">
                      Drive File ID, Share Link, or Image URL
                    </label>
                    <input
                      id="pho-source-url"
                      type="text"
                      value={phoSourceUrl}
                      onChange={(e) => setPhoSourceUrl(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  {parsedPhotoDriveId && (
                    <div className="sm:col-span-12 font-mono text-xs text-[var(--ink-2)]">
                      Resolved Image Proxy:{' '}
                      <code>/api/media/drive/{parsedPhotoDriveId}</code>
                      {phoDimensions ? ` · ${phoDimensions}` : ''}
                    </div>
                  )}

                  <div className="field-group sm:col-span-8">
                    <label htmlFor="pho-tags" className="field-label">
                      Archive Hashtags (space-separated)
                    </label>
                    <input
                      id="pho-tags"
                      type="text"
                      value={phoTagsText}
                      onChange={(e) => setPhoTagsText(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="sm:col-span-4 flex">
                    <button
                      type="submit"
                      className="btn-arch btn-cta-bright w-full py-2"
                    >
                      + Add Photo Plate
                    </button>
                  </div>
                </form>

                <div className="table-wrap">
                  <table className="clean-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Photographer / Venue</th>
                        <th>Year</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {photos.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.title}</strong>
                          </td>
                          <td className="font-mono text-xs text-[var(--mute)]">
                            {p.photographer} · {p.venue}
                          </td>
                          <td className="font-mono text-xs tabular-nums">
                            {p.year}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleDeletePhoto(p.id)}
                              className="typo-action typo-action-danger"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-TAB: BANDS & ARTISTS */}
            {mediaSub === 'artists' && (
              <div className="flex flex-col gap-4">
                <form
                  onSubmit={handleAddArtist}
                  className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5"
                >
                  <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">
                    Add Band, Musician, Filmmaker, or Collective
                  </div>

                  <div className="field-group sm:col-span-4">
                    <label htmlFor="art-name" className="field-label">
                      Artist or Band Name
                    </label>
                    <input
                      id="art-name"
                      type="text"
                      required
                      value={artName}
                      onChange={(e) => setArtName(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-2">
                    <label htmlFor="art-role" className="field-label">
                      Role
                    </label>
                    <select
                      id="art-role"
                      value={artRole}
                      onChange={(e) =>
                        setArtRole(e.target.value as SceneArtist['role'])
                      }
                      className="input-clean"
                    >
                      <option value="Band">Band</option>
                      <option value="Musician">Musician</option>
                      <option value="Photographer">Photographer</option>
                      <option value="Videographer">Videographer</option>
                      <option value="Collective">Collective</option>
                    </select>
                  </div>

                  <div className="field-group sm:col-span-3">
                    <label htmlFor="art-genre" className="field-label">
                      Genre or Medium
                    </label>
                    <input
                      id="art-genre"
                      type="text"
                      required
                      value={artGenre}
                      onChange={(e) => setArtGenre(e.target.value)}
                      placeholder="e.g. Punk / Basement Rock"
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-3">
                    <label htmlFor="art-area" className="field-label">
                      City / Area
                    </label>
                    <input
                      id="art-area"
                      type="text"
                      required
                      value={artArea}
                      onChange={(e) => setArtArea(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-6">
                    <label htmlFor="art-tags" className="field-label">
                      Archive Hashtags (space-separated)
                    </label>
                    <input
                      id="art-tags"
                      type="text"
                      value={artTagsText}
                      onChange={(e) => setArtTagsText(e.target.value)}
                      className="input-clean"
                    />
                  </div>

                  <div className="field-group sm:col-span-3">
                    <label htmlFor="art-status" className="field-label">
                      Activity Status
                    </label>
                    <select
                      id="art-status"
                      value={artActive ? 'active' : 'inactive'}
                      onChange={(e) => setArtActive(e.target.value === 'active')}
                      className="input-clean"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <div className="sm:col-span-3 flex">
                    <button
                      type="submit"
                      className="btn-arch btn-cta-bright w-full py-2"
                    >
                      + Add Entry
                    </button>
                  </div>
                </form>

                <div className="table-wrap">
                  <table className="clean-table">
                    <thead>
                      <tr>
                        <th>Status (Click to Toggle)</th>
                        <th>Name</th>
                        <th>Role / Genre</th>
                        <th>Area</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {artists.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleToggleArtist(a.id)}
                              className={`typo-action ${
                                a.active ? 'active' : ''
                              }`}
                            >
                              {a.active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td>
                            <strong>{a.name}</strong>
                          </td>
                          <td>
                            {a.role} ·{' '}
                            <span className="text-[var(--mute)]">{a.genre}</span>
                          </td>
                          <td className="font-mono text-xs">{a.area}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleDeleteArtist(a.id)}
                              className="typo-action typo-action-danger"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-TAB: COMMENT MODERATION */}
            {mediaSub === 'comments' && (
              <div className="table-wrap">
                <table className="clean-table">
                  <thead>
                    <tr>
                      <th>Target Item</th>
                      <th>Author</th>
                      <th>Comment</th>
                      <th>Votes</th>
                      <th>Moderation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allFlattenedComments.map((c) => (
                      <tr key={c.id}>
                        <td className="font-mono text-xs">{c.targetItemId}</td>
                        <td className="font-mono text-xs font-bold">
                          @{c.author}
                        </td>
                        <td>{c.text}</td>
                        <td className="font-mono text-xs tabular-nums">
                          {c.votes}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteComment(c.targetItemId, c.id)
                            }
                            className="typo-action typo-action-danger"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {allFlattenedComments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-[var(--mute)]">
                          No comments on Scene Board.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 4: CALENDAR & FLYERS ==================== */}
        {activeTab === 'calendar' && (
          <div className="flex flex-col gap-5 anim-in">
            <form
              onSubmit={handlePublishShow}
              className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5"
            >
              <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">
                Publish Show to 7-Column Calendar &amp; Flyer Unfurl Stage
              </div>

              <div className="field-group sm:col-span-3">
                <label htmlFor="cal-month" className="field-label">
                  Month
                </label>
                <select
                  id="cal-month"
                  value={calMonth}
                  onChange={(e) =>
                    setCalMonth(e.target.value as '2026-11' | '2026-12')
                  }
                  className="input-clean"
                >
                  <option value="2026-11">Nov 2026</option>
                  <option value="2026-12">Dec 2026</option>
                </select>
              </div>

              <div className="field-group sm:col-span-2">
                <label htmlFor="cal-day" className="field-label">
                  Day (1–31)
                </label>
                <input
                  id="cal-day"
                  type="number"
                  min={1}
                  max={31}
                  required
                  value={calDay}
                  onChange={(e) => setCalDay(Number(e.target.value))}
                  className="input-clean tabular-nums"
                />
              </div>

              <div className="field-group sm:col-span-4">
                <label htmlFor="cal-venue" className="field-label">
                  Venue
                </label>
                <input
                  id="cal-venue"
                  type="text"
                  required
                  value={calVenue}
                  onChange={(e) => setCalVenue(e.target.value)}
                  placeholder="e.g. The Barn"
                  className="input-clean"
                />
              </div>

              <div className="field-group sm:col-span-3">
                <label htmlFor="cal-style" className="field-label">
                  Flyer Print Preset
                </label>
                <select
                  id="cal-style"
                  value={calStyle}
                  onChange={(e) =>
                    setCalStyle(e.target.value as FlyerPresetStyle)
                  }
                  className="input-clean"
                >
                  <option value="punk-xerox">Punk Xerox Cutout</option>
                  <option value="concrete-stencil">Concrete Stencil</option>
                  <option value="riso-zine">2-Color Risograph Zine</option>
                </select>
              </div>

              <div className="field-group sm:col-span-7">
                <label htmlFor="cal-title" className="field-label">
                  Lineup / Event Headline
                </label>
                <input
                  id="cal-title"
                  type="text"
                  required
                  value={calTitle}
                  onChange={(e) => setCalTitle(e.target.value)}
                  placeholder="e.g. Rocco & His Bones + Marietta Creekbed"
                  className="input-clean"
                />
              </div>

              <div className="field-group sm:col-span-5">
                <label htmlFor="cal-doors" className="field-label">
                  Doors &amp; Cover Info
                </label>
                <input
                  id="cal-doors"
                  type="text"
                  required
                  value={calDoors}
                  onChange={(e) => setCalDoors(e.target.value)}
                  className="input-clean"
                />
              </div>

              <div className="field-group sm:col-span-9">
                <label htmlFor="cal-note" className="field-label">
                  Flyer Etiquette / Footer Note
                </label>
                <input
                  id="cal-note"
                  type="text"
                  required
                  value={calNote}
                  onChange={(e) => setCalNote(e.target.value)}
                  placeholder="e.g. RESPECT NEIGHBORS · PARK ON GRAVEL"
                  className="input-clean"
                />
              </div>

              <div className="sm:col-span-3 flex">
                <button
                  type="submit"
                  className="btn-arch btn-cta-bright w-full py-2"
                >
                  + Publish Show
                </button>
              </div>
            </form>

            <div className="table-wrap">
              <table className="clean-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Lineup / Event</th>
                    <th>Venue &amp; Doors</th>
                    <th>Flyer Preset</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {calendarEvents.map((ev) => (
                    <tr key={ev.id}>
                      <td className="font-mono text-xs font-bold tabular-nums">
                        {ev.isoDate}
                      </td>
                      <td>
                        <strong>{ev.title}</strong>
                      </td>
                      <td className="text-xs text-[var(--mute)]">
                        {ev.venue} · {ev.doorsInfo}
                      </td>
                      <td className="font-mono text-xs text-[var(--ink-2)]">
                        {ev.flyerStyle}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleDeleteShow(ev.id)}
                          className="typo-action typo-action-danger"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== TAB 5: BARTER MARKET AUCTIONS ==================== */}
        {activeTab === 'auctions' && (
          <div className="flex flex-col gap-5 anim-in">
            <form
              onSubmit={handleAddAuction}
              className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5"
            >
              <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">
                Publish Vetted Artist Auction (thebartermarket.org · 0% Fee)
              </div>

              <div className="field-group sm:col-span-6">
                <label htmlFor="auc-title" className="field-label">
                  Artifact Title
                </label>
                <input
                  id="auc-title"
                  type="text"
                  required
                  value={aucTitle}
                  onChange={(e) => setAucTitle(e.target.value)}
                  placeholder="e.g. Fumed Silver Borosilicate Vessel"
                  className="input-clean"
                />
              </div>

              <div className="field-group sm:col-span-3">
                <label htmlFor="auc-artist" className="field-label">
                  Creator Instagram (@handle)
                </label>
                <input
                  id="auc-artist"
                  type="text"
                  required
                  value={aucArtist}
                  onChange={(e) => setAucArtist(e.target.value)}
                  placeholder="@upstate_boro_glass"
                  className="input-clean"
                />
              </div>

              <div className="field-group sm:col-span-3">
                <label htmlFor="auc-bid" className="field-label">
                  Opening Bid
                </label>
                <input
                  id="auc-bid"
                  type="text"
                  required
                  value={aucBid}
                  onChange={(e) => setAucBid(e.target.value)}
                  className="input-clean tabular-nums"
                />
              </div>

              <div className="field-group sm:col-span-3">
                <label htmlFor="auc-source-type" className="field-label">
                  Photo Provider
                </label>
                <select
                  id="auc-source-type"
                  value={aucSourceType}
                  onChange={(e) =>
                    setAucSourceType(e.target.value as MediaSourceType)
                  }
                  className="input-clean"
                >
                  <option value="embedded">Default Boro Glass Photo</option>
                  <option value="gdrive">Google Drive File ID / Link</option>
                  <option value="r2">Cloudflare R2 Image URL</option>
                </select>
              </div>

              <div className="field-group sm:col-span-3">
                <label htmlFor="auc-source-url" className="field-label">
                  Photo File ID or URL (Optional)
                </label>
                <input
                  id="auc-source-url"
                  type="text"
                  value={aucSourceUrl}
                  onChange={(e) => setAucSourceUrl(e.target.value)}
                  className="input-clean"
                />
              </div>

              <div className="field-group sm:col-span-3">
                <label htmlFor="auc-pickup" className="field-label">
                  Local Pickup Area
                </label>
                <input
                  id="auc-pickup"
                  type="text"
                  value={aucPickup}
                  onChange={(e) => setAucPickup(e.target.value)}
                  className="input-clean"
                />
              </div>

              <div className="field-group sm:col-span-3">
                <label htmlFor="auc-ig-url" className="field-label">
                  Instagram Post URL
                </label>
                <input
                  id="auc-ig-url"
                  type="url"
                  value={aucIgLink}
                  onChange={(e) => setAucIgLink(e.target.value)}
                  className="input-clean"
                />
              </div>

              <div className="sm:col-span-12 flex justify-end">
                <button
                  type="submit"
                  className="btn-arch btn-cta-bright py-2 px-5"
                >
                  + Publish Vetted Auction Card
                </button>
              </div>
            </form>

            <div className="table-wrap">
              <table className="clean-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Item</th>
                    <th>Artist</th>
                    <th>Current Bid</th>
                    <th>Override &amp; Webhook Test</th>
                  </tr>
                </thead>
                <tbody>
                  {auctions.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <span
                          className={`status-stamp ${
                            a.sold ? 'status-sold' : 'status-live'
                          }`}
                        >
                          {a.sold ? 'SOLD' : 'LIVE'}
                        </span>
                      </td>
                      <td>
                        <strong>{a.title}</strong>
                      </td>
                      <td className="font-mono text-xs">
                        @{a.ownerUsername.replace(/^@/, '')}
                      </td>
                      <td className="font-mono text-xs tabular-nums">
                        {a.currentBidLabel}
                      </td>
                      <td>
                        <div className="inline-flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleToggleAuctionSold(a)}
                            className="typo-action typo-action-accent"
                          >
                            {a.sold ? 'Mark Live' : 'Mark SOLD'}
                          </button>
                          {!a.sold && (
                            <>
                              <span
                                className="text-[var(--mute)]"
                                aria-hidden="true"
                              >
                                ·
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSimulateIgWebhook(a)}
                                className="typo-action"
                              >
                                Simulate IG SOLD
                              </button>
                            </>
                          )}
                          <span
                            className="text-[var(--mute)]"
                            aria-hidden="true"
                          >
                            ·
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteAuction(a.id)}
                            className="typo-action typo-action-danger"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== TAB 6: SUBSCRIBER CSV ==================== */}
        {activeTab === 'csv' && (
          <div className="flex flex-col gap-4 anim-in">
            <div className="glass-panel p-5 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-[var(--ink-2)]">
                Private ledger ingested from public <strong>Message Us</strong>{' '}
                &amp; <strong>Live Chat</strong> opt-ins.
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
                      ok
                        ? 'Downloading RFC-4180 .CSV'
                        : 'Could not export .CSV'
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
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-xs tabular-nums">
                        {r.createdAtIso}
                      </td>
                      <td className="font-mono text-xs">{r.source}</td>
                      <td>
                        <strong>{r.name}</strong>
                      </td>
                      <td className="font-mono text-xs">{r.email}</td>
                      <td>{r.interests}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubscriber(r.id)}
                          className="typo-action typo-action-danger"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== TAB 7: HOSTINGER CUTOVER RUNBOOK & NEXT-ITERATION LEDGER ==================== */}
        {activeTab === 'ledger' && (
          <div className="flex flex-col gap-5 anim-in">
            {/* Live Runtime Posture Readout + 5-Step Zero-Edit Hostinger Switchover Runbook */}
            <section className="glass-panel p-5 sm:p-6 flex flex-col gap-5">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--grid-hairline-strong)] pb-4">
                <div>
                  <div className="sec-kicker">
                    07 · Zero-Edit Runtime Switch &amp; Hostinger Runbook
                  </div>
                  <h2 className="sec-title !text-xl">
                    Demo Port-3000 Posture → Hostinger Live Cutover
                  </h2>
                  <p className="text-xs text-[var(--ink-2)] max-w-2xl mt-1.5 mb-0 leading-relaxed">
                    Port 3000, in-memory archive seeding, and iframe-safe Demo
                    Unlock remain active while{' '}
                    <code className="font-mono">DB_HOST</code> is empty. Setting
                    the 6 Hostinger hPanel environment variables below switches
                    automatically to Hostinger&apos;s runtime{' '}
                    <code className="font-mono">$PORT</code>, local MySQL{' '}
                    <code className="font-mono">127.0.0.1:3306</code>, and
                    passkey-only auth with zero source-code edits.
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
                        'ADMIN_PASSKEY=replace-with-curator-passkey',
                        'ADMIN_SESSION_SECRET=replace-with-64-char-hex',
                      ].join('\n');
                      navigator.clipboard?.writeText(envBlock);
                      showToast('Copied 6-key hPanel environment template');
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
                      showToast(
                        ok
                          ? 'Downloading phpMyAdmin SQL schema'
                          : 'Could not download SQL schema'
                      );
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download mysql-schema.sql</span>
                  </button>
                </div>
              </div>

              {/* Exposed 1px Live Runtime Posture Strip */}
              <div className="cutover-grid" aria-label="Runtime Posture Status">
                <div className="cutover-cell">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mono)]">
                    Runtime Mode
                  </span>
                  <span
                    className={`status-stamp ${
                      initialData.runtimePosture?.mode ===
                      'hostinger-production'
                        ? 'status-active'
                        : 'status-live'
                    }`}
                  >
                    {initialData.runtimePosture?.mode === 'hostinger-production'
                      ? 'Hostinger Production'
                      : 'Preview Demo (Steady)'}
                  </span>
                </div>

                <div className="cutover-cell">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mono)]">
                    Port Binding
                  </span>
                  <span className="font-mono text-xs font-bold tabular-nums">
                    Port {initialData.runtimePosture?.activePort || '3000'}{' '}
                    <span className="font-normal text-[var(--ink-mono)]">
                      (${'{PORT:-3000}'})
                    </span>
                  </span>
                </div>

                <div className="cutover-cell">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mono)]">
                    Storage Engine
                  </span>
                  <span className="font-mono text-xs font-bold tabular-nums">
                    {initialData.storageDriver === 'hostinger-mysql'
                      ? `MySQL · ${initialData.runtimePosture?.mysqlHostDisplay}`
                      : 'In-Memory Seed Store'}
                  </span>
                </div>

                <div className="cutover-cell">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mono)]">
                    Admin Auth Gate
                  </span>
                  <span
                    className={`status-stamp ${
                      initialData.runtimePosture?.demoUnlockEnabled === false
                        ? 'status-active'
                        : 'status-live'
                    }`}
                  >
                    {initialData.runtimePosture?.demoUnlockEnabled === false
                      ? 'Passkey Enforced'
                      : 'Demo Unlock + Passkey'}
                  </span>
                </div>
              </div>

              {/* 5-Step Hostinger Cutover Runbook (1px Hairline Grid) */}
              <div className="cutover-grid" aria-label="5-Step Hostinger Guide">
                <div className="cutover-cell">
                  <span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">
                    01 · Node.js App Setup
                  </span>
                  <div className="text-xs font-bold">
                    Connect Repo in hPanel Node.js
                  </div>
                  <p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">
                    Select Node 20/22. Build:{' '}
                    <code className="font-mono">npm run build</code> · Start:{' '}
                    <code className="font-mono">npm run start</code> (auto-binds
                    Hostinger <code className="font-mono">$PORT</code> while
                    holding <code className="font-mono">3000</code> locally).
                  </p>
                </div>

                <div className="cutover-cell">
                  <span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">
                    02 · Local MySQL 127.0.0.1
                  </span>
                  <div className="text-xs font-bold">
                    Create Database in hPanel
                  </div>
                  <p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">
                    Create a database in hPanel Databases. All 11 tables
                    auto-create via{' '}
                    <code className="font-mono">CREATE TABLE IF NOT EXISTS</code>{' '}
                    on first boot (or import{' '}
                    <code className="font-mono">mysql-schema.sql</code>).
                  </p>
                </div>

                <div className="cutover-cell">
                  <span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">
                    03 · Paste 6 hPanel Keys
                  </span>
                  <div className="text-xs font-bold">
                    Zero-Edit Environment Flip
                  </div>
                  <p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">
                    Paste <code className="font-mono">DB_HOST=127.0.0.1</code>,{' '}
                    <code className="font-mono">DB_NAME</code>,{' '}
                    <code className="font-mono">DB_USER</code>,{' '}
                    <code className="font-mono">DB_PASSWORD</code>,{' '}
                    <code className="font-mono">ADMIN_PASSKEY</code>, and{' '}
                    <code className="font-mono">ADMIN_SESSION_SECRET</code>.
                  </p>
                </div>

                <div className="cutover-cell">
                  <span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">
                    04 · Off-Hostinger Media
                  </span>
                  <div className="text-xs font-bold">
                    Drive 206 Proxy &amp; R2 CDN
                  </div>
                  <p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">
                    Optional: add{' '}
                    <code className="font-mono">GDRIVE_CLIENT_EMAIL</code> +{' '}
                    <code className="font-mono">GDRIVE_PRIVATE_KEY</code> for
                    24-bit FLAC range streaming or{' '}
                    <code className="font-mono">NEXT_PUBLIC_R2_PUBLIC_URL</code>.
                  </p>
                </div>

                <div className="cutover-cell">
                  <span className="font-mono text-[11px] font-bold text-[var(--accent)] tabular-nums">
                    05 · DNS &amp; Verify
                  </span>
                  <div className="text-xs font-bold">
                    Point Domain &amp; Confirm Strip
                  </div>
                  <p className="text-xs text-[var(--ink-2)] m-0 leading-relaxed">
                    Point{' '}
                    <code className="font-mono">greenvillediyarchive.org</code>{' '}
                    with Auto-SSL, sign into <code className="font-mono">/admin</code>,
                    and verify the Posture Strip above reads{' '}
                    <code className="font-mono">HOSTINGER PRODUCTION</code>.
                  </p>
                </div>
              </div>
            </section>

            <form
              onSubmit={handleAddFutureTask}
              className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5"
            >
              <div className="field-group sm:col-span-4">
                <label htmlFor="task-phase" className="field-label">
                  Iteration Phase
                </label>
                <select
                  id="task-phase"
                  value={taskPhase}
                  onChange={(e) =>
                    setTaskPhase(
                      e.target.value as FutureTaskLedgerItem['passPhase']
                    )
                  }
                  className="input-clean"
                >
                  <option value="Pass 6">Pass 6 (Next Iteration)</option>
                  <option value="Pass 5">Pass 5</option>
                  <option value="Hostinger">Hostinger</option>
                  <option value="Storage / CDN">Storage / CDN</option>
                </select>
              </div>

              <div className="field-group sm:col-span-4">
                <label htmlFor="task-area" className="field-label">
                  Subsystem Area
                </label>
                <select
                  id="task-area"
                  value={taskArea}
                  onChange={(e) =>
                    setTaskArea(e.target.value as FutureTaskLedgerItem['area'])
                  }
                  className="input-clean"
                >
                  <option value="UI & Media">UI &amp; Media</option>
                  <option value="Puck Visual Studio">Puck Visual Studio</option>
                  <option value="Hostinger MySQL">Hostinger MySQL</option>
                  <option value="Google Drive / R2">Google Drive / R2</option>
                  <option value="IG Webhooks">IG Webhooks</option>
                </select>
              </div>

              <div className="field-group sm:col-span-4">
                <label htmlFor="task-priority" className="field-label">
                  Priority
                </label>
                <select
                  id="task-priority"
                  value={taskPriority}
                  onChange={(e) =>
                    setTaskPriority(e.target.value as TaskPriority)
                  }
                  className="input-clean"
                >
                  <option value="P0">P0 · Launch Cutover</option>
                  <option value="P1">P1 · High</option>
                  <option value="P2">P2 · Optional</option>
                </select>
              </div>

              <div className="field-group sm:col-span-12">
                <label htmlFor="task-title" className="field-label">
                  Task Title
                </label>
                <input
                  id="task-title"
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Describe next-iteration or cutover task"
                  className="input-clean"
                />
              </div>

              <div className="field-group sm:col-span-7">
                <label htmlFor="task-rationale" className="field-label">
                  Architectural Rationale / Why Deferred
                </label>
                <input
                  id="task-rationale"
                  type="text"
                  required
                  value={taskRationale}
                  onChange={(e) => setTaskRationale(e.target.value)}
                  className="input-clean"
                />
              </div>

              <div className="field-group sm:col-span-5">
                <label htmlFor="task-prereq" className="field-label">
                  Prerequisite or Env Var
                </label>
                <input
                  id="task-prereq"
                  type="text"
                  value={taskPrereq}
                  onChange={(e) => setTaskPrereq(e.target.value)}
                  className="input-clean"
                />
              </div>

              <div className="sm:col-span-12 flex justify-end">
                <button
                  type="submit"
                  className="btn-arch btn-cta-bright py-2 px-5"
                >
                  + Log Next-Round Task
                </button>
              </div>
            </form>

            <div className="table-wrap">
              <table className="clean-table">
                <thead>
                  <tr>
                    <th>ID / Phase</th>
                    <th>Area</th>
                    <th>Task, Rationale &amp; Prerequisite</th>
                    <th>Status</th>
                    <th>Transition</th>
                  </tr>
                </thead>
                <tbody>
                  {futureTasks.map((t) => (
                    <tr key={t.id}>
                      <td className="font-mono text-xs whitespace-nowrap tabular-nums">
                        <div className="font-bold text-[var(--ink)]">{t.id}</div>
                        <div className="text-[10.5px] text-[var(--mute)]">
                          {t.passPhase} · {t.priority}
                        </div>
                      </td>
                      <td className="font-mono text-xs whitespace-nowrap">
                        {t.area}
                      </td>
                      <td>
                        <strong>{t.title}</strong>
                        <p className="text-xs text-[var(--ink-2)] my-1 leading-relaxed">
                          {t.rationale}
                        </p>
                        {t.prerequisite && (
                          <div className="font-mono text-[11px] text-[var(--mute)]">
                            Prereq: {t.prerequisite}
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-stamp ${
                            t.status === 'Completed'
                              ? 'status-active'
                              : t.status === 'In Progress'
                              ? 'status-live'
                              : 'status-muted'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          {(
                            [
                              'Planned',
                              'In Progress',
                              'Deferred',
                              'Completed',
                            ] as TaskStatus[]
                          )
                            .filter((s) => s !== t.status)
                            .map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => handleUpdateTaskStatus(t.id, s)}
                                className="typo-action !text-[10.5px]"
                              >
                                {s}
                              </button>
                            ))}
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(t.id)}
                            className="typo-action typo-action-danger !text-[10.5px]"
                            aria-label={`Delete ${t.id}`}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {toastMsg && (
        <div className="toast-banner" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
