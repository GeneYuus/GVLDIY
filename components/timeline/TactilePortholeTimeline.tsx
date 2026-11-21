// components/timeline/TactilePortholeTimeline.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { TimelineEra } from '@/types/archive';
import LiquidGlassStage from '@/components/fx/LiquidGlassStage';

interface TactilePortholeTimelineProps {
  eras: TimelineEra[];
}

export default function TactilePortholeTimeline({
  eras,
}: TactilePortholeTimelineProps) {
  const runwayRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // Passive requestAnimationFrame scroll tracker snapping a single portal node into view at a time
  useEffect(() => {
    let rafId = 0;
    const count = Math.max(1, eras.length);

    const syncFromScroll = () => {
      rafId = 0;
      const runway = runwayRef.current;
      if (!runway) return;

      const rect = runway.getBoundingClientRect();
      const viewportH = window.innerHeight || 800;
      const totalTravel = Math.max(1, rect.height - viewportH);
      const scrolled = Math.max(0, Math.min(totalTravel, -rect.top));
      const progress = scrolled / totalTravel;

      const nextIdx = Math.min(
        count - 1,
        Math.max(0, Math.round(progress * (count - 1)))
      );
      setActiveIdx((prev) => (prev === nextIdx ? prev : nextIdx));
    };

    const onScroll = () => {
      if (!rafId) {
        rafId = window.requestAnimationFrame(syncFromScroll);
      }
    };

    syncFromScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [eras.length]);

  if (!eras.length) return null;

  // Deliberate vertical scroll runway so each portal shifts cleanly along the chain
  const runwayHeightVh = Math.max(240, eras.length * 72);

  return (
    <div
      ref={runwayRef}
      style={{ minHeight: `${runwayHeightVh}vh` }}
      className="relative w-full"
    >
      {/* Viewport-Locked Center Stage: Top-to-Bottom Fading Line + Single Visible Portal & Text */}
      <div className="timeline-knob-stage">
        <div className="timeline-fading-chain-line" aria-hidden="true" />

        <div className="timeline-chain-slot">
          {eras.map((era, idx) => {
            const stateClass =
              idx === activeIdx
                ? 'is-active'
                : idx < activeIdx
                ? 'is-past'
                : 'is-upcoming';

            return (
              <div
                key={era.id}
                aria-hidden={idx !== activeIdx}
                className={`timeline-chain-node ${stateClass}`}
              >
                {/* Optical Liquid 3D Circular Portal (No Encircling Progress Ring) */}
                <LiquidGlassStage
                  radius={999}
                  bezel={20}
                  thickness={16}
                  specular={0.78}
                  className="porthole-ring"
                  contentClassName="h-full"
                >
                  <div className="porthole-lens">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={era.portholeImageUrl}
                      alt={era.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-7 pb-3 px-4 text-center">
                      <span className="font-mono text-xs font-bold text-white tracking-wide tabular-nums">
                        {era.eraRange}
                      </span>
                    </div>
                  </div>
                </LiquidGlassStage>

                {/* Era Text Slab Sliding Vertically With Its Portal */}
                <LiquidGlassStage
                  radius={12}
                  bezel={16}
                  thickness={12}
                  specular={0.68}
                  className="w-full"
                >
                  <article className="timeline-era-card">
                    <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] mb-1.5 tabular-nums">
                      {String(idx + 1).padStart(2, '0')} /{' '}
                      {String(eras.length).padStart(2, '0')} ·{' '}
                      {era.dialShortLabel} · {era.eraRange}
                    </div>
                    <h3 className="m-0 mb-2 font-[var(--font-display)] text-base sm:text-xl font-extrabold tracking-tight text-balance">
                      {era.title}
                    </h3>
                    <p className="m-0 text-xs sm:text-sm text-[var(--ink-2)] leading-relaxed">
                      {era.summary}
                    </p>
                  </article>
                </LiquidGlassStage>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
