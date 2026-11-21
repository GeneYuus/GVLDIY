// lib/motion/lagless-ticker.ts
'use client';

/**
 * Frame-rate-invariant exponential damping motion kernel:
 * factor = 1 - Math.exp(-lambda * dt)
 *Automatically enters 0.0 ms calm-sleep hibernation when all subscribers settle.
 */

type TickerSubscriber = (dtSec: number) => boolean; // Return true to keep running, false when settled

class LaglessMotionKernel {
  private subscribers = new Set<TickerSubscriber>();
  private rafId: number | null = null;
  private lastTs = 0;

  public damp(current: number, target: number, lambda: number, dtSec: number): number {
    return current + (target - current) * (1 - Math.exp(-lambda * dtSec));
  }

  public subscribe(fn: TickerSubscriber): () => void {
    this.subscribers.add(fn);
    this.wake();
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private wake(): void {
    if (this.rafId !== null || typeof window === 'undefined') return;
    this.lastTs = performance.now();
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    const dtSec = Math.min(0.064, Math.max(0.001, (now - this.lastTs) / 1000));
    this.lastTs = now;

    for (const sub of Array.from(this.subscribers)) {
      const keepAlive = sub(dtSec);
      if (!keepAlive) {
        this.subscribers.delete(sub);
      }
    }

    if (this.subscribers.size > 0) {
      this.rafId = window.requestAnimationFrame(this.tick);
    } else {
      // Calm-sleep hibernation: 0.0 ms idle overhead
      this.rafId = null;
    }
  };
}

export const laglessTicker = new LaglessMotionKernel();

export function runViewTransition(updateFn: () => void): void {
  if (
    typeof document !== 'undefined' &&
    'startViewTransition' in document &&
    typeof (document as Document & { startViewTransition?: (cb: () => void) => void })
      .startViewTransition === 'function'
  ) {
    try {
      (
        document as Document & { startViewTransition: (cb: () => void) => void }
      ).startViewTransition(updateFn);
      return;
    } catch {
      // Fallback below
    }
  }
  updateFn();
}
