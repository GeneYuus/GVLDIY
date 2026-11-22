// components/timeline/TactilePortholeTimeline.tsx
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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

  // Hide browser scrollbars while the chromeless analog timeline stage is mounted
  useEffect(() => {
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    htmlEl.classList.add('timeline-chromeless-scroll');
    bodyEl.classList.add('timeline-chromeless-scroll');
    return () => {
      htmlEl.classList.remove('timeline-chromeless-scroll');
      bodyEl.classList.remove('timeline-chromeless-scroll');
    };
  }, []);

  // Passive requestAnimationFrame scroll tracker settling the analog portal onto the active era
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
      const progress = count > 1 ? scrolled / totalTravel : 0;

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

  const glideToEraIndex = useCallback(
    (targetIdx: number) => {
      const clamped = Math.max(0, Math.min(eras.length - 1, targetIdx));
      setActiveIdx(clamped);

      const runway = runwayRef.current;
      if (!runway || eras.length <= 1) return;

      const rect = runway.getBoundingClientRect();
      const runwayTopDoc = window.scrollY + rect.top;
      const viewportH = window.innerHeight || 800;
      const totalTravel = Math.max(1, rect.height - viewportH);
      const targetRatio = clamped / (eras.length - 1);
      const destinationY = runwayTopDoc + targetRatio * totalTravel;

      window.scrollTo({
        top: destinationY,
        behavior: 'smooth',
      });
    },
    [eras.length]
  );

  // Support clean keyboard arrow stepping between archival dates
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        if (activeIdx < eras.length - 1) {
          e.preventDefault();
          glideToEraIndex(activeIdx + 1);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        if (activeIdx > 0) {
          e.preventDefault();
          glideToEraIndex(activeIdx - 1);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIdx, eras.length, glideToEraIndex]);

  if (!eras.length) return null;

  const clampedActiveIdx = Math.min(activeIdx, eras.length - 1);
  const prevEra = clampedActiveIdx > 0 ? eras[clampedActiveIdx - 1] : null;
  const nextEra =
    clampedActiveIdx < eras.length - 1 ? eras[clampedActiveIdx + 1] : null;

  // Smooth scroll runway with hidden scrollbars so analog trackpad/wheel/touch glides effortlessly
  const runwayHeightVh =
    eras.length <= 1 ? 100 : Math.max(220, eras.length * 68);

  return (
    <div
      ref={runwayRef}
      style={{ minHeight: `${runwayHeightVh}vh` }}
      className="timeline-runway relative w-full"
    >
      {/* Chromeless Viewport-Locked Stage: Stationary 3D Portal + Single Stacked Card Slot (Dates Only) */}
      <div className="timeline-knob-stage">
        {/* Quiet Preceding Date Whisper (Dates-Only Temporal Context) */}
        <div className="timeline-date-whisper-slot">
          {prevEra ? (
            <button
              type="button"
              onClick={() => glideToEraIndex(clampedActiveIdx - 1)}
              className="timeline-date-whisper tabular-nums"
              aria-label={`Return to ${prevEra.eraRange}`}
            >
              {prevEra.eraRange}
            </button>
          ) : null}
        </div>

        {/* Single Stationary Centered 3D Frosted Glass Porthole Lens with Analog Sliding Film-Gate Frames */}
        <LiquidGlassStage
          radius={999}
          bezel={20}
          thickness={16}
          specular={0.78}
          className="porthole-ring"
          contentClassName="h-full"
        >
          <div className="porthole-lens">
            {eras.map((era, idx) => {
              const isCurrent = idx === clampedActiveIdx;
              const slideClass = isCurrent
                ? 'is-active'
                : idx < clampedActiveIdx
                ? 'is-past'
                : 'is-upcoming';

              return (
                <div
                  key={era.id}
                  aria-hidden={!isCurrent}
                  className={`portal-analog-slide ${slideClass}`}
                >
                  {era.portholeImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={era.portholeImageUrl}
                      alt={era.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover block select-none"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#0D1015] px-4 text-center font-mono text-xs text-slate-400 tabular-nums">
                      {era.eraRange}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-8 pb-3.5 px-4 text-center pointer-events-none">
                    <span className="font-mono text-xs font-bold text-white tracking-wider tabular-nums">
                      {era.eraRange}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </LiquidGlassStage>

        {/* Single Centered Era Card Slot: Absolute Stacking, Active-Only Opacity & Pointer Events */}
        <div className="timeline-card-slot">
          {eras.map((era, idx) => {
            const isCurrent = idx === clampedActiveIdx;
            const cardStateClass = isCurrent
              ? 'is-active'
              : idx < clampedActiveIdx
              ? 'is-past'
              : 'is-upcoming';

            return (
              <div
                key={era.id}
                aria-hidden={!isCurrent}
                className={`timeline-card-layer ${cardStateClass}`}
              >
                <LiquidGlassStage
                  radius={12}
                  bezel={16}
                  thickness={12}
                  specular={0.68}
                  className="w-full"
                >
                  <article className="timeline-era-card">
                    <time className="block font-mono text-xs font-semibold tracking-wider text-[var(--accent)] mb-1.5 tabular-nums">
                      {era.eraRange}
                    </time>
                    <h3 className="m-0 mb-2 font-[var(--font-display)] text-base sm:text-xl font-extrabold tracking-tight text-balance">
                      {era.title}
                    </h3>
                    <p className="m-0 text-xs sm:text-sm text-[var(--ink-2)] leading-relaxed max-w-[65ch]">
                      {era.summary}
                    </p>
                  </article>
                </LiquidGlassStage>
              </div>
            );
          })}
        </div>

        {/* Quiet Upcoming Date Whisper (Dates-Only Temporal Context) */}
        <div className="timeline-date-whisper-slot">
          {nextEra ? (
            <button
              type="button"
              onClick={() => glideToEraIndex(clampedActiveIdx + 1)}
              className="timeline-date-whisper tabular-nums"
              aria-label={`Advance to ${nextEra.eraRange}`}
            >
              {nextEra.eraRange}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
