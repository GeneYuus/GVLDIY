// app/api/media/drive/[fileId]/route.ts
import { NextRequest, NextResponse } from 'next/server';

/**
 * Authenticated Google Drive API v3 (`alt=media`) Streaming Proxy.
 * - Uses Web Crypto RSASSA-PKCS1-v1_5 (RS256) with GDRIVE_CLIENT_EMAIL & GDRIVE_PRIVATE_KEY
 *   to mint and cache short-lived Google OAuth2 bearer tokens without bulky SDKs.
 * - Forwards `Range: bytes=...` headers (`HTTP 206 Partial Content`) for instant 24-bit FLAC scrubbing.
 * - When GDRIVE_CLIENT_EMAIL is unset in AI Studio preview, serves a valid 16-bit PCM WAV stream
 *   (with HTTP 206 Range slicing) for <audio> requests or a clean SVG contact-sheet plate for <img>
 *   requests so preview testing works seamlessly with zero broken elements.
 */

let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;
let cachedPreviewWav: ArrayBuffer | null = null;

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(str));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function getPreviewFallbackWav(): ArrayBuffer {
  if (cachedPreviewWav) return cachedPreviewWav;
  const sampleRate = 22050;
  const durationSec = 8;
  const numSamples = sampleRate * durationSec;
  const dataBytes = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = 0.55 + 0.35 * Math.sin(2 * Math.PI * 0.5 * t);
    const sig =
      (Math.sin(2 * Math.PI * 196 * t) * 0.45 +
        Math.sin(2 * Math.PI * 293.66 * t) * 0.3 +
        Math.sin(2 * Math.PI * 392 * t) * 0.2) *
      env *
      0.38;
    const pcm = Math.round(Math.max(-1, Math.min(1, sig)) * 32767);
    view.setInt16(offset, pcm, true);
    offset += 2;
  }

  cachedPreviewWav = buf;
  return cachedPreviewWav;
}

function buildPreviewSvgPlate(fileId: string): string {
  const safeId = fileId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#171C26"/>
        <stop offset="100%" stop-color="#0D1117"/>
      </linearGradient>
    </defs>
    <rect width="800" height="450" fill="url(#g)"/>
    <rect x="24" y="24" width="752" height="402" rx="10" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1.5"/>
    <circle cx="400" cy="196" r="46" fill="rgba(217,93,24,0.18)" stroke="#D95D18" stroke-width="2"/>
    <text x="400" y="202" text-anchor="middle" fill="#F3F5F8" font-family="monospace" font-size="14" font-weight="bold">35MM</text>
    <text x="400" y="286" text-anchor="middle" fill="#F3F5F8" font-family="sans-serif" font-size="18" font-weight="600">Google Drive Archival Plate Preview</text>
    <text x="400" y="316" text-anchor="middle" fill="#8A96A8" font-family="monospace" font-size="13">Drive ID: ${safeId}</text>
  </svg>`;
}

async function getDriveAccessToken(): Promise<string | null> {
  const clientEmail = process.env.GDRIVE_CLIENT_EMAIL?.trim();
  const privateKeyPem = process.env.GDRIVE_PRIVATE_KEY?.trim();

  if (!clientEmail || !privateKeyPem) {
    return null;
  }

  if (cachedToken && cachedToken.expiresAtMs > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  };

  const unsignedJwt = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(
    JSON.stringify(claimSet)
  )}`;

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedJwt)
  );

  const assertion = `${unsignedJwt}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Google OAuth2 token exchange failed (${tokenRes.status})`);
  }

  const tokenJson = (await tokenRes.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: tokenJson.access_token,
    expiresAtMs: Date.now() + (tokenJson.expires_in || 3600) * 1000,
  };
  return cachedToken.accessToken;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await context.params;
  const cleanFileId = (fileId || '').trim();

  if (!cleanFileId || !/^[a-zA-Z0-9_-]{4,}$/.test(cleanFileId)) {
    return NextResponse.json({ error: 'Invalid Google Drive fileId' }, { status: 400 });
  }

  try {
    const accessToken = await getDriveAccessToken();

    // Seamless Preview Fallback when GDRIVE_CLIENT_EMAIL is unset in AI Studio
    if (!accessToken) {
      const accept = (req.headers.get('accept') || '').toLowerCase();
      const rangeHeader = req.headers.get('range');
      const wantsAudio =
        accept.includes('audio/') || (Boolean(rangeHeader) && !accept.includes('image/'));

      if (wantsAudio) {
        const wav = getPreviewFallbackWav();
        const total = wav.byteLength;
        if (rangeHeader && rangeHeader.startsWith('bytes=')) {
          const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
          const start = Math.max(0, Math.min(total - 1, parseInt(startStr || '0', 10) || 0));
          const end = endStr
            ? Math.max(start, Math.min(total - 1, parseInt(endStr, 10)))
            : total - 1;
          const chunk = wav.slice(start, end + 1);
          return new NextResponse(chunk, {
            status: 206,
            headers: {
              'Content-Type': 'audio/wav',
              'Content-Length': String(chunk.byteLength),
              'Content-Range': `bytes ${start}-${end}/${total}`,
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'no-store',
            },
          });
        }

        return new NextResponse(wav, {
          status: 200,
          headers: {
            'Content-Type': 'audio/wav',
            'Content-Length': String(total),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store',
          },
        });
      }

      const svg = buildPreviewSvgPlate(cleanFileId);
      return new NextResponse(svg, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    const upstreamHeaders = new Headers({
      Authorization: `Bearer ${accessToken}`,
    });

    const rangeHeader = req.headers.get('range');
    if (rangeHeader) {
      upstreamHeaders.set('Range', rangeHeader);
    }

    const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      cleanFileId
    )}?alt=media&supportsAllDrives=true`;

    const driveRes = await fetch(driveUrl, {
      method: 'GET',
      headers: upstreamHeaders,
    });

    if (!driveRes.ok && driveRes.status !== 206) {
      return NextResponse.json(
        { error: `Upstream Google Drive API returned ${driveRes.status}` },
        { status: driveRes.status }
      );
    }

    const responseHeaders = new Headers();
    const passthrough = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
    ];
    for (const h of passthrough) {
      const val = driveRes.headers.get(h);
      if (val) responseHeaders.set(h, val);
    }
    if (!responseHeaders.has('accept-ranges')) {
      responseHeaders.set('Accept-Ranges', 'bytes');
    }
    responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new NextResponse(driveRes.body, {
      status: driveRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Drive media stream proxy error',
        detail: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
