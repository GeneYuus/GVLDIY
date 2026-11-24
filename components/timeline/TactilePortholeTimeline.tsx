// components/timeline/TactilePortholeTimeline.tsx
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'motion/react';
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
  const [visitedEras, setVisitedEras] = useState<Record<number, boolean>>({
    0: true,
    1: true,
  });
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const prefersReducedMotion = useReducedMotion();
  const pointerX = useMotionValue(26);
  const pointerY = useMotionValue(18);
  const sheenOpacity = useMotionValue(0.62);

  const smoothX = useSpring(pointerX, { stiffness: 220, damping: 28, mass: 0.4 });
  const smoothY = useSpring(pointerY, { stiffness: 220, damping: 28, mass: 0.4 });
  const smoothOpacity = useSpring(sheenOpacity, { stiffness: 200, damping: 30 });

  const circularSpecularBeam = useMotionTemplate`radial-gradient(180px circle at ${smoothX}% ${smoothY}%, var(--liquid-sheen-peak), transparent 70%)`;

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
      setActiveIdx((prev) => {
        if (prev === nextIdx) return prev;
        setVisitedEras((v) =>
          v[nextIdx] && v[nextIdx - 1] && v[nextIdx + 1]
            ? v
            : {
                ...v,
                [Math.max(0, nextIdx - 1)]: true,
                [nextIdx]: true,
                [Math.min(count - 1, nextIdx + 1)]: true,
              }
        );
        return nextIdx;
      });
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
      setVisitedEras((v) => ({
        ...v,
        [Math.max(0, clamped - 1)]: true,
        [clamped]: true,
        [Math.min(Math.max(0, eras.length - 1), clamped + 1)]: true,
      }));

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

  // Support clean keyboard arrow stepping between archival eras
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

  const handlePortalPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const xPct = Math.max(
      0,
      Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
    );
    const yPct = Math.max(
      0,
      Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)
    );
    pointerX.set(xPct);
    pointerY.set(yPct);
    sheenOpacity.set(0.95);
  };

  const handlePortalPointerLeave = () => {
    if (prefersReducedMotion) return;
    pointerX.set(26);
    pointerY.set(18);
    sheenOpacity.set(0.62);
  };

  if (!eras.length) return null;

  const clampedActiveIdx = Math.min(activeIdx, eras.length - 1);

  // Smooth scroll runway with hidden scrollbars so analog trackpad/wheel/touch glides effortlessly
  const runwayHeightVh =
    eras.length <= 1 ? 100 : Math.max(220, eras.length * 68);

  return (
    <div
      ref={runwayRef}
      style={{ minHeight: `${runwayHeightVh}vh` }}
      className="timeline-runway relative w-full"
    >
      {/* Pure Two-Element Stage: True Circular Text-Free 3D Frosted Photo Portal + Centered Era Info Card */}
      <div className="timeline-knob-stage">
        <div
          className="porthole-ring"
          onPointerMove={handlePortalPointerMove}
          onPointerLeave={handlePortalPointerLeave}
        >
          <motion.span
            aria-hidden="true"
            className="porthole-sheen"
            style={
              prefersReducedMotion
                ? undefined
                : {
                    backgroundImage: circularSpecularBeam,
                    opacity: smoothOpacity,
                  }
            }
          />
          <div className="porthole-lens">
            {eras.map((era, idx) => {
              const isCurrent = idx === clampedActiveIdx;
              const slideClass = isCurrent
                ? 'is-active'
                : idx < clampedActiveIdx
                ? 'is-past'
                : 'is-upcoming';
              const withinNeighborWindow =
                Math.abs(idx - clampedActiveIdx) <= 1 || Boolean(visitedEras[idx]);
              const showPhoto =
                withinNeighborWindow &&
                Boolean(era.portholeImageUrl) &&
                !failedImages[era.id];

              return (
                <div
                  key={era.id}
                  aria-hidden={!isCurrent}
                  className={`portal-analog-slide ${slideClass}`}
                >
                  {showPhoto ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={era.portholeImageUrl}
                      alt={era.title}
                      referrerPolicy="no-referrer"
                      loading={isCurrent ? 'eager' : 'lazy'}
                      decoding="async"
                      className="w-full h-full object-cover block select-none"
                      draggable={false}
                      onError={() =>
                        setFailedImages((prev) => ({ ...prev, [era.id]: true }))
                      }
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="porthole-aperture-fallback"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Single Centered Era Info Card Slot: Absolute Stacking, Active-Only Opacity & Pointer Events */}
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
                    <h3 className="plate-title m-0 mb-2 text-base sm:text-xl text-balance">
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
      </div>
    </div>
  );
}
