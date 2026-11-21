// lib/media/resolveMediaUrl.ts
import { MediaSourceType } from '@/types/archive';

/**
 * Extracts a clean Google Drive File ID from any Drive share URL or raw ID string.
 */
export function extractGoogleDriveFileId(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';

  const filePathMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (filePathMatch?.[1]) return filePathMatch[1];

  const queryIdMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (queryIdMatch?.[1]) return queryIdMatch[1];

  const foldersMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (foldersMatch?.[1]) return foldersMatch[1];

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Extracts a clean 11-character YouTube video ID from any watch, youtu.be, or embed link.
 */
export function extractYoutubeVideoId(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return 'M7lc1UVf-VE';

  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch?.[1]) return shortMatch[1];

  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch?.[1]) return watchMatch[1];

  const embedMatch = trimmed.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch?.[1]) return embedMatch[1];

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Resolves off-Hostinger media references (Google Drive API v3 proxy, Cloudflare R2 CDN, Samply, or embedded data URLs)
 * so zero binary media files ever need to sit on Hostinger's shared web SSD.
 */
export function resolveMediaUrl(
  sourceType: MediaSourceType | undefined,
  sourceIdOrUrl: string | undefined,
  fallbackUrl = ''
): string {
  const raw = (sourceIdOrUrl || '').trim();

  if (sourceType === 'gdrive' && raw) {
    if (raw.startsWith('/api/media/drive/')) return raw;
    const fileId = extractGoogleDriveFileId(raw);
    return fileId ? `/api/media/drive/${encodeURIComponent(fileId)}` : fallbackUrl;
  }

  if (sourceType === 'r2' && raw) {
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = (
      process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://media.greenvillediyarchive.org'
    ).replace(/\/+$/, '');
    return `${base}/${raw.replace(/^\/+/, '')}`;
  }

  if (sourceType === 'samply' && raw) {
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://samply.app/embed/${encodeURIComponent(raw)}`;
  }

  // Auto-detect pasted Google Drive link even when sourceType is omitted
  if (raw.includes('drive.google.com/')) {
    const fileId = extractGoogleDriveFileId(raw);
    if (fileId) return `/api/media/drive/${encodeURIComponent(fileId)}`;
  }

  if (raw && (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('/'))) {
    return raw;
  }

  return fallbackUrl;
}

/**
 * Generates realistic 72-bar mastering-grade waveform envelopes [10..48] from a title seed.
 */
export function buildDeterministicPeaks(seedText: string, barCount = 72): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const seed = Math.abs(hash);

  return Array.from({ length: barCount }, (_, i) => {
    const pos = i / Math.max(1, barCount - 1);
    const intro = Math.min(1, pos * 6.5);
    const outro = Math.min(1, (1 - pos) * 7.5);
    const breakdown = pos > 0.52 && pos < 0.66 ? 0.58 : 1.0;
    const harmonic =
      0.62 +
      0.22 * Math.sin(i * 0.43 + (seed % 11)) +
      0.16 * Math.cos(i * 1.17 + (seed % 7));
    const transient = ((i * 31 + (seed % 29)) % 13) / 42;
    const raw = (harmonic + transient) * intro * outro * breakdown;
    return Math.max(10, Math.min(48, Math.round(10 + raw * 38)));
  });
}

/**
 * Client-Side Web Audio 72-Bar RMS Peak, Duration & Integrated Loudness (LUFS) Analyzer.
 */
export async function extractWaveformPeaksFromAudioFile(
  file: File,
  barCount = 72
): Promise<{
  peaks: number[];
  durationSec: number;
  sampleRateHz: 44100 | 48000 | 96000;
  loudnessLufs: number;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();

  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const numChannels = Math.max(1, audioBuffer.numberOfChannels);
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = numChannels > 1 ? audioBuffer.getChannelData(1) : ch0;

    const blockSize = Math.max(1, Math.floor(ch0.length / barCount));
    const rawRms: number[] = [];
    let gatedEnergySum = 0;
    let gatedBlocks = 0;

    for (let i = 0; i < barCount; i++) {
      const start = i * blockSize;
      const end = Math.min(ch0.length, start + blockSize);
      let sumSq = 0;
      const stride = Math.max(1, Math.floor((end - start) / 512));
      let count = 0;
      for (let j = start; j < end; j += stride) {
        const s0 = ch0[j] || 0;
        const s1 = ch1[j] || 0;
        const monoMeanSq = 0.5 * (s0 * s0 + s1 * s1);
        sumSq += monoMeanSq;
        count++;
      }
      const blockMeanSq = count > 0 ? sumSq / count : 0;
      rawRms.push(Math.sqrt(blockMeanSq));

      // Approximate BS.1770 -70 LUFS absolute silence gate
      if (blockMeanSq > 1e-7) {
        gatedEnergySum += blockMeanSq;
        gatedBlocks++;
      }
    }

    const maxRms = Math.max(...rawRms, 0.001);
    const peaks = rawRms.map((v) => Math.round(10 + (v / maxRms) * 38));
    const sr = audioBuffer.sampleRate;
    const normalizedSr: 44100 | 48000 | 96000 =
      sr >= 88200 ? 96000 : sr >= 48000 ? 48000 : 44100;

    const avgMeanSq = gatedBlocks > 0 ? gatedEnergySum / gatedBlocks : 0.01;
    const estimatedLufs = -0.691 + 10 * Math.log10(Math.max(avgMeanSq, 1e-6));
    const clampedLufs = Math.round(Math.max(-36, Math.min(-5, estimatedLufs)) * 10) / 10;

    return {
      peaks,
      durationSec: Math.max(1, Math.round(audioBuffer.duration)),
      sampleRateHz: normalizedSr,
      loudnessLufs: clampedLufs,
    };
  } finally {
    void ctx.close();
  }
}

export const extractWaveformPeaksFromFile = extractWaveformPeaksFromAudioFile;

/**
 * Client-Side Image Dimensions & Metadata Inspector for 35mm Photo Scans & Auction Cards.
 */
export function extractImageDimensionsClient(
  file: File
): Promise<{ width: number; height: number; dimensionsLabel: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      URL.revokeObjectURL(objectUrl);
      resolve({
        width,
        height,
        dimensionsLabel: `${width}×${height}px · ${(file.size / 1024).toFixed(0)} KB`,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not inspect image file'));
    };
    img.src = objectUrl;
  });
}

/**
 * Parses multiline timestamp text ("00:00 Poe Mill Session\n04:12 Backside Smith")
 * into structured VideoTimestamp objects.
 */
export function parseMultilineTimestamps(
  rawText: string
): { sec: number; time: string; label: string }[] {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed = lines.map((line) => {
    const match = line.match(/^(\d{1,2}):(\d{2})\s*[-—:]?\s*(.+)$/);
    if (!match) {
      return { sec: 0, time: '00:00', label: line };
    }
    const mins = Number(match[1]);
    const secs = Number(match[2]);
    const time = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return {
      sec: mins * 60 + secs,
      time,
      label: match[3].trim(),
    };
  });

  return parsed.length > 0
    ? parsed
    : [{ sec: 0, time: '00:00', label: 'Full Tape Session' }];
}
