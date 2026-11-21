// app/api/webhooks/instagram/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { archiveRepository } from '@/lib/storage/repository';

async function verifyMetaSignature(
  rawBody: string,
  headerSig: string | null
): Promise<boolean> {
  const secret = process.env.IG_WEBHOOK_APP_SECRET;
  if (!secret || secret === 'replace-with-meta-app-secret') {
    // Allow local/preview simulation when no Meta app secret is configured
    return true;
  }
  if (!headerSig || !headerSig.startsWith('sha256=')) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const hex =
    'sha256=' +
    Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  return hex === headerSig;
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');
  const verifyToken = req.nextUrl.searchParams.get('hub.verify_token');
  const expectedToken =
    process.env.IG_VERIFY_TOKEN || 'greenville-diy-barter-verify';

  if (mode === 'subscribe' && challenge) {
    if (verifyToken && verifyToken !== expectedToken) {
      return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 });
    }
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ status: 'Instagram Graph API comment webhook ready' });
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');
    const valid = await verifyMetaSignature(rawBody, signature);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid Meta signature' }, { status: 403 });
    }

    const payload = JSON.parse(rawBody);
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    const publicPayload = await archiveRepository.getPublicPayload();

    const updatedItems = [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change.field === 'comments' && change.value) {
          const mediaId = change.value.media?.id;
          const fromUsername = String(change.value.from?.username || '')
            .trim()
            .replace(/^@/, '')
            .toLowerCase();
          const commentText = String(change.value.text || '')
            .trim()
            .toUpperCase();

          const matchingAuction = publicPayload.auctions.find(
            (a) =>
              (mediaId && a.igMediaId === mediaId) ||
              a.ownerUsername.replace(/^@/, '').toLowerCase() === fromUsername
          );

          if (
            matchingAuction &&
            matchingAuction.ownerUsername.replace(/^@/, '').toLowerCase() ===
              fromUsername &&
            commentText.includes('SOLD')
          ) {
            const res = await archiveRepository.markAuctionSoldByMediaOrId({
              auctionId: matchingAuction.id,
              sold: true,
            });
            if (res) updatedItems.push(res);
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      updatedCount: updatedItems.length,
      updatedItems,
    });
  } catch {
    return NextResponse.json({ error: 'Malformed webhook payload' }, { status: 400 });
  }
}
