// components/shell/ResponsiveArchiveShell.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Flower2,
  Leaf,
  Lock,
  Menu,
  MessageSquare,
  Music,
  Play,
  Snowflake,
  Sun,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import {
  AdminSiteSettings,
  CommentNode,
  ContrastMode,
  FlacRecording,
  InstagramAuctionItem,
  PublicArchiveSection,
  PuckPageRecord,
  SceneChatMessage,
  SeasonTheme,
  ShowCalendarEvent,
} from '@/types/archive';
import { PublicArchivePayload } from '@/lib/storage/repository';
import PuckStaticRenderer from '@/components/puck/PuckStaticRenderer';
import { runViewTransition } from '@/lib/motion/lagless-ticker';
import TactilePortholeTimeline from '@/components/timeline/TactilePortholeTimeline';
import MonthFlyerCalendar from '@/components/calendar/MonthFlyerCalendar';
import SamplyFlacDeck from '@/components/audio/SamplyFlacDeck';
import DockedLosslessMiniPlayer from '@/components/audio/DockedLosslessMiniPlayer';
import { useLosslessAudioEngine } from '@/components/audio/useLosslessAudioEngine';
import {
  adminFetch,
  useAdminMemoryToken,
} from '@/lib/dal/adminClientSession';
import LiquidGlassStage from '@/components/fx/LiquidGlassStage';
import { sanitizeSafeHref } from '@/lib/security/sanitize';

export interface InitialArchiveDeepLink {
  itemId?: string;
  timeSec?: number;
  monthKey?: string;
}

interface ResponsiveArchiveShellProps {
  initialPayload: PublicArchivePayload;
  isAdminAuthenticated?: boolean;
  initialSection?: PublicArchiveSection;
  initialDeepLink?: InitialArchiveDeepLink;
}

function formatMmSs(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function buildArchiveQueryPath(params: {
  tab: PublicArchiveSection;
  item?: string | null;
  t?: number | null;
  month?: string | null;
}): string {
  const qs = new URLSearchParams();
  qs.set('tab', params.tab);
  if (params.month) {
    qs.set('month', params.month);
  }
  if (params.item) {
    qs.set('item', params.item);
  }
  if (typeof params.t === 'number' && Number.isFinite(params.t) && params.t > 0) {
    qs.set('t', String(Math.floor(params.t)));
  }
  return `/?${qs.toString()}`;
}

const SCENE_QA_ANSWERS: Record<string, string> = {
  band: 'Check Artists (#active), drop a note in Live Chat, or pull up to a Calendar show.',
  book: 'Message organizers in Message Us with recording links for DIY bills, or reach out to Radio Room / Swanson’s Warehouse.',
  flac: 'Use "Send Recording" on Audio to share 24-bit WAV/FLAC board or room tapes.',
  poe: 'Skater-built and community-kept: pack out trash, respect curing barriers, and bring quick-set on patch days.',
  auction:
    'Artists post work on Instagram with 0% fees. Bid in IG comments; when the artist comments "SOLD", our webhook marks it SOLD.',
  news: 'Drop your email and scene interests in Message Us for show, pour, or auction updates.',
};

function answerSceneQuestion(q: string): string {
  const s = q.toLowerCase();
  if (s.includes('start') || s.includes('band') || s.includes('jam'))
    return SCENE_QA_ANSWERS.band;
  if (s.includes('book') || s.includes('show') || s.includes('play'))
    return SCENE_QA_ANSWERS.book;
  if (s.includes('flac') || s.includes('audio') || s.includes('record'))
    return SCENE_QA_ANSWERS.flac;
  if (s.includes('poe') || s.includes('skate') || s.includes('concrete'))
    return SCENE_QA_ANSWERS.poe;
  if (s.includes('auction') || s.includes('glass') || s.includes('ig'))
    return SCENE_QA_ANSWERS.auction;
  return SCENE_QA_ANSWERS.news;
}

function matchFlatQuery(parts: string[], q: string): boolean {
  const clean = (q || '').trim().toLowerCase().replace(/^#+/, '');
  if (!clean) return true;
  const hay = parts.join(' ').toLowerCase();
  return clean
    .split(/\s+/)
    .every((tok) => hay.includes(tok.replace(/^#+/, '')));
}

function SeasonEmblem({ season }: { season: SeasonTheme }) {
  const cls = 'w-4 h-4 text-[var(--accent)] shrink-0';
  if (season === 'spring') return <Flower2 className={cls} aria-hidden="true" />;
  if (season === 'summer') return <Sun className={cls} aria-hidden="true" />;
  if (season === 'winter')
    return <Snowflake className={cls} aria-hidden="true" />;
  return <Leaf className={cls} aria-hidden="true" />;
}

export default function ResponsiveArchiveShell({
  initialPayload,
  isAdminAuthenticated = false,
  initialSection = 'videos',
  initialDeepLink,
}: ResponsiveArchiveShellProps) {
  const [activeTab, setActiveTab] =
    useState<PublicArchiveSection>(initialSection);
  const [adminAuth, setAdminAuth] = useState<boolean>(isAdminAuthenticated);
  const memoryToken = useAdminMemoryToken();
  const isCuratorUnlocked = adminAuth || Boolean(memoryToken);
  const [siteSettings, setSiteSettings] = useState<AdminSiteSettings>(
    initialPayload.siteSettings
  );
  const [contrast, setContrast] = useState<ContrastMode>(
    initialPayload.siteSettings.defaultContrast
  );
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);

  // Public archive datasets
  const [videos] = useState(initialPayload.videos);
  const [audioTracks] = useState<FlacRecording[]>(initialPayload.audio);
  const [photos] = useState(initialPayload.photos);
  const [artists] = useState(initialPayload.artists);
  const [calendarEvents] = useState<ShowCalendarEvent[]>(
    initialPayload.calendar
  );
  const [timelineEras] = useState(initialPayload.timeline);
  const [rememberedPlaces] = useState(initialPayload.remembered);
  const [auctions, setAuctions] = useState<InstagramAuctionItem[]>(
    initialPayload.auctions
  );
  const [puckPages] = useState<PuckPageRecord[]>(
    initialPayload.puckPages || []
  );
  const [commentsByItem, setCommentsByItem] = useState<
    Record<string, CommentNode[]>
  >(initialPayload.commentsByItem);

  // Hoisted lossless FLAC playback engine (cues deep-linked track & timestamp ready-to-play)
  const [audioEngine, primaryAudioRef] = useLosslessAudioEngine(
    audioTracks,
    initialSection === 'audio' ? initialDeepLink : undefined
  );

  // Per-tab flat search queries
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({
    videos: '',
    audio: '',
    photos: '',
    artists: '',
    remembered: '',
    auction: '',
  });

  // Video stage state (hydrated from ?tab=videos&item=&t= when deep-linked)
  const initialTargetVid =
    (initialSection === 'videos' && initialDeepLink?.itemId
      ? initialPayload.videos.find((v) => v.id === initialDeepLink.itemId)
      : undefined) || initialPayload.videos[0];

  const initialVidCue = (() => {
    if (!initialTargetVid) {
      return { sec: 0, text: '00:00 — Full Tape' };
    }
    if (
      initialSection === 'videos' &&
      typeof initialDeepLink?.timeSec === 'number' &&
      initialDeepLink.timeSec >= 0
    ) {
      const targetSec = Math.floor(initialDeepLink.timeSec);
      const exactTs = initialTargetVid.timestamps.find(
        (ts) => ts.sec === targetSec
      );
      if (exactTs) {
        return { sec: targetSec, text: `${exactTs.time} — ${exactTs.label}` };
      }
      const preceding = [...initialTargetVid.timestamps]
        .reverse()
        .find((ts) => ts.sec <= targetSec);
      return {
        sec: targetSec,
        text: `${formatMmSs(targetSec)} — ${
          preceding?.label || 'Cued Offset'
        }`,
      };
    }
    const firstTs = initialTargetVid.timestamps[0];
    return firstTs
      ? { sec: firstTs.sec, text: `${firstTs.time} — ${firstTs.label}` }
      : { sec: 0, text: '00:00 — Full Tape' };
  })();

  const [selectedVidId, setSelectedVidId] = useState(
    initialTargetVid?.id || 'VID-01'
  );
  const [vidSeekText, setVidSeekText] = useState(initialVidCue.text);
  const [vidSeekSeconds, setVidSeekSeconds] = useState(initialVidCue.sec);
  const [vidLiveEmbedMode, setVidLiveEmbedMode] = useState(false);
  const [videoNotesOpen, setVideoNotesOpen] = useState(false);

  // Calendar selection state (for live URL bar sync)
  const initialCalState = (() => {
    const sortedMonths = Array.from(
      new Set(initialPayload.calendar.map((e) => e.monthKey))
    ).sort();
    const matchedEv =
      initialSection === 'calendar' && initialDeepLink?.itemId
        ? initialPayload.calendar.find((e) => e.id === initialDeepLink.itemId)
        : undefined;
    const mKey =
      matchedEv?.monthKey ||
      (initialSection === 'calendar' ? initialDeepLink?.monthKey : undefined) ||
      sortedMonths[0] ||
      '2026-11';
    const firstInMonth = initialPayload.calendar
      .filter((e) => e.monthKey === mKey)
      .sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.id.localeCompare(b.id))[0];
    return {
      monthKey: mKey,
      eventId: matchedEv?.id || firstInMonth?.id || null,
    };
  })();

  const [calActiveMonth, setCalActiveMonth] = useState<string>(
    initialCalState.monthKey
  );
  const [calActiveEventId, setCalActiveEventId] = useState<string | null>(
    initialCalState.eventId
  );

  // Spotlight state for deep-linked Photo, Memorial, Artist, or Auction entries
  const [spotlightItemId, setSpotlightItemId] = useState<string | null>(() => {
    if (
      initialDeepLink?.itemId &&
      (initialSection === 'photos' ||
        initialSection === 'remembered' ||
        initialSection === 'auction' ||
        initialSection === 'artists')
    ) {
      return initialDeepLink.itemId;
    }
    return null;
  });

  // Remembered sort state
  const [rememberSort, setRememberSort] = useState<'desc' | 'asc'>('desc');

  // Comments reply open state
  const [openReplyBoxes, setOpenReplyBoxes] = useState<Record<string, boolean>>(
    {}
  );

  // Collapsible Scene Room Dock state
  const [dockOpen, setDockOpen] = useState(false);
  const [dockTab, setDockTab] = useState<'chat' | 'qa' | 'msg'>('chat');
  const [chatNick, setChatNick] = useState('skater');
  const [chatMsgInput, setChatMsgInput] = useState('');
  const [chatLog, setChatLog] = useState<SceneChatMessage[]>(
    initialPayload.sceneChat || []
  );
  const [qaInput, setQaInput] = useState('');
  const [qaLog, setQaLog] = useState([
    {
      role: 'bot',
      text: 'Pick a topic below or ask about Upstate DIY:',
    },
  ]);
  const [msgName, setMsgName] = useState('');
  const [msgEmail, setMsgEmail] = useState('');
  const [msgInterests, setMsgInterests] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
  };

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2400);
    return () => clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => {
    if (!copiedLinkKey) return;
    const t = setTimeout(() => setCopiedLinkKey(null), 1600);
    return () => clearTimeout(t);
  }, [copiedLinkKey]);

  // Scroll deep-linked Photo, Memorial, Artist, or Auction card smoothly into view on initial load
  const initialSpotlightScrolledRef = React.useRef(false);
  useEffect(() => {
    if (initialSpotlightScrolledRef.current || !spotlightItemId) return;
    initialSpotlightScrolledRef.current = true;
    const raf = window.requestAnimationFrame(() => {
      const el = document.getElementById(`archive-item-${spotlightItemId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [spotlightItemId]);

  // Silent live address-bar synchronization (250ms debounced + __NA bypass so Next.js AppRouter never fires RSC transitions)
  const currentAudioTrackId = audioEngine.currentTrack?.id || '';
  const pausedAudioCueSec = !audioEngine.isPlaying
    ? Math.floor(audioEngine.currentPlayheadSec)
    : 0;
  const syncSignature = `${activeTab}|${selectedVidId}|${vidSeekSeconds}|${currentAudioTrackId}|${pausedAudioCueSec}|${calActiveMonth}|${calActiveEventId || ''}|${spotlightItemId || ''}`;
  const initialSyncSignatureRef = React.useRef(syncSignature);
  const userChangedSelectionRef = React.useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (syncSignature !== initialSyncSignatureRef.current) {
      userChangedSelectionRef.current = true;
    }
    // Keep clean "/" untouched on initial arrival until the visitor actually switches tabs/items
    if (!userChangedSelectionRef.current && window.location.search === '') {
      return;
    }

    let nextPath = buildArchiveQueryPath({ tab: activeTab });
    if (activeTab === 'videos') {
      nextPath = buildArchiveQueryPath({
        tab: 'videos',
        item: selectedVidId || null,
        t: vidSeekSeconds > 0 ? vidSeekSeconds : null,
      });
    } else if (activeTab === 'audio') {
      nextPath = buildArchiveQueryPath({
        tab: 'audio',
        item: currentAudioTrackId || null,
        t: pausedAudioCueSec > 0 ? pausedAudioCueSec : null,
      });
    } else if (activeTab === 'calendar') {
      nextPath = buildArchiveQueryPath({
        tab: 'calendar',
        month: calActiveMonth || null,
        item: calActiveEventId || null,
      });
    } else if (
      (activeTab === 'photos' ||
        activeTab === 'remembered' ||
        activeTab === 'auction' ||
        activeTab === 'artists') &&
      spotlightItemId
    ) {
      nextPath = buildArchiveQueryPath({
        tab: activeTab,
        item: spotlightItemId,
      });
    }

    const timerId = window.setTimeout(() => {
      const currentFull = `${window.location.pathname}${window.location.search}`;
      if (currentFull !== nextPath) {
        const baseState =
          window.history.state && typeof window.history.state === 'object'
            ? (window.history.state as Record<string, unknown>)
            : {};
        window.history.replaceState({ ...baseState, __NA: true }, '', nextPath);
      }
    }, 250);

    return () => window.clearTimeout(timerId);
  }, [
    syncSignature,
    activeTab,
    selectedVidId,
    vidSeekSeconds,
    currentAudioTrackId,
    pausedAudioCueSec,
    calActiveMonth,
    calActiveEventId,
    spotlightItemId,
  ]);

  const copyShareLink = async (params: {
    tab: PublicArchiveSection;
    item?: string;
    t?: number;
    month?: string;
    key: string;
  }) => {
    if (typeof window === 'undefined') return;
    userChangedSelectionRef.current = true;
    const relativePath = buildArchiveQueryPath({
      tab: params.tab,
      item: params.item || null,
      t: params.t && params.t > 0 ? params.t : null,
      month: params.month || null,
    });
    const fullUrl = `${window.location.origin}${relativePath}`;

    let copiedOk = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullUrl);
        copiedOk = true;
      }
    } catch {
      copiedOk = false;
    }

    if (!copiedOk) {
      try {
        const ta = document.createElement('textarea');
        ta.value = fullUrl;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        copiedOk = true;
      } catch {
        copiedOk = false;
      }
    }

    const baseState =
      window.history.state && typeof window.history.state === 'object'
        ? (window.history.state as Record<string, unknown>)
        : {};
    window.history.replaceState({ ...baseState, __NA: true }, '', relativePath);
    setCopiedLinkKey(params.key);
    showToast(
      copiedOk
        ? `COPIED LINK · ${relativePath.slice(1)}`
        : `SHARE URL · ${relativePath.slice(1)}`
    );
  };

  // Apply season & contrast attributes to <html> (synchronizing .dark, data-theme, and data-contrast)
  useEffect(() => {
    document.documentElement.setAttribute(
      'data-season',
      siteSettings.seasonTheme
    );
  }, [siteSettings.seasonTheme]);

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

  // Sync admin posture via in-memory Bearer token only when needed (SSR already hydrated cookie auth & siteSettings)
  useEffect(() => {
    if (!memoryToken || isAdminAuthenticated) return;
    adminFetch('/api/admin/auth')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setAdminAuth(Boolean(data.authenticated));
        if (data.siteSettings) {
          setSiteSettings(data.siteSettings);
        }
      })
      .catch(() => {
        // Silent ignore
      });
  }, [memoryToken, isAdminAuthenticated]);

  // Hostinger-safe conditional HTTP poller with 429 backoff (runs only when Scene Room or Auctions is active)
  useEffect(() => {
    if (!dockOpen && activeTab !== 'auction') return;

    let cancelled = false;
    let timeoutId: number | undefined;
    let nextDelayMs = 15000;

    const scheduleNext = (delayMs: number) => {
      if (cancelled) return;
      timeoutId = window.setTimeout(() => {
        void pollSnapshot();
      }, delayMs);
    };

    const pollSnapshot = async () => {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') {
        scheduleNext(nextDelayMs);
        return;
      }
      try {
        const res = await fetch('/api/archive?poll=1', { cache: 'no-store' });
        if (res.status === 429) {
          nextDelayMs = Math.min(120000, nextDelayMs * 2);
          scheduleNext(nextDelayMs);
          return;
        }
        if (!res.ok) {
          nextDelayMs = Math.min(60000, Math.round(nextDelayMs * 1.5));
          scheduleNext(nextDelayMs);
          return;
        }
        nextDelayMs = 15000;
        const data = await res.json();
        if (cancelled || !data.ok) return;
        if (Array.isArray(data.sceneChat)) {
          setChatLog(data.sceneChat);
        }
        if (Array.isArray(data.auctions)) {
          setAuctions(data.auctions);
        }
      } catch {
        nextDelayMs = Math.min(60000, Math.round(nextDelayMs * 1.5));
      }
      scheduleNext(nextDelayMs);
    };

    scheduleNext(nextDelayMs);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [dockOpen, activeTab]);

  const switchSection = (next: PublicArchiveSection) => {
    setMobileMoreOpen(false);
    if (next !== activeTab) {
      setSpotlightItemId(null);
    }
    runViewTransition(() => {
      setActiveTab(next);
    });
  };

  const handleSetSearch = (tabKey: string, val: string) => {
    setSearchQueries((prev) => ({ ...prev, [tabKey]: val }));
  };

  const handleToggleQuickTag = (tabKey: string, tag: string) => {
    setSearchQueries((prev) => ({
      ...prev,
      [tabKey]: prev[tabKey] === tag ? '' : tag,
    }));
  };

  // Unified Comment API actions (shared by Video Stage & Samply FLAC Deck)
  const postCommentApi = async (
    targetItemId: string,
    author: string,
    text: string,
    timestampSec?: number
  ) => {
    const cleanAuthor = author.trim();
    const cleanText = text.trim();
    if (!cleanAuthor || !cleanText) return;
    try {
      const res = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-comment',
          targetItemId,
          author: cleanAuthor,
          text: cleanText,
          timestampSec,
        }),
      });
      const data = await res.json();
      if (data.ok && data.comment) {
        setCommentsByItem((prev) => ({
          ...prev,
          [targetItemId]: [data.comment, ...(prev[targetItemId] || [])],
        }));
        showToast('Note posted');
      }
    } catch {
      showToast('Could not post note');
    }
  };

  const voteCommentApi = async (
    targetItemId: string,
    commentId: string,
    delta: 1 | -1
  ) => {
    try {
      const res = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'vote-comment',
          targetItemId,
          commentId,
          delta,
        }),
      });
      const data = await res.json();
      if (data.ok && data.comment) {
        setCommentsByItem((prev) => ({
          ...prev,
          [targetItemId]: (prev[targetItemId] || []).map((c) =>
            c.id === commentId ? data.comment : c
          ),
        }));
      }
    } catch {
      // Ignore vote error
    }
  };

  const replyCommentApi = async (
    targetItemId: string,
    commentId: string,
    author: string,
    text: string
  ) => {
    const cleanAuthor = author.trim();
    const cleanText = text.trim();
    if (!cleanAuthor || !cleanText) return;
    try {
      const res = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reply-comment',
          targetItemId,
          commentId,
          author: cleanAuthor,
          text: cleanText,
        }),
      });
      const data = await res.json();
      if (data.ok && data.comment) {
        setCommentsByItem((prev) => ({
          ...prev,
          [targetItemId]: (prev[targetItemId] || []).map((c) =>
            c.id === commentId ? data.comment : c
          ),
        }));
      }
    } catch {
      showToast('Could not post reply');
    }
  };

  // Scene Room handlers
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMsg = chatMsgInput.trim();
    if (!cleanMsg) return;
    const handle = chatNick.trim() || 'visitor';
    const d = new Date();
    const ts =
      (d.getHours() % 12 || 12) +
      ':' +
      String(d.getMinutes()).padStart(2, '0') +
      (d.getHours() >= 12 ? 'p' : 'a');

    const optimistic: SceneChatMessage = {
      id: `CHAT-OPT-${Date.now()}`,
      who: handle,
      time: ts,
      msg: cleanMsg,
      createdAtIso: d.toISOString(),
    };
    setChatLog((prev) => [...prev, optimistic]);
    setChatMsgInput('');

    try {
      const res = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-chat',
          who: handle,
          msg: cleanMsg,
        }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.sceneChat)) {
        setChatLog(data.sceneChat);
      }
    } catch {
      // Keep optimistic message in local log if offline
    }
  };

  const handleAskQa = (qText: string) => {
    const clean = qText.trim();
    if (!clean) return;
    setQaLog((prev) => [
      ...prev,
      { role: 'user', text: clean },
      { role: 'bot', text: answerSceneQuestion(clean) },
    ]);
    setQaInput('');
  };

  const handleSendMessageUs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgName.trim() || !msgEmail.trim() || !msgInterests.trim()) return;
    try {
      const res = await fetch('/api/contact-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'Message Us',
          name: msgName,
          email: msgEmail,
          interests: msgInterests,
        }),
      });
      if (res.ok) {
        setMsgName('');
        setMsgEmail('');
        setMsgInterests('');
        showToast('Sent to organizers');
      }
    } catch {
      showToast('Failed to send message');
    }
  };

  // Reusable Stacked External-Label Search + Unboxed Hashtag Trigger Strip
  const renderSearchAndTags = (
    tabKey: string,
    fieldLabel: string,
    tags: string[]
  ) => {
    const val = searchQueries[tabKey] || '';
    const inputId = `archive-search-${tabKey}`;
    return (
      <>
        <div className="search-bar">
          <div className="field-group flex-1 min-w-[220px]">
            <label htmlFor={inputId} className="field-label">
              {fieldLabel}
            </label>
            <input
              id={inputId}
              type="search"
              value={val}
              onChange={(e) => handleSetSearch(tabKey, e.target.value)}
              placeholder=""
              className="input-clean"
            />
          </div>
          {val && (
            <button
              type="button"
              className="typo-action pb-2"
              onClick={() => handleSetSearch(tabKey, '')}
            >
              Clear
            </button>
          )}
        </div>
        <div className="tag-strip" role="group" aria-label={`${fieldLabel} tags`}>
          {tags.map((t) => {
            const isActive = val.toLowerCase() === t;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={isActive}
                className={`tag-trigger ${isActive ? 'active' : ''}`}
                onClick={() => handleToggleQuickTag(tabKey, t)}
              >
                #{t}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  // Collapsible Video Notes Drawer — External Stacked Monospace Labels + Unboxed Votes/Replies
  const renderCollapsibleVideoNotes = (itemId: string) => {
    const list = commentsByItem[itemId] || [];
    if (!videoNotesOpen) return null;

    return (
      <div className="mt-5 pt-4 border-t border-[var(--glass-border)] anim-in">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const author = String(fd.get('author') || '');
            const text = String(fd.get('text') || '');
            await postCommentApi(itemId, author, text);
            form.reset();
          }}
          className="grid grid-cols-1 sm:grid-cols-12 items-end gap-3 mb-4"
        >
          <div className="field-group sm:col-span-3">
            <label htmlFor={`vid-note-author-${itemId}`} className="field-label">
              Handle
            </label>
            <input
              id={`vid-note-author-${itemId}`}
              type="text"
              name="author"
              required
              placeholder="e.g. vernon"
              className="input-clean"
            />
          </div>
          <div className="field-group sm:col-span-7">
            <label htmlFor={`vid-note-text-${itemId}`} className="field-label">
              Scene or Timestamp Note
            </label>
            <input
              id={`vid-note-text-${itemId}`}
              type="text"
              name="text"
              required
              placeholder=""
              className="input-clean"
            />
          </div>
          <div className="sm:col-span-2 flex">
            <button type="submit" className="btn-arch btn-cta-bright w-full py-2">
              Post Note
            </button>
          </div>
        </form>

        {list.map((c) => (
          <div key={c.id} className="comment-row">
            <div className="flex justify-between items-center font-mono text-xs gap-2">
              <strong>@{c.author}</strong>
              <div className="inline-flex items-center gap-2.5 tabular-nums">
                <button
                  type="button"
                  className="typo-action !py-0.5"
                  onClick={() => void voteCommentApi(itemId, c.id, 1)}
                  aria-label="Upvote comment"
                >
                  <ThumbsUp className="w-3 h-3" />
                  <span>{c.votes}</span>
                </button>
                <span className="text-[var(--mute)]" aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  className="typo-action !py-0.5"
                  onClick={() => void voteCommentApi(itemId, c.id, -1)}
                  aria-label="Downvote comment"
                >
                  <ThumbsDown className="w-3 h-3" />
                </button>
                <span className="text-[var(--mute)]" aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  aria-pressed={Boolean(openReplyBoxes[c.id])}
                  className={`typo-action !py-0.5 ${
                    openReplyBoxes[c.id] ? 'active' : ''
                  }`}
                  onClick={() =>
                    setOpenReplyBoxes((prev) => ({
                      ...prev,
                      [c.id]: !prev[c.id],
                    }))
                  }
                >
                  Reply
                </button>
              </div>
            </div>
            <div className="mt-1 text-sm leading-relaxed">{c.text}</div>

            {(c.replies || []).map((r) => (
              <div key={r.id} className="comment-row comment-reply">
                <strong className="font-mono text-xs">@{r.author}:</strong>{' '}
                <span className="text-sm">{r.text}</span>
              </div>
            ))}

            {openReplyBoxes[c.id] && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const fd = new FormData(form);
                  const rauthor = String(fd.get('rauthor') || '');
                  const rtext = String(fd.get('rtext') || '');
                  await replyCommentApi(itemId, c.id, rauthor, rtext);
                  form.reset();
                  setOpenReplyBoxes((prev) => ({ ...prev, [c.id]: false }));
                }}
                className="grid grid-cols-1 sm:grid-cols-12 items-end mt-3 gap-2.5"
              >
                <div className="field-group sm:col-span-3">
                  <label
                    htmlFor={`vid-reply-handle-${c.id}`}
                    className="field-label"
                  >
                    Handle
                  </label>
                  <input
                    id={`vid-reply-handle-${c.id}`}
                    type="text"
                    name="rauthor"
                    required
                    className="input-clean py-1.5 px-2.5"
                  />
                </div>
                <div className="field-group sm:col-span-7">
                  <label
                    htmlFor={`vid-reply-text-${c.id}`}
                    className="field-label"
                  >
                    Reply
                  </label>
                  <input
                    id={`vid-reply-text-${c.id}`}
                    type="text"
                    name="rtext"
                    required
                    className="input-clean py-1.5 px-2.5"
                  />
                </div>
                <div className="sm:col-span-2 flex">
                  <button type="submit" className="btn-arch active w-full py-1.5">
                    Send
                  </button>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Filtered views
  const filteredVideos = videos.filter((v) =>
    matchFlatQuery(
      [
        v.title,
        v.venue,
        v.filmer,
        v.tags.join(' '),
        v.timestamps.map((t) => t.label).join(' '),
      ],
      searchQueries.videos
    )
  );
  const activeVideo =
    videos.find((v) => v.id === selectedVidId) ||
    filteredVideos[0] ||
    videos[0];

  const filteredAudio = audioTracks.filter((a) =>
    matchFlatQuery(
      [a.title, a.artist, a.venue, a.tags.join(' ')],
      searchQueries.audio
    )
  );

  const filteredPhotos = photos.filter((p) =>
    matchFlatQuery(
      [p.title, p.photographer, p.venue, p.year, p.tags.join(' ')],
      searchQueries.photos
    )
  );

  const filteredArtists = artists.filter((a) =>
    matchFlatQuery(
      [a.name, a.role, a.genre, a.area, a.tags.join(' ')],
      searchQueries.artists
    )
  );

  const sortedRemembered = rememberedPlaces
    .slice()
    .sort((a, b) =>
      rememberSort === 'asc'
        ? a.closedSortIso.localeCompare(b.closedSortIso)
        : b.closedSortIso.localeCompare(a.closedSortIso)
    )
    .filter((p) =>
      matchFlatQuery(
        [
          p.name,
          p.closedDisplayLabel,
          p.location,
          p.memorialStory,
          p.tags.join(' '),
        ],
        searchQueries.remembered
      )
    );

  const filteredAuctions = auctions.filter((a) =>
    matchFlatQuery(
      [a.title, a.ownerUsername, a.tags.join(' '), a.sold ? 'sold' : 'live'],
      searchQueries.auction
    )
  );

  const primaryMobileTabs: PublicArchiveSection[] = [
    'videos',
    'audio',
    'calendar',
    'timeline',
  ];

  const renderInlinePuckSlot = (slotSlug: string) => {
    const slot = puckPages.find((p) => p.slug === slotSlug);
    const hasBlocks = Boolean(slot?.puckData?.content?.length);
    if (!hasBlocks && !isCuratorUnlocked) return null;

    return (
      <div className="mb-5">
        {isCuratorUnlocked && (
          <div className="flex justify-end mb-2">
            <Link
              href={`/admin/editor/${encodeURIComponent(slotSlug)}`}
              prefetch={false}
              className="typo-action typo-action-accent"
            >
              <span>Edit Slot ({slotSlug})</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        )}
        {hasBlocks && slot && <PuckStaticRenderer data={slot.puckData} />}
      </div>
    );
  };

  const showMiniDock =
    activeTab !== 'audio' &&
    audioEngine.hasActivatedSession &&
    !audioEngine.miniDismissed;

  return (
    <>
      <audio
        ref={primaryAudioRef}
        src={audioEngine.resolvedStreamSrc || undefined}
        preload={audioEngine.hasActivatedSession ? 'metadata' : 'none'}
        onTimeUpdate={audioEngine.onAudioTimeUpdate}
        onEnded={audioEngine.onAudioEnded}
      />
      {audioEngine.hasActivatedSession &&
        audioEngine.isPlaying &&
        audioEngine.preloadNextSrc && (
          <audio
            src={audioEngine.preloadNextSrc}
            preload="metadata"
            className="hidden"
          />
        )}

      {/* ==================== CLEAN 2-ZONE SPECULAR FROSTED MASTHEAD ==================== */}
      <header className="masthead">
        <div className="brand-wrap">
          <SeasonEmblem season={siteSettings.seasonTheme} />
          <h1 className="brand-title whitespace-nowrap">
            Greenville DIY Archive
          </h1>
        </div>

        <div className="top-bar-actions">
          <button
            type="button"
            className="typo-action"
            onClick={() =>
              setContrast((c) => (c === 'dark' ? 'light' : 'dark'))
            }
          >
            {contrast === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </header>

      {/* ==================== DESKTOP 2-COLUMN SHELL ==================== */}
      <div className="shell-grid">
        {/* Desktop Specular Frosted Left Index Rail (01–08 Coordinates) + Subtle Bottom Admin Link */}
        <aside className="left-rail" aria-label="Archive Navigation">
          <div>
            <div className="rail-label">Index · 01–08</div>
            <ul className="nav-list">
              <li>
                <button
                  type="button"
                  className="nav-btn"
                  aria-current={activeTab === 'videos' ? 'page' : undefined}
                  onClick={() => switchSection('videos')}
                >
                  <span className="inline-flex items-center gap-2.5 min-w-0">
                    <span className="nav-idx">01</span>
                    <span className="truncate">Videos</span>
                  </span>
                  <span className="nav-cnt tabular-nums">{videos.length}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="nav-btn"
                  aria-current={activeTab === 'audio' ? 'page' : undefined}
                  onClick={() => switchSection('audio')}
                >
                  <span className="inline-flex items-center gap-2.5 min-w-0">
                    <span className="nav-idx">02</span>
                    <span className="truncate">Audio (FLAC)</span>
                  </span>
                  <span className="nav-cnt tabular-nums">
                    {audioTracks.length}
                  </span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="nav-btn"
                  aria-current={activeTab === 'photos' ? 'page' : undefined}
                  onClick={() => switchSection('photos')}
                >
                  <span className="inline-flex items-center gap-2.5 min-w-0">
                    <span className="nav-idx">03</span>
                    <span className="truncate">Photos</span>
                  </span>
                  <span className="nav-cnt tabular-nums">{photos.length}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="nav-btn"
                  aria-current={activeTab === 'artists' ? 'page' : undefined}
                  onClick={() => switchSection('artists')}
                >
                  <span className="inline-flex items-center gap-2.5 min-w-0">
                    <span className="nav-idx">04</span>
                    <span className="truncate">Artists</span>
                  </span>
                  <span className="nav-cnt tabular-nums">{artists.length}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="nav-btn"
                  aria-current={activeTab === 'calendar' ? 'page' : undefined}
                  onClick={() => switchSection('calendar')}
                >
                  <span className="inline-flex items-center gap-2.5 min-w-0">
                    <span className="nav-idx">05</span>
                    <span className="truncate">Calendar</span>
                  </span>
                  <span className="nav-cnt tabular-nums">
                    {calendarEvents.length}
                  </span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="nav-btn"
                  aria-current={activeTab === 'timeline' ? 'page' : undefined}
                  onClick={() => switchSection('timeline')}
                >
                  <span className="inline-flex items-center gap-2.5 min-w-0">
                    <span className="nav-idx">06</span>
                    <span className="truncate">Timeline</span>
                  </span>
                  <span className="nav-cnt tabular-nums">
                    {timelineEras.length}
                  </span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="nav-btn"
                  aria-current={activeTab === 'remembered' ? 'page' : undefined}
                  onClick={() => switchSection('remembered')}
                >
                  <span className="inline-flex items-center gap-2.5 min-w-0">
                    <span className="nav-idx">07</span>
                    <span className="truncate">Remembered</span>
                  </span>
                  <span className="nav-cnt tabular-nums">
                    {rememberedPlaces.length}
                  </span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="nav-btn"
                  aria-current={activeTab === 'auction' ? 'page' : undefined}
                  onClick={() => switchSection('auction')}
                >
                  <span className="inline-flex items-center gap-2.5 min-w-0">
                    <span className="nav-idx">08</span>
                    <span className="truncate">Auctions</span>
                  </span>
                  <span className="nav-cnt tabular-nums">
                    {auctions.length}
                  </span>
                </button>
              </li>
            </ul>
          </div>

          <div className="border-t border-[var(--grid-hairline-strong)]">
            <Link
              href="/admin"
              prefetch={false}
              className="nav-btn text-xs text-[var(--ink-mono)] hover:text-[var(--ink-primary)]"
            >
              <span className="inline-flex items-center gap-2">
                <Lock className="w-3 h-3 text-[var(--accent)]" />
                <span>{isCuratorUnlocked ? 'Admin · Unlocked' : 'Admin'}</span>
              </span>
              <ArrowUpRight className="w-3 h-3 text-[var(--ink-mono)]" />
            </Link>
          </div>
        </aside>

        {/* Main Fluid Right Workspace */}
        <main className="workspace">
          {/* ==================== 1. VIDEOS VIEW ==================== */}
          {activeTab === 'videos' && (
            <div>
              {renderInlinePuckSlot('slot:videos-top')}

              <div className="sec-head">
                <div>
                  <div className="sec-kicker">
                    01 / 08 · Unlisted DIY Tapes &amp; Skate Parts
                  </div>
                  <h2 className="sec-title">Videos</h2>
                </div>
              </div>

              {renderSearchAndTags(
                'videos',
                'Filter Videos by Band, Spot, or Filmer',
                [
                  'poe-mill',
                  'the-barn',
                  'skate',
                  'rocco-and-his-bones',
                  'velo-fellow',
                  'vernon',
                ]
              )}

              {activeVideo && (
                <LiquidGlassStage
                  radius={12}
                  bezel={18}
                  thickness={14}
                  specular={0.74}
                  className="mb-6"
                  contentClassName="p-5 sm:p-6"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div className="lg:col-span-7 relative aspect-video bg-black border border-[var(--grid-hairline-strong)] overflow-hidden">
                      {vidLiveEmbedMode ? (
                        <iframe
                          title={activeVideo.title}
                          src={`https://www.youtube-nocookie.com/embed/${activeVideo.youtubeUnlistedId}?start=${vidSeekSeconds}&autoplay=1&rel=0&modestbranding=1`}
                          sandbox="allow-scripts allow-same-origin allow-presentation"
                          loading="lazy"
                          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full border-none"
                        />
                      ) : (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={activeVideo.posterUrl}
                            alt={activeVideo.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover opacity-90"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent pt-8 pb-3 px-3.5 text-white font-mono text-xs flex justify-between items-center gap-3">
                            <span className="truncate">{vidSeekText}</span>
                            <button
                              type="button"
                              className="btn-arch btn-cta-bright shrink-0"
                              onClick={() => setVidLiveEmbedMode(true)}
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Play Tape</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="lg:col-span-5 flex flex-col justify-between gap-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-[var(--mute)] mb-1 tabular-nums">
                            {activeVideo.venue} · {activeVideo.recordedDate} ·{' '}
                            {activeVideo.filmer}
                          </div>
                          <h3 className="plate-title m-0 text-base sm:text-lg text-balance">
                            {activeVideo.title}
                          </h3>
                        </div>
                        <div className="inline-flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              void copyShareLink({
                                tab: 'videos',
                                item: activeVideo.id,
                                t: vidSeekSeconds > 0 ? vidSeekSeconds : undefined,
                                key: `vid-stage:${activeVideo.id}`,
                              })
                            }
                            className={`btn-arch !py-1 !px-2.5 !text-[10.5px] font-mono tabular-nums whitespace-nowrap ${
                              copiedLinkKey === `vid-stage:${activeVideo.id}`
                                ? 'active'
                                : ''
                            }`}
                          >
                            {copiedLinkKey === `vid-stage:${activeVideo.id}`
                              ? '[ COPIED ]'
                              : '[ COPY LINK ]'}
                          </button>
                          {vidLiveEmbedMode && (
                            <button
                              type="button"
                              className="typo-action shrink-0"
                              onClick={() => setVidLiveEmbedMode(false)}
                            >
                              Poster
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col mt-1 border-t border-[var(--glass-border)]">
                        {activeVideo.timestamps.map((ts) => {
                          const isCurrent = vidSeekSeconds === ts.sec;
                          const rowKey = `vid-ts:${activeVideo.id}:${ts.sec}`;
                          return (
                            <div
                              key={`${ts.time}-${ts.sec}`}
                              className={`chapter-row ${
                                isCurrent ? 'active' : ''
                              }`}
                            >
                              <button
                                type="button"
                                aria-pressed={isCurrent}
                                className={`chapter-trigger tabular-nums ${
                                  isCurrent ? 'active' : ''
                                }`}
                                onClick={() => {
                                  setVidSeekText(`${ts.time} — ${ts.label}`);
                                  setVidSeekSeconds(ts.sec);
                                }}
                              >
                                <span className="chapter-time shrink-0 font-semibold">
                                  {ts.time}
                                </span>
                                <span className="truncate">{ts.label}</span>
                              </button>
                              <button
                                type="button"
                                title={`Copy link to ${ts.time} — ${ts.label}`}
                                onClick={() => {
                                  setVidSeekText(`${ts.time} — ${ts.label}`);
                                  setVidSeekSeconds(ts.sec);
                                  void copyShareLink({
                                    tab: 'videos',
                                    item: activeVideo.id,
                                    t: ts.sec > 0 ? ts.sec : undefined,
                                    key: rowKey,
                                  });
                                }}
                                className={`btn-arch !py-0.5 !px-2 !text-[10px] font-mono tabular-nums whitespace-nowrap shrink-0 ${
                                  copiedLinkKey === rowKey ? 'active' : ''
                                }`}
                              >
                                {copiedLinkKey === rowKey
                                  ? '[ COPIED ]'
                                  : '[ COPY LINK ]'}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          aria-pressed={videoNotesOpen}
                          className={`typo-action tabular-nums ${
                            videoNotesOpen ? 'active' : ''
                          }`}
                          onClick={() => setVideoNotesOpen((o) => !o)}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>
                            Notes ({(commentsByItem[activeVideo.id] || []).length})
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {renderCollapsibleVideoNotes(activeVideo.id)}
                </LiquidGlassStage>
              )}

              <div className="brutal-grid">
                {filteredVideos.map((v, vIdx) => {
                  const isSelected = activeVideo?.id === v.id;
                  const selectCard = () => {
                    setSelectedVidId(v.id);
                    const first = v.timestamps[0];
                    if (first) {
                      setVidSeekText(`${first.time} — ${first.label}`);
                      setVidSeekSeconds(first.sec);
                    }
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  };

                  return (
                    <article
                      key={v.id}
                      role="button"
                      tabIndex={0}
                      onClick={selectCard}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectCard();
                        }
                      }}
                      className={`arch-plate cursor-pointer ${
                        isSelected ? 'is-selected' : ''
                      }`}
                    >
                      <div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={v.posterUrl}
                          alt={v.title}
                          referrerPolicy="no-referrer"
                          className="thumb-16x9"
                          loading="lazy"
                        />
                        <div className="card-pad">
                          <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-[var(--ink-mono)] tabular-nums">
                            <span className="truncate">
                              {String(vIdx + 1).padStart(2, '0')} · {v.venue} ·{' '}
                              {v.recordedDate}
                            </span>
                            {isSelected ? (
                              <span className="status-stamp status-live">
                                Playing
                              </span>
                            ) : (
                              <span>{v.timestamps.length} clips</span>
                            )}
                          </div>
                          <h3 className="mt-1.5 mb-1.5 text-sm font-bold leading-snug text-balance">
                            {v.title}
                          </h3>
                          <div className="font-mono text-[11px] text-[var(--ink-mono)] truncate">
                            {v.tags
                              .slice(0, 4)
                              .map((t) => `#${t}`)
                              .join(' · ')}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================== 2. SAMPLY-INSPIRED LOSSLESS AUDIO (FLAC) ==================== */}
          {activeTab === 'audio' && (
            <SamplyFlacDeck
              engine={audioEngine}
              tracks={audioTracks}
              filteredTracks={filteredAudio}
              submissionEmail={siteSettings.archiveSubmissionEmail}
              commentsByItem={commentsByItem}
              onAddComment={postCommentApi}
              onVoteComment={voteCommentApi}
              onReplyComment={replyCommentApi}
              onCopyShareLink={(p) => void copyShareLink(p)}
              copiedLinkKey={copiedLinkKey}
              searchSlot={renderSearchAndTags(
                'audio',
                'Filter Lossless Recordings by Band or Venue',
                [
                  'curly-blue',
                  'rocco-and-his-bones',
                  'the-barn',
                  'marietta',
                  'flac',
                ]
              )}
            />
          )}

          {/* ==================== 3. PHOTOS VIEW (FLUSH 3:2 35MM CONTACT SHEET) ==================== */}
          {activeTab === 'photos' && (
            <div>
              <div className="sec-head">
                <div>
                  <div className="sec-kicker">
                    03 / 08 · 35mm Contact Sheet &amp; Darkroom Scans
                  </div>
                  <h2 className="sec-title">Photos</h2>
                </div>
                <a
                  href={`mailto:${siteSettings.archiveSubmissionEmail}?subject=DIY%20Photo%20Scans`}
                  className="typo-action typo-action-accent"
                >
                  <span>+ Submit Scans</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
              {renderSearchAndTags(
                'photos',
                'Filter 35mm Photo Plates by Venue or Photographer',
                ['poe-mill', 'the-barn', 'velo-fellow', '35mm', 'skate']
              )}
              <div className="brutal-grid-photos">
                {filteredPhotos.map((p, pIdx) => {
                  const isSpot = spotlightItemId === p.id;
                  const copyKey = `pho:${p.id}`;
                  return (
                    <article
                      key={p.id}
                      id={`archive-item-${p.id}`}
                      onClick={() => setSpotlightItemId(p.id)}
                      className={`arch-plate cursor-pointer ${
                        isSpot ? 'is-selected' : ''
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.imageUrl}
                        alt={p.title}
                        referrerPolicy="no-referrer"
                        className="thumb-3x2"
                        loading="lazy"
                      />
                      <div className="card-pad flex flex-col gap-2">
                        <div className="font-mono text-[11px] text-[var(--ink-mono)] tabular-nums">
                          {String(pIdx + 1).padStart(2, '0')} · {p.venue} ·{' '}
                          {p.year} · {p.photographer}
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <h3 className="m-0 text-sm font-bold leading-snug text-balance">
                            {p.title}
                          </h3>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSpotlightItemId(p.id);
                              void copyShareLink({
                                tab: 'photos',
                                item: p.id,
                                key: copyKey,
                              });
                            }}
                            className={`btn-arch !py-1 !px-2 !text-[10px] font-mono tabular-nums whitespace-nowrap shrink-0 ${
                              copiedLinkKey === copyKey ? 'active' : ''
                            }`}
                          >
                            {copiedLinkKey === copyKey
                              ? '[ COPIED ]'
                              : '[ COPY LINK ]'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================== 4. BANDS & ARTISTS VIEW ==================== */}
          {activeTab === 'artists' && (
            <div>
              <div className="sec-head">
                <div>
                  <div className="sec-kicker">
                    04 / 08 · Upstate Bands, Photographers &amp; Collectives
                  </div>
                  <h2 className="sec-title">Artists</h2>
                </div>
              </div>
              {renderSearchAndTags(
                'artists',
                'Filter Bands, Musicians & Photographers',
                [
                  'active',
                  'inactive',
                  'band',
                  'photographer',
                  'punk-rock',
                  'greenville',
                  'marietta',
                  'asheville',
                ]
              )}
              <div className="table-wrap">
                <table className="clean-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Name</th>
                      <th>Role / Genre</th>
                      <th>Area</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArtists.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span
                            className={`status-stamp ${
                              a.active ? 'status-active' : 'status-muted'
                            }`}
                          >
                            {a.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <strong>{a.name}</strong>
                        </td>
                        <td>
                          {a.role} ·{' '}
                          <span className="text-[var(--ink-mono)]">
                            {a.genre}
                          </span>
                        </td>
                        <td className="font-mono text-xs">{a.area}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==================== 5. CALENDAR VIEW ==================== */}
          {activeTab === 'calendar' && (
            <MonthFlyerCalendar
              events={calendarEvents}
              submissionEmail={siteSettings.calendarSubmissionEmail}
              initialMonthKey={
                initialSection === 'calendar'
                  ? initialDeepLink?.monthKey
                  : undefined
              }
              initialEventId={
                initialSection === 'calendar'
                  ? initialDeepLink?.itemId
                  : undefined
              }
              onSelectionChange={(mKey, evId) => {
                setCalActiveMonth(mKey);
                setCalActiveEventId(evId);
              }}
              onCopyShareLink={(p) => void copyShareLink(p)}
              copiedLinkKey={copiedLinkKey}
            />
          )}

          {/* ==================== 6. TIMELINE VIEW ==================== */}
          {activeTab === 'timeline' && (
            <TactilePortholeTimeline eras={timelineEras} />
          )}

          {/* ==================== 7. PLACES TO REMEMBER VIEW ==================== */}
          {activeTab === 'remembered' && (
            <div>
              {renderInlinePuckSlot('slot:remembered-top')}

              <div className="sec-head">
                <div>
                  <div className="sec-kicker">
                    07 / 08 · Closed Venues &amp; Skate Foundations
                  </div>
                  <h2 className="sec-title">Places to Remember</h2>
                </div>
                <button
                  type="button"
                  className="typo-action typo-action-accent tabular-nums"
                  onClick={() =>
                    setRememberSort((s) => (s === 'desc' ? 'asc' : 'desc'))
                  }
                >
                  {rememberSort === 'desc'
                    ? 'Newest Closed ↓'
                    : 'Oldest Closed ↑'}
                </button>
              </div>
              {renderSearchAndTags(
                'remembered',
                'Filter Closed Venues & Skateparks',
                ['velo-fellow', 'skate', 'west-end', 'venue']
              )}
              <div className="memorial-stack">
                {sortedRemembered.map((p, rIdx) => {
                  const isSpot = spotlightItemId === p.id;
                  const copyKey = `rem:${p.id}`;
                  return (
                    <article
                      key={p.id}
                      id={`archive-item-${p.id}`}
                      onClick={() => setSpotlightItemId(p.id)}
                      className={`memorial-block anim-in cursor-pointer ${
                        isSpot ? 'is-selected' : ''
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        referrerPolicy="no-referrer"
                        className="memorial-img"
                        loading="lazy"
                      />
                      <div className="memorial-body">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-mono text-[11px] text-[var(--ink-mono)] tabular-nums">
                            {String(rIdx + 1).padStart(2, '0')} ·{' '}
                            {p.closedDisplayLabel} · {p.location}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSpotlightItemId(p.id);
                              void copyShareLink({
                                tab: 'remembered',
                                item: p.id,
                                key: copyKey,
                              });
                            }}
                            className={`btn-arch !py-1 !px-2.5 !text-[10.5px] font-mono tabular-nums whitespace-nowrap shrink-0 ${
                              copiedLinkKey === copyKey ? 'active' : ''
                            }`}
                          >
                            {copiedLinkKey === copyKey
                              ? '[ COPIED ]'
                              : '[ COPY LINK ]'}
                          </button>
                        </div>
                        <h3 className="plate-title m-0 text-lg">{p.name}</h3>
                        <p className="m-0 text-sm text-[var(--ink-2)] leading-relaxed">
                          {p.memorialStory}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================== 8. MONTHLY AUCTIONS (THE BARTER MARKET) ==================== */}
          {activeTab === 'auction' && (
            <div>
              {renderInlinePuckSlot('slot:auctions-top')}

              <div className="sec-head">
                <div>
                  <div className="sec-kicker">
                    08 / 08 · The Barter Market · 0% Platform Cut
                  </div>
                  <h2 className="sec-title">Auctions</h2>
                </div>
                {(() => {
                  const safeListWorkHref = sanitizeSafeHref(
                    `mailto:${String(siteSettings.auctionSubmissionEmail || '').trim()}?subject=Artist%20Auction%20Submission`
                  );
                  return safeListWorkHref ? (
                    <a
                      href={safeListWorkHref}
                      className="typo-action typo-action-accent"
                    >
                      <span>+ List Work</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="typo-action opacity-50 cursor-not-allowed select-none"
                    >
                      + List Work
                    </button>
                  );
                })()}
              </div>
              {renderSearchAndTags(
                'auction',
                'Filter Barter Market Artifacts',
                ['glass', 'pedal', 'print', 'live', 'sold']
              )}
              <div className="brutal-grid">
                {filteredAuctions.map((a) => {
                  const safeIgHref = sanitizeSafeHref(a.igPermalink);
                  const isExternalIg =
                    safeIgHref !== null && /^https?:\/\//i.test(safeIgHref);
                  const isSpot = spotlightItemId === a.id;
                  const copyKey = `auc:${a.id}`;

                  const mediaAndHeading = (
                    <>
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.imageUrl}
                          alt={a.title}
                          referrerPolicy="no-referrer"
                          className="thumb-16x9"
                          loading="lazy"
                        />
                        <span
                          className={`plate-corner-scrim ${
                            a.sold ? 'is-sold' : 'is-live'
                          }`}
                        >
                          {a.sold ? 'SOLD' : 'LIVE · 0% FEE'}
                        </span>
                      </div>
                      <div className="px-4 pt-3.5 pb-2">
                        <div className="font-mono text-[11px] text-[var(--ink-mono)]">
                          @{a.ownerUsername.replace(/^@/, '')} · {a.pickupArea}
                        </div>
                        <h3 className="mt-1.5 mb-0 text-sm font-bold leading-snug text-[var(--ink-primary)] text-balance">
                          {a.title}
                        </h3>
                      </div>
                    </>
                  );

                  return (
                    <article
                      key={a.id}
                      id={`archive-item-${a.id}`}
                      onClick={() => setSpotlightItemId(a.id)}
                      className={`arch-plate group ${
                        isSpot ? 'is-selected' : ''
                      }`}
                    >
                      {safeIgHref ? (
                        <a
                          href={safeIgHref}
                          target={isExternalIg ? '_blank' : undefined}
                          rel={isExternalIg ? 'noopener noreferrer' : undefined}
                          className="block text-inherit hover:no-underline"
                        >
                          {mediaAndHeading}
                        </a>
                      ) : (
                        <div className="block text-inherit">
                          {mediaAndHeading}
                        </div>
                      )}

                      <div className="px-4 pb-3.5 pt-2 mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[var(--grid-hairline)]">
                        <span className="font-mono text-xs font-bold text-[var(--accent)] tabular-nums">
                          {a.currentBidLabel}
                        </span>
                        <div className="inline-flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSpotlightItemId(a.id);
                              void copyShareLink({
                                tab: 'auction',
                                item: a.id,
                                key: copyKey,
                              });
                            }}
                            className={`btn-arch !py-1 !px-2 !text-[10px] font-mono tabular-nums whitespace-nowrap ${
                              copiedLinkKey === copyKey ? 'active' : ''
                            }`}
                          >
                            {copiedLinkKey === copyKey
                              ? '[ COPIED ]'
                              : '[ COPY LINK ]'}
                          </button>
                          {safeIgHref ? (
                            <a
                              href={safeIgHref}
                              target={isExternalIg ? '_blank' : undefined}
                              rel={
                                isExternalIg ? 'noopener noreferrer' : undefined
                              }
                              className="typo-action typo-action-accent !py-0"
                            >
                              <span>{a.sold ? 'View Post' : 'Bid on IG'}</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <span className="typo-action !py-0 opacity-50 cursor-not-allowed select-none">
                              Link Unavailable
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ==================== CONCISE FROSTED MOBILE BOTTOM NAVIGATION BAR ==================== */}
      {mobileMoreOpen && (
        <div className="mobile-more-sheet" aria-label="More Sections">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`btn-arch min-h-[44px] justify-between ${
                activeTab === 'photos' ? 'active' : ''
              }`}
              onClick={() => switchSection('photos')}
            >
              <span>03 · Photos</span>
              <span className="tabular-nums opacity-75">{photos.length}</span>
            </button>
            <button
              type="button"
              className={`btn-arch min-h-[44px] justify-between ${
                activeTab === 'artists' ? 'active' : ''
              }`}
              onClick={() => switchSection('artists')}
            >
              <span>04 · Artists</span>
              <span className="tabular-nums opacity-75">{artists.length}</span>
            </button>
            <button
              type="button"
              className={`btn-arch min-h-[44px] justify-between ${
                activeTab === 'remembered' ? 'active' : ''
              }`}
              onClick={() => switchSection('remembered')}
            >
              <span>07 · Remembered</span>
              <span className="tabular-nums opacity-75">
                {rememberedPlaces.length}
              </span>
            </button>
            <button
              type="button"
              className={`btn-arch min-h-[44px] justify-between ${
                activeTab === 'auction' ? 'active' : ''
              }`}
              onClick={() => switchSection('auction')}
            >
              <span>08 · Auctions</span>
              <span className="tabular-nums opacity-75">{auctions.length}</span>
            </button>
            <Link
              href="/admin"
              prefetch={false}
              className="btn-arch col-span-2 min-h-[44px] justify-between"
              onClick={() => setMobileMoreOpen(false)}
            >
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>
                  {isCuratorUnlocked
                    ? 'Admin Manager · Unlocked'
                    : 'Admin Manager'}
                </span>
              </span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      <nav className="mobile-bottom-nav" aria-label="Mobile Primary Navigation">
        <button
          type="button"
          className={`mob-nav-btn ${activeTab === 'videos' ? 'active' : ''}`}
          onClick={() => switchSection('videos')}
        >
          <Play className="w-4 h-4" />
          <span>Videos</span>
        </button>
        <button
          type="button"
          className={`mob-nav-btn ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => switchSection('audio')}
        >
          <Music className="w-4 h-4" />
          <span>FLAC</span>
        </button>
        <button
          type="button"
          className={`mob-nav-btn ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => switchSection('calendar')}
        >
          <Calendar className="w-4 h-4" />
          <span>Calendar</span>
        </button>
        <button
          type="button"
          className={`mob-nav-btn ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => switchSection('timeline')}
        >
          <Clock className="w-4 h-4" />
          <span>Timeline</span>
        </button>
        <button
          type="button"
          className={`mob-nav-btn ${
            !primaryMobileTabs.includes(activeTab) || mobileMoreOpen
              ? 'active'
              : ''
          }`}
          onClick={() => setMobileMoreOpen((o) => !o)}
        >
          <Menu className="w-4 h-4" />
          <span>More</span>
        </button>
      </nav>

      {/* ==================== PERSISTENT DOCKED LOSSLESS MINI-PLAYER ==================== */}
      {showMiniDock && (
        <DockedLosslessMiniPlayer
          engine={audioEngine}
          onOpenDeck={() => switchSection('audio')}
        />
      )}

      {/* ==================== COLLAPSIBLE OPTICAL LIQUID-GLASS SCENE DOCK ==================== */}
      <section
        className={`corner-dock-pos ${showMiniDock ? 'with-mini-dock' : ''}`}
        aria-label="Scene Room and Contact"
      >
        <LiquidGlassStage radius={9} bezel={15} thickness={13} specular={0.72}>
          <div
            className="dock-bar"
            role="button"
            tabIndex={0}
            aria-expanded={dockOpen}
            onClick={() => setDockOpen((o) => !o)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setDockOpen((o) => !o);
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Scene Room</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[var(--mute)]">
              {dockOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </span>
          </div>

          {dockOpen && (
            <div>
              <div className="dock-tabs" role="tablist">
                <button
                  type="button"
                  className={`dock-tab ${dockTab === 'chat' ? 'active' : ''}`}
                  onClick={() => setDockTab('chat')}
                >
                  Live Chat
                </button>
                <button
                  type="button"
                  className={`dock-tab ${dockTab === 'qa' ? 'active' : ''}`}
                  onClick={() => setDockTab('qa')}
                >
                  Q&amp;A
                </button>
                <button
                  type="button"
                  className={`dock-tab ${dockTab === 'msg' ? 'active' : ''}`}
                  onClick={() => setDockTab('msg')}
                >
                  Message Us
                </button>
              </div>

              <div className="dock-pane">
                {dockTab === 'chat' && (
                  <>
                    <div className="scroll-log">
                      {chatLog.map((m, idx) => (
                        <div key={m.id || idx}>
                          <strong className="font-mono text-[var(--accent)]">
                            {m.who}
                          </strong>{' '}
                          <span className="text-[10px] text-[var(--mute)] tabular-nums">
                            {m.time}
                          </span>
                          : {m.msg}
                        </div>
                      ))}
                    </div>
                    <form
                      onSubmit={handleSendChat}
                      className="grid grid-cols-12 items-end gap-1.5 pt-1 border-t border-[var(--glass-border)]"
                    >
                      <div className="field-group col-span-4">
                        <label htmlFor="scene-chat-handle" className="field-label">
                          Handle
                        </label>
                        <input
                          id="scene-chat-handle"
                          type="text"
                          value={chatNick}
                          onChange={(e) => setChatNick(e.target.value)}
                          className="input-clean py-1.5 px-2"
                        />
                      </div>
                      <div className="field-group col-span-6">
                        <label htmlFor="scene-chat-msg" className="field-label">
                          Message
                        </label>
                        <input
                          id="scene-chat-msg"
                          type="text"
                          required
                          value={chatMsgInput}
                          onChange={(e) => setChatMsgInput(e.target.value)}
                          placeholder=""
                          className="input-clean py-1.5 px-2"
                        />
                      </div>
                      <div className="col-span-2 flex">
                        <button
                          type="submit"
                          className="btn-arch btn-cta-bright w-full py-1.5 px-2"
                        >
                          Send
                        </button>
                      </div>
                    </form>
                  </>
                )}

                {dockTab === 'qa' && (
                  <>
                    <div className="scroll-log">
                      {qaLog.map((m, idx) => (
                        <div
                          key={idx}
                          className={`px-2.5 py-1.5 rounded-[var(--r-xs)] ${
                            m.role === 'bot'
                              ? 'bg-[var(--glass-pill)]'
                              : 'bg-[var(--accent-soft)]'
                          }`}
                        >
                          <strong>{m.role === 'bot' ? 'Guide:' : 'You:'}</strong>{' '}
                          {m.text}
                        </div>
                      ))}
                    </div>
                    <div className="pt-1 border-t border-[var(--glass-border)]">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-2">
                        {[
                          { label: 'Start band', q: 'Start a band?' },
                          { label: 'Book show', q: 'Book a show?' },
                          { label: 'FLAC', q: 'Submit FLAC audio?' },
                          { label: 'Poe Mill', q: 'Poe Mill etiquette?' },
                          { label: 'Auctions', q: 'IG Auction rules?' },
                        ].map((chip) => (
                          <button
                            key={chip.label}
                            type="button"
                            className="typo-action !py-0.5 !text-[10.5px]"
                            onClick={() => handleAskQa(chip.q)}
                          >
                            #{chip.label}
                          </button>
                        ))}
                      </div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleAskQa(qaInput);
                        }}
                        className="flex items-end gap-1.5"
                      >
                        <div className="field-group flex-1">
                          <label htmlFor="scene-qa-input" className="field-label">
                            Ask Scene Question
                          </label>
                          <input
                            id="scene-qa-input"
                            type="text"
                            required
                            value={qaInput}
                            onChange={(e) => setQaInput(e.target.value)}
                            placeholder=""
                            className="input-clean py-1.5 px-2"
                          />
                        </div>
                        <button
                          type="submit"
                          className="btn-arch btn-cta-bright py-1.5 px-3"
                        >
                          Ask
                        </button>
                      </form>
                    </div>
                  </>
                )}

                {dockTab === 'msg' && (
                  <form
                    onSubmit={handleSendMessageUs}
                    className="flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center justify-between gap-2 pb-1 border-b border-[var(--glass-border)]">
                      <a
                        href={`mailto:${siteSettings.archiveSubmissionEmail}`}
                        className="typo-action typo-action-accent !text-[10.5px]"
                      >
                        <span>Email Archive</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </a>
                      <a
                        href={`mailto:${siteSettings.auctionSubmissionEmail}`}
                        className="typo-action typo-action-accent !text-[10.5px]"
                      >
                        <span>Email Barter Market</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="grid grid-cols-12 gap-1.5">
                      <div className="field-group col-span-5">
                        <label htmlFor="scene-msg-name" className="field-label">
                          Name / Handle
                        </label>
                        <input
                          id="scene-msg-name"
                          type="text"
                          required
                          value={msgName}
                          onChange={(e) => setMsgName(e.target.value)}
                          placeholder=""
                          className="input-clean py-1.5 px-2"
                        />
                      </div>
                      <div className="field-group col-span-7">
                        <label htmlFor="scene-msg-email" className="field-label">
                          Email Address
                        </label>
                        <input
                          id="scene-msg-email"
                          type="email"
                          required
                          value={msgEmail}
                          onChange={(e) => setMsgEmail(e.target.value)}
                          placeholder=""
                          className="input-clean py-1.5 px-2"
                        />
                      </div>
                    </div>
                    <div className="field-group">
                      <label htmlFor="scene-msg-interests" className="field-label">
                        Message &amp; Scene Interests
                      </label>
                      <textarea
                        id="scene-msg-interests"
                        required
                        value={msgInterests}
                        onChange={(e) => {
                          setMsgInterests(e.target.value);
                          e.currentTarget.style.height = 'auto';
                          e.currentTarget.style.height = `${Math.min(
                            110,
                            e.currentTarget.scrollHeight
                          )}px`;
                        }}
                        className="auto-textarea !min-h-[48px]"
                        placeholder=""
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn-arch btn-cta-bright w-full"
                    >
                      Send Message
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </LiquidGlassStage>
      </section>

      {toastMsg && (
        <div className="toast-banner" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </>
  );
}
