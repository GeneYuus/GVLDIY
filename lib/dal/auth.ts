// lib/dal/auth.ts
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import type { NextResponse } from 'next/server';
import { isPreviewDemoUnlockAllowed } from '@/lib/config/runtimeEnv';

const COOKIE_NAME = 'gvl_diy_admin_session';

const globalForAdminAuth = globalThis as unknown as {
  __gvlAdminSigningSecret?: string;
  __gvlClaimedAdminHash?: { saltHex: string; hashHex: string };
};

function getSigningSecret(): string {
  const configured = process.env.ADMIN_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (!globalForAdminAuth.__gvlAdminSigningSecret) {
    globalForAdminAuth.__gvlAdminSigningSecret = randomBytes(32).toString('hex');
  }
  return globalForAdminAuth.__gvlAdminSigningSecret;
}

export function isPreviewDemoModeEnabled(): boolean {
  return isPreviewDemoUnlockAllowed();
}

function hashSecretWithSalt(secret: string, saltHex: string): Buffer {
  return scryptSync(secret, Buffer.from(saltHex, 'hex'), 32);
}

export function verifyOrClaimAdminPasskey(rawPasskey: string): boolean {
  const clean = rawPasskey.trim();
  if (!clean) return false;

  const envPasskey = process.env.ADMIN_PASSKEY?.trim();
  if (envPasskey) {
    const saltHex = '67766c5f6469795f61646d696e5f73616c74';
    const candidateHash = hashSecretWithSalt(clean, saltHex);
    const expectedHash = hashSecretWithSalt(envPasskey, saltHex);
    return timingSafeEqual(candidateHash, expectedHash);
  }

  // Preview / unconfigured mode: claim on first custom passkey entry or verify claimed hash
  if (!globalForAdminAuth.__gvlClaimedAdminHash) {
    const saltHex = randomBytes(16).toString('hex');
    const hashHex = hashSecretWithSalt(clean, saltHex).toString('hex');
    globalForAdminAuth.__gvlClaimedAdminHash = { saltHex, hashHex };
    return true;
  }

  const { saltHex, hashHex } = globalForAdminAuth.__gvlClaimedAdminHash;
  const candidateHash = hashSecretWithSalt(clean, saltHex);
  const expectedHash = Buffer.from(hashHex, 'hex');
  return (
    candidateHash.length === expectedHash.length &&
    timingSafeEqual(candidateHash, expectedHash)
  );
}

async function signPayload(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSigningSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${payload}.${hex}`;
}

export async function createSignedAdminToken(): Promise<string> {
  const exp = Date.now() + 1000 * 60 * 60 * 12; // 12 hours
  return signPayload(`admin:${exp}`);
}

export async function verifySignedAdminToken(
  token: string | undefined
): Promise<boolean> {
  if (!token || !token.includes('.')) return false;
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx <= 0) return false;
  const payload = token.slice(0, dotIdx);
  const expected = await signPayload(payload);
  const enc = new TextEncoder();
  const a = enc.encode(expected);
  const b = enc.encode(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const parts = payload.split(':');
  const exp = Number(parts[1] || 0);
  return Number.isFinite(exp) && exp > Date.now();
}

function extractBearerToken(authHeader: string | null): string | undefined {
  if (!authHeader) return undefined;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function verifyMutationCsrf(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  // Custom header cannot be sent cross-origin without CORS preflight
  if (req.headers.get('x-requested-with') === 'gvl-admin') {
    return true;
  }

  const origin = req.headers.get('origin');
  const expectedHost =
    req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (origin && expectedHost) {
    try {
      const originHost = new URL(origin).host;
      if (originHost.toLowerCase() === expectedHost.toLowerCase()) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

export async function verifyAdminSession(req?: Request): Promise<boolean> {
  try {
    // 1. Check server-verified Authorization: Bearer token (iframe-safe, immune to 3P cookie blocking)
    if (req) {
      const bearer = extractBearerToken(req.headers.get('authorization'));
      if (bearer && (await verifySignedAdminToken(bearer))) {
        return true;
      }
    } else {
      const hdrs = await headers();
      const bearer = extractBearerToken(hdrs.get('authorization'));
      if (bearer && (await verifySignedAdminToken(bearer))) {
        return true;
      }
    }

    // 2. Fallback to Partitioned HttpOnly cookie (with CSRF check on mutating requests)
    if (req && !verifyMutationCsrf(req)) {
      return false;
    }

    const cookieStore = await cookies();
    const cookieToken = cookieStore.get(COOKIE_NAME)?.value;
    return verifySignedAdminToken(cookieToken);
  } catch {
    return false;
  }
}

export async function requireAdminSession(req?: Request): Promise<void> {
  const valid = await verifyAdminSession(req);
  if (!valid) {
    throw new Error('UNAUTHORIZED_ADMIN_SESSION');
  }
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = req.headers.get('x-forwarded-proto') || '';
  if (forwardedProto.toLowerCase().includes('https')) return true;
  return req.url.toLowerCase().startsWith('https://');
}

export function appendAdminSessionCookie(
  res: NextResponse,
  req: Request,
  token: string
): void {
  const maxAge = 60 * 60 * 12;
  const encoded = encodeURIComponent(token);

  if (isHttpsRequest(req)) {
    // Partitioned SameSite=None cookie works inside HTTPS cross-origin preview iframes
    res.headers.append(
      'Set-Cookie',
      `${COOKIE_NAME}=${encoded}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None; Partitioned`
    );
  } else {
    res.headers.append(
      'Set-Cookie',
      `${COOKIE_NAME}=${encoded}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`
    );
  }
}

export function clearAdminSessionCookie(res: NextResponse, req: Request): void {
  if (isHttpsRequest(req)) {
    res.headers.append(
      'Set-Cookie',
      `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`
    );
  } else {
    res.headers.append(
      'Set-Cookie',
      `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    );
  }
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
