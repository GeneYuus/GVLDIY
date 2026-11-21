// lib/audio/pcm-wav-preview.ts

/**
 * Generates a clean, uncompressed 16-bit PCM WAV Blob URL in memory for studio preview mode
 * when an external Google Drive API v3 or Cloudflare R2 FLAC stream URL is not yet configured.
 * Allows the Samply-grade HTML5 <audio> deck to exercise real native seeking, timeupdate,
 * gapless pre-buffering, synced A/B version switching, and Loudness Match gain trimming.
 */
const cachedPreviewUrls = new Map<string, string>();

export function getPreviewWavUrl(
  rootHz = 196,
  variant: 'primary' | 'alt' = 'primary',
  durationSec = 24
): string {
  if (typeof window === 'undefined') return '';
  const cacheKey = `${rootHz.toFixed(2)}-${variant}-${durationSec}`;
  const existing = cachedPreviewUrls.get(cacheKey);
  if (existing) return existing;

  const sampleRate = 22050;
  const clampedSec = Math.max(8, Math.min(36, durationSec));
  const numSamples = sampleRate * clampedSec;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  // RIFF WAVE PCM header
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Warm electric-guitar/tape chord progression so A/B mixes ("Board" vs "Room") sound distinct
  const chordRatios =
    variant === 'alt' ? [1, 1.25, 1.5, 2.0] : [1, 1.5, 2.0, 2.5];
  const mixScale = variant === 'alt' ? 0.22 : 0.28;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const barPos = (t % 4) / 4;
    const env = Math.exp(-barPos * (variant === 'alt' ? 2.1 : 3.2)) * (1 - Math.exp(-barPos * 45));
    const stepShift = Math.floor(t / 4) % 2 === 0 ? 1 : 0.8909; // I -> bVII DIY cadence
    const f0 = rootHz * stepShift;

    let sample = 0;
    for (let c = 0; c < chordRatios.length; c++) {
      const freq = f0 * chordRatios[c];
      sample += Math.sin(2 * Math.PI * freq * t) / chordRatios.length;
    }

    // Subtle room air difference on 'alt' version
    if (variant === 'alt') {
      sample = sample * 0.85 + Math.sin(2 * Math.PI * f0 * 0.5 * t) * 0.15;
    }

    const pcm = Math.max(-1, Math.min(1, sample * env * mixScale));
    view.setInt16(44 + i * 2, Math.round(pcm * 32767), true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  cachedPreviewUrls.set(cacheKey, url);
  return url;
}
