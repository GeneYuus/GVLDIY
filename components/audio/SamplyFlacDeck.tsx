// components/audio/SamplyFlacDeck.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Clock,
  MessageSquare,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { CommentNode, FlacRecording } from '@/types/archive';
import {
  formatAudioSec,
  LosslessAudioEngine,
} from '@/components/audio/useLosslessAudioEngine';
import LiquidGlassStage from '@/components/fx/LiquidGlassStage';

interface SamplyFlacDeckProps {
  engine: LosslessAudioEngine;
  tracks: FlacRecording[];
  filteredTracks: FlacRecording[];
  submissionEmail: string;
  commentsByItem: Record<string, CommentNode[]>;
  searchSlot?: React.ReactNode;
  onAddComment: (
    targetItemId: string,
    author: string,
    text: string,
    timestampSec?: number
  ) => Promise<void>;
  onVoteComment: (
    targetItemId: string,
    commentId: string,
    delta: 1 | -1
  ) => Promise<void>;
  onReplyComment: (
    targetItemId: string,
    commentId: string,
    author: string,
    text: string
  ) => Promise<void>;
}

export default function SamplyFlacDeck({
  engine,
  tracks,
  filteredTracks,
  submissionEmail,
  commentsByItem,
  searchSlot,
  onAddComment,
  onVoteComment,
  onReplyComment,
}: SamplyFlacDeckProps) {
  const {
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
    setDragging,
    setVolume,
    setMuted,
    setQualityMode,
    setLoudnessMatch,
    handleTogglePlay,
    selectTrack: engineSelectTrack,
    handleSwitchVersion,
    seekToPct,
  } = engine;

  const waveformRef = useRef<HTMLDivElement | null>(null);
  const optionsWrapRef = useRef<HTMLDivElement | null>(null);

  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [showSamplyIframe, setShowSamplyIframe] = useState(false);

  // Collapsed notes & time-coded wafer comments
  const [notesOpen, setNotesOpen] = useState(false);
  const [pinAtPlayhead, setPinAtPlayhead] = useState(true);
  const [noteAuthor, setNoteAuthor] = useState('');
  const [noteText, setNoteText] = useState('');
  const [activeWaferId, setActiveWaferId] = useState<string | null>(null);
  const [openReplyBoxes, setOpenReplyBoxes] = useState<Record<string, boolean>>({});
  const isLocalScrubbingRef = useRef(false);

  // Close options popover on outside click
  useEffect(() => {
    if (!optionsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        optionsWrapRef.current &&
        !optionsWrapRef.current.contains(e.target as Node)
      ) {
        setOptionsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [optionsOpen]);

  if (!currentTrack) return null;

  const trackComments = commentsByItem[currentTrack.id] || [];
  const waferComments = trackComments.filter(
    (c) => typeof c.timestampSec === 'number' && c.timestampSec >= 0
  );

  const bars =
    currentTrack.waveformPeaks && currentTrack.waveformPeaks.length > 0
      ? currentTrack.waveformPeaks
      : Array.from({ length: 72 }, (_, i) => 16 + ((i * 17) % 28));

  const selectTrack = (nextIdx: number, autoPlay = true) => {
    setActiveWaferId(null);
    setShowSamplyIframe(false);
    engineSelectTrack(nextIdx, autoPlay);
  };

  const seekByClientX = (clientX: number) => {
    const box = waveformRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return;
    const pct = ((clientX - box.left) / box.width) * 100;
    seekToPct(pct);
  };

  const handleSubmitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteAuthor.trim() || !noteText.trim()) return;
    const stamped = pinAtPlayhead ? currentPlayheadSec : undefined;
    await onAddComment(currentTrack.id, noteAuthor, noteText, stamped);
    setNoteText('');
  };

  const activeSpecText =
    qualityMode === 'lossless'
      ? activeVariant?.specLabel || currentTrack.specLabel
      : '256 kbps AAC';

  return (
    <div className="w-full min-w-0 max-w-full">
      <div className="sec-head">
        <div>
          <div className="sec-kicker">02 / 08 · 24-Bit / 48kHz Master Tapes</div>
          <h2 className="sec-title">Lossless Audio</h2>
        </div>
        <a
          href={`mailto:${submissionEmail}?subject=Upstate%20DIY%20Show%20Audio%20Submission`}
          className="typo-action typo-action-accent"
        >
          <span>+ Send Recording</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* ==================== OPTICAL LIQUID 3D LOSSLESS FLAC HERO DECK ==================== */}
      <LiquidGlassStage
        radius={12}
        bezel={18}
        thickness={14}
        specular={0.74}
        className="mb-6 w-full min-w-0 max-w-full"
        contentClassName="samply-deck !mb-0"
      >
        {/* Top Album-Centric Header — Stacks cleanly on narrow mobile viewports */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 w-full min-w-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="samply-art-frame w-14 h-14 sm:w-20 sm:h-20">
              {currentTrack.artworkUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={currentTrack.artworkUrl}
                  alt={currentTrack.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-[var(--accent-soft)]" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="font-mono text-[11px] sm:text-xs text-[var(--mute)] tabular-nums truncate">
                {currentTrack.artist} · {currentTrack.venue} ·{' '}
                <span className="text-[var(--accent)] font-semibold">
                  {activeSpecText}
                </span>
                {typeof currentTrack.loudnessLufs === 'number'
                  ? ` · ${currentTrack.loudnessLufs} LUFS`
                  : ''}
              </div>
              <h3 className="mt-1 mb-0 text-sm sm:text-lg font-bold tracking-tight line-clamp-2 sm:truncate">
                {currentTrack.title}
              </h3>
            </div>
          </div>

          {/* Unboxed Typographic A/B Mix Stack + Studio Options Popover */}
          <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto min-w-0 shrink-0">
            {currentTrack.altVersions && currentTrack.altVersions.length > 1 ? (
              <div
                className="inline-flex items-center gap-2.5 max-w-full overflow-x-auto"
                role="group"
                aria-label="Mix versions"
              >
                {currentTrack.altVersions.map((ver, idx) => (
                  <React.Fragment key={ver.id}>
                    {idx > 0 && (
                      <span
                        className="font-mono text-xs text-[var(--mute)]"
                        aria-hidden="true"
                      >
                        /
                      </span>
                    )}
                    <button
                      type="button"
                      aria-pressed={idx === activeVersionIdx}
                      onClick={() => handleSwitchVersion(idx)}
                      className={`typo-action ${
                        idx === activeVersionIdx ? 'active' : ''
                      }`}
                    >
                      {ver.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <span className="sm:hidden" />
            )}

            <div className="relative shrink-0" ref={optionsWrapRef}>
              <button
                type="button"
                aria-pressed={optionsOpen}
                className={`typo-action min-h-[44px] px-1.5 ${
                  optionsOpen ? 'active' : ''
                }`}
                onClick={() => setOptionsOpen((o) => !o)}
                aria-label="Audio stream settings"
                title="Stream quality & loudness match"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Stream</span>
              </button>

              {optionsOpen && (
                <div className="glass-popover absolute right-0 top-full mt-2 w-[min(240px,calc(100vw-36px))] p-3 z-30 flex flex-col gap-2 text-xs">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--mute)] px-1">
                    Playback Quality
                  </div>
                  <button
                    type="button"
                    onClick={() => setQualityMode('lossless')}
                    className="flex items-center justify-between px-2 py-1.5 rounded-[var(--r-xs)] hover:bg-[var(--glass-pill)] text-left"
                  >
                    <span>Lossless ({currentTrack.bitDepth}-bit FLAC)</span>
                    {qualityMode === 'lossless' && (
                      <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setQualityMode('aac')}
                    className="flex items-center justify-between px-2 py-1.5 rounded-[var(--r-xs)] hover:bg-[var(--glass-pill)] text-left"
                  >
                    <span>Adaptive (256 kbps AAC)</span>
                    {qualityMode === 'aac' && (
                      <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    )}
                  </button>

                  <div className="border-t border-[var(--glass-border)] my-0.5" />

                  <button
                    type="button"
                    onClick={() => setLoudnessMatch((m) => !m)}
                    className="flex items-center justify-between px-2 py-1.5 rounded-[var(--r-xs)] hover:bg-[var(--glass-pill)] text-left"
                  >
                    <span>Loudness Match (-14 LUFS)</span>
                    {loudnessMatch && (
                      <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    )}
                  </button>

                  {currentTrack.samplyPlayerId?.startsWith('https://') && (
                    <>
                      <div className="border-t border-[var(--glass-border)] my-0.5" />
                      <button
                        type="button"
                        onClick={() => {
                          setShowSamplyIframe((s) => !s);
                          setOptionsOpen(false);
                        }}
                        className="flex items-center justify-between px-2 py-1.5 rounded-[var(--r-xs)] hover:bg-[var(--glass-pill)] text-left"
                      >
                        <span>External Samply Embed</span>
                        {showSamplyIframe && (
                          <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {showSamplyIframe && currentTrack.samplyPlayerId?.startsWith('https://') && (
          <div className="mb-4 rounded-[var(--r-sm)] overflow-hidden border border-[var(--glass-border-strong)]">
            <iframe
              title={`Samply ${currentTrack.title}`}
              src={`${currentTrack.samplyPlayerId}${
                currentTrack.samplyPlayerId.includes('?') ? '&' : '?'
              }quality=lossless`}
              loading="lazy"
              className="w-full h-40 border-none"
            />
          </div>
        )}

        {/* 72-Bar Mobile-Safe Studio Waveform Playbar + Wafer Comment Pins */}
        <div className="relative mb-3.5 select-none w-full min-w-0 max-w-full">
          <div
            ref={waveformRef}
            role="slider"
            tabIndex={0}
            aria-label="Waveform scrub bar"
            aria-valuemin={0}
            aria-valuemax={currentTrack.durationSec}
            aria-valuenow={currentPlayheadSec}
            onPointerDown={(e) => {
              isLocalScrubbingRef.current = true;
              setDragging(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              seekByClientX(e.clientX);
            }}
            onPointerMove={(e) => {
              const box = waveformRef.current?.getBoundingClientRect();
              if (box && box.width > 0) {
                setHoverPct(
                  Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width) * 100))
                );
              }
              if (isLocalScrubbingRef.current) {
                seekByClientX(e.clientX);
              }
            }}
            onPointerUp={(e) => {
              if (isLocalScrubbingRef.current) {
                isLocalScrubbingRef.current = false;
                setDragging(false);
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            onPointerLeave={() => setHoverPct(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                seekToPct(progressPct + 4);
              } else if (e.key === 'ArrowLeft') {
                seekToPct(progressPct - 4);
              }
            }}
            className="w-full min-w-0 max-w-full overflow-hidden flex items-center gap-[1px] sm:gap-[2px] h-14 sm:h-16 px-1.5 sm:px-2.5 py-2 rounded-[var(--r-xs)] bg-[var(--glass-pill)] border border-[var(--glass-border)] cursor-pointer relative"
          >
            {bars.map((h, i) => {
              const barPct = (i / Math.max(1, bars.length - 1)) * 100;
              const isPlayed = barPct <= progressPct;
              const isHovered = hoverPct !== null && barPct <= hoverPct && !isPlayed;
              return (
                <div
                  key={i}
                  className={`flex-1 min-w-0 rounded-[1px] transition-colors duration-75 ${
                    isPlayed
                      ? 'bg-[var(--accent)]'
                      : isHovered
                      ? 'bg-[var(--ink-2)] opacity-55'
                      : 'bg-[var(--glass-border-strong)]'
                  }`}
                  style={{ height: `${Math.max(8, Math.min(44, h))}px` }}
                />
              );
            })}

            {hoverPct !== null && (
              <div
                className="pointer-events-none absolute top-1 px-1.5 py-0.5 rounded-[3px] bg-slate-950/85 text-white font-mono text-[10px] tabular-nums -translate-x-1/2"
                style={{ left: `${Math.max(8, Math.min(92, hoverPct))}%` }}
              >
                {formatAudioSec((hoverPct / 100) * currentTrack.durationSec)}
              </div>
            )}
          </div>

          {/* Samply Time-Coded Wafer Pins */}
          {waferComments.length > 0 && (
            <div className="relative h-4 mt-1 w-full">
              {waferComments.map((w) => {
                const leftPct = Math.max(
                  2,
                  Math.min(98, ((w.timestampSec || 0) / currentTrack.durationSec) * 100)
                );
                const isSelected = activeWaferId === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      const pct = ((w.timestampSec || 0) / currentTrack.durationSec) * 100;
                      seekToPct(pct);
                      setActiveWaferId(isSelected ? null : w.id);
                      setNotesOpen(true);
                    }}
                    style={{ left: `${leftPct}%` }}
                    title={`@${w.author} at ${formatAudioSec(w.timestampSec || 0)}: ${w.text}`}
                    className={`absolute top-0 -translate-x-1/2 w-2.5 h-2.5 rounded-full border transition-transform hover:scale-125 ${
                      isSelected
                        ? 'bg-[var(--cta-bright)] border-white scale-125'
                        : 'bg-[var(--accent)] border-white/80 opacity-85'
                    }`}
                    aria-label={`Jump to note by ${w.author} at ${formatAudioSec(
                      w.timestampSec || 0
                    )}`}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Clean Single-Row Transport + Volume + Unboxed Notes Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 w-full min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              className="typo-action min-h-[44px] px-2"
              onClick={() => selectTrack(trackIdx - 1, isPlaying)}
              aria-label="Previous track"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              type="button"
              className="samply-play-orb shrink-0"
              onClick={handleTogglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              className="typo-action min-h-[44px] px-2"
              onClick={() => selectTrack(trackIdx + 1, isPlaying)}
              aria-label="Next track"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <span className="font-mono text-[11px] sm:text-xs text-[var(--mute)] tabular-nums ml-0.5 whitespace-nowrap">
              <strong className="text-[var(--ink)]">{formatAudioSec(currentPlayheadSec)}</strong> /{' '}
              {formatAudioSec(currentTrack.durationSec)}
            </span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden md:inline-flex items-center gap-2 text-[var(--mute)]">
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="typo-action p-1"
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>
              <div className="flex flex-col gap-0.5">
                <label htmlFor="flac-deck-volume" className="field-label !text-[9.5px]">
                  Level
                </label>
                <input
                  id="flac-deck-volume"
                  type="range"
                  min={0}
                  max={100}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    setMuted(false);
                    setVolume(Number(e.target.value));
                  }}
                  className="w-16 accent-[var(--accent)]"
                />
              </div>
            </div>

            <button
              type="button"
              aria-pressed={notesOpen}
              className={`typo-action min-h-[44px] tabular-nums ${
                notesOpen ? 'active' : ''
              }`}
              onClick={() => setNotesOpen((o) => !o)}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Notes ({trackComments.length})</span>
            </button>
          </div>
        </div>

        {/* Collapsible Time-Coded Notes Drawer — Stacked External Monospace Labels */}
        {notesOpen && (
          <div className="mt-4 pt-4 border-t border-[var(--glass-border)] anim-in w-full min-w-0">
            <form
              onSubmit={handleSubmitNote}
              className="grid grid-cols-1 sm:grid-cols-12 items-end gap-3 mb-4 w-full min-w-0"
            >
              <div className="field-group sm:col-span-3">
                <label htmlFor="flac-note-handle" className="field-label">
                  Handle
                </label>
                <input
                  id="flac-note-handle"
                  type="text"
                  required
                  value={noteAuthor}
                  onChange={(e) => setNoteAuthor(e.target.value)}
                  placeholder="e.g. b_man"
                  className="input-clean"
                />
              </div>

              <div className="field-group sm:col-span-6">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="flac-note-body" className="field-label">
                    Mix or Tape Note
                  </label>
                  <button
                    type="button"
                    aria-pressed={pinAtPlayhead}
                    onClick={() => setPinAtPlayhead((p) => !p)}
                    className={`typo-action !py-0 !text-[10.5px] tabular-nums ${
                      pinAtPlayhead ? 'active' : ''
                    }`}
                    title="Anchor note as a wafer pin at current timestamp"
                  >
                    <Clock className="w-3 h-3" />
                    <span>
                      {pinAtPlayhead
                        ? `Pin @${formatAudioSec(currentPlayheadSec)}`
                        : 'Unpinned'}
                    </span>
                  </button>
                </div>
                <input
                  id="flac-note-body"
                  type="text"
                  required
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder=""
                  className="input-clean"
                />
              </div>

              <div className="sm:col-span-3 flex">
                <button
                  type="submit"
                  className="btn-arch btn-cta-bright w-full py-2"
                >
                  Post Note
                </button>
              </div>
            </form>

            {trackComments.map((c) => (
              <div
                key={c.id}
                className={`comment-row ${
                  activeWaferId === c.id ? 'border-[var(--accent)]' : ''
                }`}
              >
                <div className="flex flex-wrap justify-between items-center font-mono text-xs gap-2">
                  <div className="inline-flex items-center gap-2 min-w-0">
                    <strong className="truncate">@{c.author}</strong>
                    {typeof c.timestampSec === 'number' && (
                      <button
                        type="button"
                        onClick={() => {
                          const pct =
                            ((c.timestampSec || 0) / currentTrack.durationSec) * 100;
                          seekToPct(pct);
                        }}
                        className="typo-action typo-action-accent !py-0 tabular-nums shrink-0"
                      >
                        @{formatAudioSec(c.timestampSec)}
                      </button>
                    )}
                  </div>

                  <div className="inline-flex items-center gap-2.5 tabular-nums">
                    <button
                      type="button"
                      className="typo-action !py-0.5"
                      onClick={() => onVoteComment(currentTrack.id, c.id, 1)}
                      aria-label="Upvote"
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
                      onClick={() => onVoteComment(currentTrack.id, c.id, -1)}
                      aria-label="Downvote"
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
                <div className="mt-1 text-sm break-words">{c.text}</div>

                {(c.replies || []).map((r) => (
                  <div key={r.id} className="comment-row comment-reply">
                    <strong className="font-mono text-xs">@{r.author}:</strong>{' '}
                    <span className="text-sm break-words">{r.text}</span>
                  </div>
                ))}

                {openReplyBoxes[c.id] && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const fd = new FormData(form);
                      const rauthor = String(fd.get('rauthor') || '').trim();
                      const rtext = String(fd.get('rtext') || '').trim();
                      if (!rauthor || !rtext) return;
                      await onReplyComment(currentTrack.id, c.id, rauthor, rtext);
                      form.reset();
                      setOpenReplyBoxes((prev) => ({ ...prev, [c.id]: false }));
                    }}
                    className="grid grid-cols-1 sm:grid-cols-12 items-end mt-3 gap-2.5 w-full min-w-0"
                  >
                    <div className="field-group sm:col-span-3">
                      <label
                        htmlFor={`flac-reply-handle-${c.id}`}
                        className="field-label"
                      >
                        Handle
                      </label>
                      <input
                        id={`flac-reply-handle-${c.id}`}
                        type="text"
                        name="rauthor"
                        required
                        className="input-clean py-1.5 px-2.5"
                      />
                    </div>
                    <div className="field-group sm:col-span-7">
                      <label
                        htmlFor={`flac-reply-text-${c.id}`}
                        className="field-label"
                      >
                        Reply
                      </label>
                      <input
                        id={`flac-reply-text-${c.id}`}
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
        )}
      </LiquidGlassStage>

      {searchSlot && <div className="mt-5 w-full min-w-0">{searchSlot}</div>}

      {/* ==================== SAMPLY / iOS ALBUM NUMBERED TRACKLIST ==================== */}
      <div className="samply-tracklist mt-3">
        {filteredTracks.map((track, listOrder) => {
          const masterIdx = tracks.findIndex((x) => x.id === track.id);
          const isCur = masterIdx === trackIdx;
          return (
            <button
              key={track.id}
              type="button"
              onClick={() => {
                if (isCur) {
                  handleTogglePlay();
                } else {
                  selectTrack(masterIdx, true);
                }
              }}
              className={`samply-track-row ${isCur ? 'active' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="font-mono text-xs w-5 text-center text-[var(--mute)] tabular-nums shrink-0">
                  {isCur && isPlaying ? (
                    <Pause className="w-3.5 h-3.5 text-[var(--accent)] mx-auto" />
                  ) : (
                    String(listOrder + 1).padStart(2, '0')
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate text-[var(--ink)]">
                    {track.title}
                  </div>
                  <div className="font-mono text-[11px] sm:text-xs text-[var(--mute)] truncate">
                    {track.artist} · {track.venue} · {track.specLabel}
                    {track.altVersions && track.altVersions.length > 1
                      ? ` · ${track.altVersions.length} mixes`
                      : ''}
                  </div>
                </div>
              </div>

              <span className="font-mono text-xs text-[var(--mute)] tabular-nums shrink-0">
                {formatAudioSec(track.durationSec)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
