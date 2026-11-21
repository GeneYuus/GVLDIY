// app/api/contact-ingest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { archiveRepository } from '@/lib/storage/repository';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const interests = String(body.interests || '').trim();
    const source = body.source === 'Live Chat' ? 'Live Chat' : 'Message Us';

    if (!name || !email || !interests) {
      return NextResponse.json(
        { error: 'Name, email, and message/interests are required.' },
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
    return NextResponse.json({ error: 'Failed to ingest contact message' }, { status: 400 });
  }
}
