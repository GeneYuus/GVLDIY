// app/api/webhooks/instagram/route.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { archiveRepository } from '@/lib/storage/repository';

const MAX_WEBHOOK_BYTES = 65536;

function isConfiguredWebhookSecret(secret: string | undefined): secret is string {
  const trimmed = secret?.trim() || '';
  return Boolean(trimmed && trimmed !== 'replace-with-meta-app-secret');
}

function verifyMetaSignature(
  rawBody: string,
  headerSig: string | null
): boolean {
  const secret = process.env.IG_WEBHOOK_APP_SECRET?.trim();
  // Fail closed whenever IG_WEBHOOK_APP_SECRET is unset or placeholder
  if (!isConfiguredWebhookSecret(secret)) {
    return false;
  }

  if (!headerSig || !headerSig.startsWith('sha256=')) {
    return false;
  }

  const expectedHex =
    'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const expectedBuf = Buffer.from(expectedHex, 'utf8');
  const candidateBuf = Buffer.from(headerSig.trim(), 'utf8');

  if (expectedBuf.length !== candidateBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, candidateBuf);
}

export async function GET(req: NextRequest) {
  const secret = process.env.IG_WEBHOOK_APP_SECRET?.trim();
  if (!isConfiguredWebhookSecret(secret)) {
    return NextResponse.json(
      { error: 'Instagram webhook secret is not configured' },
      { status: 403 }
    );
  }

  const mode = req.nextUrl.searchParams.get('hub.mode');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');
  const verifyToken = req.nextUrl.searchParams.get('hub.verify_token') || '';
  const expectedToken = process.env.IG_VERIFY_TOKEN?.trim() || '';

  if (mode === 'subscribe' && challenge) {
    if (!expectedToken || !verifyToken) {
      return NextResponse.json(
        { error: 'Invalid verify token' },
        { status: 403 }
      );
    }
    const a = Buffer.from(expectedToken, 'utf8');
    const b = Buffer.from(verifyToken, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json(
        { error: 'Invalid verify token' },
        { status: 403 }
      );
    }
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({
    status: 'Instagram Graph API comment webhook ready',
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.IG_WEBHOOK_APP_SECRET?.trim();
  if (!isConfiguredWebhookSecret(secret)) {
    return NextResponse.json(
      { error: 'Instagram webhook signature secret is not configured' },
      { status: 403 }
    );
  }

  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { error: 'Webhook payload too large' },
      { status: 413 }
    );
  }

  try {
    const rawBody = await req.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) {
      return NextResponse.json(
        { error: 'Webhook payload too large' },
        { status: 413 }
      );
    }

    const signature = req.headers.get('x-hub-signature-256');
    if (!verifyMetaSignature(rawBody, signature)) {
      return NextResponse.json(
        { error: 'Invalid Meta signature' },
        { status: 403 }
      );
    }

    const payload: unknown = JSON.parse(rawBody);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json(
        { error: 'Webhook JSON object body required' },
        { status: 400 }
      );
    }

    const payloadObj = payload as { entry?: unknown };
    const entries = Array.isArray(payloadObj.entry) ? payloadObj.entry : [];
    const publicPayload = await archiveRepository.getPublicPayload();

    const updatedItems = [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change.field === 'comments' && change.value) {
          const mediaId = String(change.value.media?.id || '').trim();
          const fromUsername = String(change.value.from?.username || '')
            .trim()
            .replace(/^@/, '')
            .toLowerCase();
          const commentText = String(change.value.text || '')
            .trim()
            .toUpperCase();

          if (!mediaId || !fromUsername || !commentText.includes('SOLD')) {
            continue;
          }

          const matchingAuction = publicPayload.auctions.find(
            (a) =>
              Boolean(mediaId && a.igMediaId === mediaId) &&
              a.ownerUsername.replace(/^@/, '').toLowerCase() === fromUsername
          );

          if (matchingAuction) {
            const res = await archiveRepository.markAuctionSoldByMediaOrId({
              auctionId: matchingAuction.id,
              sold: true,
            });
            if (res) {
              await archiveRepository.recordAuditLog(
                'IG_WEBHOOK_SOLD',
                matchingAuction.id,
                `@${fromUsername}`
              );
              updatedItems.push(res);
            }
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
    return NextResponse.json(
      { error: 'Malformed webhook payload' },
      { status: 400 }
    );
  }
}
