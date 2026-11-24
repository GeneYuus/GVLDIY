// components/audio/DockedLosslessMiniPlayer.tsx
'use client';

import React, { useRef } from 'react';
import { ArrowUpRight, Pause, Play, X } from 'lucide-react';
import {
  formatAudioSec,
  LosslessAudioEngine,
} from '@/components/audio/useLosslessAudioEngine';
import LiquidGlassStage from '@/components/fx/LiquidGlassStage';

interface DockedLosslessMiniPlayerProps {
  engine: LosslessAudioEngine;
  onOpenDeck: () => void;
}

export default function DockedLosslessMiniPlayer({
  engine,
  onOpenDeck,
}: DockedLosslessMiniPlayerProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const track = engine.currentTrack;

  if (!track || !engine.hasActivatedSession || engine.miniDismissed) {
    return null;
  }

  const takeLabel = engine.activeVariant?.label || track.specLabel;

  const handleScrub = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    engine.seekToPct(pct);
  };

  return (
    <aside
      className="mini-player-pos"
      aria-label="Docked Lossless Audio Player"
    >
      <LiquidGlassStage radius={7} bezel={14} thickness={12} specular={0.72}>
        <div className="flex items-center gap-3 px-3.5 py-2.5 min-w-0">
          <button
            type="button"
            onClick={engine.handleTogglePlay}
            className="w-8 h-8 rounded-[var(--r-xs)] bg-[var(--cta-bright)] text-white inline-flex items-center justify-center shrink-0 hover:brightness-105 transition-all"
            aria-label={
              engine.isPlaying ? 'Pause lossless stream' : 'Play lossless stream'
            }
          >
            {engine.isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="plate-title text-xs text-[var(--ink)] truncate">
                {track.title}
              </div>
              <span className="font-mono text-[10px] text-[var(--mute)] tabular-nums shrink-0">
                {formatAudioSec(engine.currentPlayheadSec)} /{' '}
                {formatAudioSec(track.durationSec)}
              </span>
            </div>

            <div className="font-mono text-[10px] text-[var(--mute)] truncate mb-1">
              {track.artist} ·{' '}
              <span className="text-[var(--accent)]">{takeLabel}</span>
            </div>

            <div
              ref={barRef}
              role="slider"
              tabIndex={0}
              aria-label="Mini-player scrub bar"
              aria-valuemin={0}
              aria-valuemax={track.durationSec}
              aria-valuenow={engine.currentPlayheadSec}
              onClick={(e) => handleScrub(e.clientX)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  engine.seekToPct(engine.progressPct + 5);
                } else if (e.key === 'ArrowLeft') {
                  engine.seekToPct(engine.progressPct - 5);
                }
              }}
              className="w-full h-1.5 rounded-[2px] bg-[var(--glass-border-strong)] overflow-hidden cursor-pointer"
            >
              <div
                className="h-full bg-[var(--accent)] transition-[width] duration-75"
                style={{ width: `${engine.progressPct}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenDeck}
            className="typo-action typo-action-accent shrink-0"
            title="Return to full FLAC deck"
          >
            <span>Deck</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={engine.dismissMiniPlayer}
            className="typo-action shrink-0 px-1"
            aria-label="Close mini-player"
            title="Stop and hide mini-player"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </LiquidGlassStage>
    </aside>
  );
}
