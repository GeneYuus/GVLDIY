// lib/security/publicRequestGuard.ts
import { createHash } from 'node:crypto';

const WINDOW_MS = 60_000;
const MAX_VOTE_CACHE_SIZE = 20_000;

interface SlidingBucket {
  timestamps: number[];
}

const globalForPublicGuard = globalThis as unknown as {
  __gvlPublicWriteBuckets?: Map<string, SlidingBucket>;
  __gvlCommentVoteSet?: Set<string>;
};

function getWriteBuckets(): Map<string, SlidingBucket> {
  if (!globalForPublicGuard.__gvlPublicWriteBuckets) {
    globalForPublicGuard.__gvlPublicWriteBuckets = new Map();
  }
  return globalForPublicGuard.__gvlPublicWriteBuckets;
}

function getVoteSet(): Set<string> {
  if (!globalForPublicGuard.__gvlCommentVoteSet) {
    globalForPublicGuard.__gvlCommentVoteSet = new Set();
  }
  return globalForPublicGuard.__gvlCommentVoteSet;
}

export function extractClientIpHash(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const firstForwarded = forwarded.split(',')[0]?.trim();
  const realIp = req.headers.get('x-real-ip')?.trim();
  const cfIp = req.headers.get('cf-connecting-ip')?.trim();
  const rawIp = cfIp || firstForwarded || realIp || '127.0.0.1';
  return createHash('sha256').update(rawIp).digest('hex');
}

export async function readBoundedJsonBody<T = Record<string, unknown>>(
  req: Request,
  maxBytes = 8192
): Promise<
  | { ok: true; data: T }
  | { ok: false; status: 400 | 413; error: string }
> {
  const declaredLen = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `Request payload exceeds ${Math.round(maxBytes / 1024)} KB limit`,
    };
  }

  let rawText = '';
  try {
    rawText = await req.text();
  } catch {
    return { ok: false, status: 400, error: 'Unable to read request body' };
  }

  if (Buffer.byteLength(rawText, 'utf8') > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `Request payload exceeds ${Math.round(maxBytes / 1024)} KB limit`,
    };
  }

  try {
    const parsed = JSON.parse(rawText) as T;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: 'JSON object body required' };
    }
    return { ok: true, data: parsed };
  } catch {
    return { ok: false, status: 400, error: 'Malformed JSON payload' };
  }
}

export function checkPublicWriteRateLimit(
  ipHash: string,
  scope: string,
  maxPerMinute = 6
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const buckets = getWriteBuckets();
  const key = `${scope}:${ipHash}`;

  // Periodic pruning when map grows large
  if (buckets.size > 4000) {
    for (const [k, v] of buckets.entries()) {
      const recent = v.timestamps.filter((t) => now - t < WINDOW_MS);
      if (recent.length === 0) {
        buckets.delete(k);
      } else {
        v.timestamps = recent;
      }
    }
  }

  const entry = buckets.get(key) || { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

  if (entry.timestamps.length >= maxPerMinute) {
    const oldest = entry.timestamps[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    buckets.set(key, entry);
    return { allowed: false, retryAfterSec };
  }

  entry.timestamps.push(now);
  buckets.set(key, entry);
  return { allowed: true, retryAfterSec: 0 };
}

export function claimCommentVoteOnce(
  ipHash: string,
  commentId: string
): boolean {
  const cleanId = commentId.trim();
  if (!cleanId) return false;
  const set = getVoteSet();
  const key = `${ipHash}:${cleanId}`;

  if (set.has(key)) {
    return false;
  }

  if (set.size >= MAX_VOTE_CACHE_SIZE) {
    const oldestKey = set.values().next().value;
    if (oldestKey) set.delete(oldestKey);
  }

  set.add(key);
  return true;
}
