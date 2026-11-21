// components/fx/LiquidGlassStage.tsx
'use client';

import React from 'react';
import { LiquidGlass, type GlassVariant } from '@vepando/liquid-glass-react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'motion/react';

interface LiquidGlassStageProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  radius?: number | 'auto';
  variant?: GlassVariant;
  bezel?: number;
  thickness?: number;
  blur?: number;
  saturation?: number;
  specular?: number;
  dispersion?: number;
  lightAngle?: number;
  ariaLabel?: string;
}

/**
 * Optical Liquid 3D Glass wrapper for focal hero stages:
 * Combines physically-based Snell's-law squircle rim refraction (@vepando/liquid-glass-react)
 * with gentle directional frosted specularity and pointer-reactive motion catchlights.
 */
export default function LiquidGlassStage({
  children,
  className = '',
  contentClassName = '',
  radius = 10,
  variant = 'regular',
  bezel = 18,
  thickness = 14,
  blur = 22,
  saturation = 1.82,
  specular = 0.68,
  dispersion = 0.07,
  lightAngle = -128,
  ariaLabel,
}: LiquidGlassStageProps) {
  const prefersReducedMotion = useReducedMotion();
  const pointerX = useMotionValue(22);
  const pointerY = useMotionValue(12);
  const sheenOpacity = useMotionValue(0.55);

  const smoothX = useSpring(pointerX, { stiffness: 220, damping: 28, mass: 0.4 });
  const smoothY = useSpring(pointerY, { stiffness: 220, damping: 28, mass: 0.4 });
  const smoothOpacity = useSpring(sheenOpacity, { stiffness: 200, damping: 30 });

  const specularBeam = useMotionTemplate`radial-gradient(380px circle at ${smoothX}% ${smoothY}%, var(--liquid-sheen-peak), transparent 68%)`;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    pointerX.set(xPct);
    pointerY.set(yPct);
    sheenOpacity.set(0.92);
  };

  const handlePointerLeave = () => {
    if (prefersReducedMotion) return;
    pointerX.set(22);
    pointerY.set(12);
    sheenOpacity.set(0.55);
  };

  return (
    <LiquidGlass
      variant={variant}
      radius={radius}
      bezel={bezel}
      thickness={thickness}
      blur={blur}
      saturation={saturation}
      specular={specular}
      dispersion={dispersion}
      lightAngle={lightAngle}
      aria-label={ariaLabel}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`liquid-stage-shell ${className}`.trim()}
    >
      <motion.div
        aria-hidden="true"
        className="liquid-stage-sheen"
        style={
          prefersReducedMotion
            ? undefined
            : {
                backgroundImage: specularBeam,
                opacity: smoothOpacity,
              }
        }
      />
      <div className={`relative z-10 w-full min-w-0 ${contentClassName}`.trim()}>
        {children}
      </div>
    </LiquidGlass>
  );
}
