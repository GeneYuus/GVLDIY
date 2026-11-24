// components/audio/useLosslessAudioEngine.tsx
'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { FlacRecording, FlacVersionSource } from '@/types/archive';
import { getPreviewWavUrl } from '@/lib/audio/pcm-wav-preview';

const emptySubscribe = () => () => {};

export interface LosslessAudioEngine {
  tracks: FlacRecording[];
  currentTrack: FlacRecording | null;
  activeVariant: FlacVersionSource | null;
  trackIdx: number;
  activeVersionIdx: number;
  isPlaying: boolean;
  progressPct: number;
  currentPlayheadSec: number;
  volume: number;
  muted: boolean;
  qualityMode: 'lossless' | 'aac';
  loudnessMatch: boolean;
  hasActivatedSession: boolean;
  miniDismissed: boolean;
  resolvedStreamSrc: string;
  preloadNextSrc: string;
  onAudioTimeUpdate: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  onAudioEnded: () => void;
  setDragging: (dragging: boolean) => void;
  setVolume: React.Dispatch<React.SetStateAction<number>>;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  setQualityMode: React.Dispatch<React.SetStateAction<'lossless' | 'aac'>>;
  setLoudnessMatch: React.Dispatch<React.SetStateAction<boolean>>;
  setProgressPct: React.Dispatch<React.SetStateAction<number>>;
  handleTogglePlay: () => void;
  selectTrack: (nextIdx: number, autoPlay?: boolean) => void;
  cueTrackAtSeconds: (nextIdx: number, seconds?: number) => void;
  handleSwitchVersion: (vIdx: number) => void;
  seekToPct: (pct: number) => void;
  dismissMiniPlayer: () => void;
}

export function formatAudioSec(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function useLosslessAudioEngine(
  tracks: FlacRecording[],
  initialCue?: { itemId?: string; timeSec?: number }
): [LosslessAudioEngine, React.RefObject<HTMLAudioElement | null>] {
  const primaryAudioRef = useRef<HTMLAudioElement | null>(null);
  const isDraggingRef = useRef(false);

  const resolvedInitialIdx = (() => {
    if (!initialCue?.itemId) return 0;
    const found = tracks.findIndex((t) => t.id === initialCue.itemId);
    return found >= 0 ? found : 0;
  })();

  const resolvedInitialTrack = tracks[resolvedInitialIdx] || tracks[0] || null;
  const resolvedInitialSec =
    typeof initialCue?.timeSec === 'number' &&
    Number.isFinite(initialCue.timeSec) &&
    initialCue.timeSec > 0 &&
    resolvedInitialTrack
      ? Math.min(resolvedInitialTrack.durationSec, Math.floor(initialCue.timeSec))
      : 0;
  const resolvedInitialPct =
    resolvedInitialTrack &&
    resolvedInitialTrack.durationSec > 0 &&
    resolvedInitialSec > 0
      ? Math.min(100, (resolvedInitialSec / resolvedInitialTrack.durationSec) * 100)
      : 0;

  const pendingCueSecRef = useRef<number | null>(
    resolvedInitialSec > 0 ? resolvedInitialSec : null
  );

  const [trackIdx, setTrackIdx] = useState(resolvedInitialIdx);
  const [activeVersionIdx, setActiveVersionIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressPct, setProgressPct] = useState(resolvedInitialPct);
  const [volume, setVolume] = useState(85);
  const [muted, setMuted] = useState(false);
  const [qualityMode, setQualityMode] = useState<'lossless' | 'aac'>('lossless');
  const [loudnessMatch, setLoudnessMatch] = useState(true);
  const [hasActivatedSession, setHasActivatedSession] = useState(false);
  const [miniDismissed, setMiniDismissed] = useState(false);

  const setDragging = useCallback((dragging: boolean) => {
    isDraggingRef.current = dragging;
  }, []);

  const onAudioTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (isDraggingRef.current) return;
      const el = e.currentTarget;
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setProgressPct(Math.min(100, (el.currentTime / el.duration) * 100));
      }
    },
    []
  );

  const currentTrack = tracks[trackIdx] || tracks[0] || null;
  const nextTrack =
    tracks.length > 1 ? tracks[(trackIdx + 1) % tracks.length] : null;

  const activeVariant =
    currentTrack?.altVersions?.[activeVersionIdx] ||
    currentTrack?.altVersions?.[0] ||
    null;

  // Returns false during SSR and initial client hydration pass so <audio> tags match server HTML
  const isHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const resolvedStreamSrc = useMemo(() => {
    if (!currentTrack) return '';
    if (activeVariant?.streamUrl) return activeVariant.streamUrl;
    if (currentTrack.flacStreamUrl) return currentTrack.flacStreamUrl;
    if (!isHydrated) return '';
    return getPreviewWavUrl(
      currentTrack.previewRootHz || 196,
      activeVariant?.variantKind || 'primary',
      24
    );
  }, [currentTrack, activeVariant, isHydrated]);

  const preloadNextSrc = useMemo(() => {
    if (!nextTrack) return '';
    if (nextTrack.flacStreamUrl) return nextTrack.flacStreamUrl;
    if (!isHydrated) return '';
    return getPreviewWavUrl(nextTrack.previewRootHz || 196, 'primary', 24);
  }, [nextTrack, isHydrated]);

  // Apply volume + Samply Loudness Match (-14 LUFS target trim)
  useEffect(() => {
    const el = primaryAudioRef.current;
    if (!el || !currentTrack) return;
    if (muted) {
      el.volume = 0;
      return;
    }
    const baseVol = Math.max(0, Math.min(1, volume / 100));
    if (!loudnessMatch || typeof currentTrack.loudnessLufs !== 'number') {
      el.volume = baseVol;
      return;
    }
    const deltaDb = Math.min(0, -14 - currentTrack.loudnessLufs);
    const linearTrim = Math.pow(10, deltaDb / 20);
    el.volume = Math.max(0.15, Math.min(1, baseVol * linearTrim));
  }, [volume, muted, loudnessMatch, currentTrack]);

  useEffect(() => {
    const el = primaryAudioRef.current;
    return () => {
      el?.pause();
    };
  }, []);

  const applyPendingCueIfAny = (el: HTMLAudioElement) => {
    const targetSec = pendingCueSecRef.current;
    if (targetSec === null) return;
    const seekNow = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        const ratio = currentTrack?.durationSec
          ? Math.min(1, targetSec / currentTrack.durationSec)
          : 0;
        el.currentTime =
          currentTrack && Math.abs(el.duration - currentTrack.durationSec) > 4
            ? ratio * el.duration
            : Math.min(el.duration, targetSec);
      } else {
        el.currentTime = targetSec;
      }
      pendingCueSecRef.current = null;
    };
    if (el.readyState >= 1) {
      seekNow();
    } else {
      el.addEventListener('loadedmetadata', seekNow, { once: true });
    }
  };

  const playElement = async () => {
    const el = primaryAudioRef.current;
    if (!el) return;
    try {
      applyPendingCueIfAny(el);
      await el.play();
      setIsPlaying(true);
      setHasActivatedSession(true);
      setMiniDismissed(false);
    } catch {
      setIsPlaying(false);
    }
  };

  const handleTogglePlay = () => {
    const el = primaryAudioRef.current;
    if (!el) return;
    setHasActivatedSession(true);
    setMiniDismissed(false);
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      void playElement();
    }
  };

  const selectTrack = (nextIdx: number, autoPlay = true) => {
    if (tracks.length === 0) return;
    const normalized = (nextIdx + tracks.length) % tracks.length;
    pendingCueSecRef.current = null;
    setTrackIdx(normalized);
    setActiveVersionIdx(0);
    setProgressPct(0);
    setHasActivatedSession(true);
    setMiniDismissed(false);

    if (autoPlay) {
      setTimeout(() => {
        if (primaryAudioRef.current) {
          primaryAudioRef.current.currentTime = 0;
          void playElement();
        }
      }, 15);
    } else {
      primaryAudioRef.current?.pause();
      setIsPlaying(false);
    }
  };

  const cueTrackAtSeconds = (nextIdx: number, seconds = 0) => {
    if (tracks.length === 0) return;
    const normalized = (nextIdx + tracks.length) % tracks.length;
    const targetTrack = tracks[normalized];
    const safeSec =
      targetTrack && seconds > 0
        ? Math.min(targetTrack.durationSec, Math.floor(seconds))
        : 0;
    const pct =
      targetTrack && targetTrack.durationSec > 0 && safeSec > 0
        ? Math.min(100, (safeSec / targetTrack.durationSec) * 100)
        : 0;

    pendingCueSecRef.current = safeSec > 0 ? safeSec : null;
    primaryAudioRef.current?.pause();
    setIsPlaying(false);
    setTrackIdx(normalized);
    setActiveVersionIdx(0);
    setProgressPct(pct);
  };

  const handleSwitchVersion = (vIdx: number) => {
    if (vIdx === activeVersionIdx) return;
    const el = primaryAudioRef.current;
    const prevRatio =
      el && Number.isFinite(el.duration) && el.duration > 0
        ? el.currentTime / el.duration
        : progressPct / 100;
    const wasPlaying = isPlaying;

    setHasActivatedSession(true);
    setMiniDismissed(false);
    setActiveVersionIdx(vIdx);

    setTimeout(() => {
      const nextEl = primaryAudioRef.current;
      if (!nextEl) return;
      const restoreSeek = () => {
        if (Number.isFinite(nextEl.duration) && nextEl.duration > 0) {
          nextEl.currentTime = prevRatio * nextEl.duration;
        }
        if (wasPlaying) {
          void nextEl
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => {});
        }
      };
      if (nextEl.readyState >= 1) {
        restoreSeek();
      } else {
        nextEl.addEventListener('loadedmetadata', restoreSeek, { once: true });
      }
    }, 15);
  };

  const seekToPct = (pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    setProgressPct(clamped);
    setHasActivatedSession(true);
    pendingCueSecRef.current = null;
    const el = primaryAudioRef.current;
    if (el && Number.isFinite(el.duration) && el.duration > 0) {
      el.currentTime = (clamped / 100) * el.duration;
    } else if (currentTrack && currentTrack.durationSec > 0) {
      pendingCueSecRef.current = Math.floor(
        (clamped / 100) * currentTrack.durationSec
      );
    }
  };

  const dismissMiniPlayer = () => {
    primaryAudioRef.current?.pause();
    setIsPlaying(false);
    setMiniDismissed(true);
  };

  const onAudioEnded = () => {
    if (tracks.length > 1) {
      selectTrack((trackIdx + 1) % tracks.length, true);
    } else {
      dismissMiniPlayer();
    }
  };

  const currentPlayheadSec = currentTrack
    ? Math.floor((progressPct / 100) * currentTrack.durationSec)
    : 0;

  return [
    {
      tracks,
      currentTrack,
      activeVariant,
      trackIdx,
      activeVersionIdx,
      isPlaying,
      progressPct,
      currentPlayheadSec,
      volume,
      muted,
      qualityMode,
      loudnessMatch,
      hasActivatedSession,
      miniDismissed,
      resolvedStreamSrc,
      preloadNextSrc,
      onAudioTimeUpdate,
      onAudioEnded,
      setDragging,
      setVolume,
      setMuted,
      setQualityMode,
      setLoudnessMatch,
      setProgressPct,
      handleTogglePlay,
      selectTrack,
      cueTrackAtSeconds,
      handleSwitchVersion,
      seekToPct,
      dismissMiniPlayer,
    },
    primaryAudioRef,
  ];
}
