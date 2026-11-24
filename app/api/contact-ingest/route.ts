// app/api/contact-ingest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  checkPublicWriteRateLimit,
  extractClientIpHash,
  readBoundedJsonBody,
} from '@/lib/security/publicRequestGuard';
import { archiveRepository } from '@/lib/storage/repository';

export async function POST(req: NextRequest) {
  const ipHash = extractClientIpHash(req);
  const maxPerMin = process.env.NODE_ENV !== 'production' ? 20 : 10;
  const rateCheck = checkPublicWriteRateLimit(ipHash, 'contact-ingest', maxPerMin);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: `Please wait ${rateCheck.retryAfterSec}s before sending another message.`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rateCheck.retryAfterSec) },
      }
    );
  }

  const parsed = await readBoundedJsonBody<Record<string, unknown>>(req, 8192);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const body = parsed.data;
    const name = String(body.name || '').trim().slice(0, 140);
    const email = String(body.email || '').trim().slice(0, 190);
    const interests = String(body.interests || '').trim().slice(0, 800);
    const source = body.source === 'Live Chat' ? 'Live Chat' : 'Message Us';

    if (!name || !email || !interests) {
      return NextResponse.json(
        { error: 'Name, email, and message/interests are required.' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    await archiveRepository.appendSubscriberRow({
      source,
      name,
      email,
      interests,
    });

    // Never return the subscriber list to public clients
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to ingest contact message' },
      { status: 400 }
    );
  }
}
