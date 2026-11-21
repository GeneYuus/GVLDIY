// app/api/archive/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { archiveRepository } from '@/lib/storage/repository';

export async function GET(req: NextRequest) {
  const isPoll = req.nextUrl.searchParams.get('poll') === '1';
  if (isPoll) {
    const snapshot = await archiveRepository.getLivePollSnapshot();
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const payload = await archiveRepository.getPublicPayload();
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, targetItemId, commentId, author, text, delta, timestampSec, who, msg } = body;

    if (action === 'send-chat') {
      if (!msg || typeof msg !== 'string' || !msg.trim()) {
        return NextResponse.json({ error: 'Empty chat message' }, { status: 400 });
      }
      const sceneChat = await archiveRepository.appendSceneChatMessage(
        typeof who === 'string' ? who : 'visitor',
        msg
      );
      return NextResponse.json({ ok: true, sceneChat });
    }

    if (action === 'add-comment') {
      if (!targetItemId || !author || !text) {
        return NextResponse.json({ error: 'Missing comment fields' }, { status: 400 });
      }
      const created = await archiveRepository.addComment(
        targetItemId,
        author,
        text,
        typeof timestampSec === 'number' ? timestampSec : undefined
      );
      return NextResponse.json({ ok: true, comment: created });
    }

    if (action === 'vote-comment') {
      if (!targetItemId || !commentId || (delta !== 1 && delta !== -1)) {
        return NextResponse.json({ error: 'Invalid vote payload' }, { status: 400 });
      }
      const updated = await archiveRepository.voteComment(targetItemId, commentId, delta);
      return NextResponse.json({ ok: true, comment: updated });
    }

    if (action === 'reply-comment') {
      if (!targetItemId || !commentId || !author || !text) {
        return NextResponse.json({ error: 'Missing reply fields' }, { status: 400 });
      }
      const updated = await archiveRepository.addReply(targetItemId, commentId, author, text);
      return NextResponse.json({ ok: true, comment: updated });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
  }
}
