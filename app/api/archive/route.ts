// app/api/archive/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  checkPublicWriteRateLimit,
  extractClientIpHash,
  readBoundedJsonBody,
} from '@/lib/security/publicRequestGuard';
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
  const ipHash = extractClientIpHash(req);

  const parsed = await readBoundedJsonBody<Record<string, unknown>>(req, 8192);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  try {
    const body = parsed.data;
    const {
      action,
      targetItemId,
      commentId,
      author,
      text,
      delta,
      timestampSec,
      who,
      msg,
    } = body;

    const isPreview = process.env.NODE_ENV !== 'production';
    const isVoteAction = action === 'vote-comment';
    const scope = isVoteAction ? 'public-archive-vote' : 'public-archive-post';
    const maxPerMin = isVoteAction
      ? isPreview
        ? 60
        : 30
      : isPreview
      ? 30
      : 12;

    const rateCheck = checkPublicWriteRateLimit(ipHash, scope, maxPerMin);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Please wait ${rateCheck.retryAfterSec}s before submitting again.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateCheck.retryAfterSec) },
        }
      );
    }

    if (action === 'send-chat') {
      if (!msg || typeof msg !== 'string' || !msg.trim()) {
        return NextResponse.json({ error: 'Empty chat message' }, { status: 400 });
      }
      const sceneChat = await archiveRepository.appendSceneChatMessage(
        typeof who === 'string' ? who.slice(0, 60) : 'visitor',
        msg.slice(0, 400)
      );
      return NextResponse.json({ ok: true, sceneChat });
    }

    if (action === 'add-comment') {
      if (
        typeof targetItemId !== 'string' ||
        typeof author !== 'string' ||
        typeof text !== 'string' ||
        !targetItemId.trim() ||
        !author.trim() ||
        !text.trim()
      ) {
        return NextResponse.json({ error: 'Missing comment fields' }, { status: 400 });
      }
      const created = await archiveRepository.addComment(
        targetItemId.trim().slice(0, 64),
        author.trim().slice(0, 80),
        text.trim().slice(0, 1200),
        typeof timestampSec === 'number' && Number.isFinite(timestampSec)
          ? Math.max(0, Math.floor(timestampSec))
          : undefined
      );
      return NextResponse.json({ ok: true, comment: created });
    }

    if (action === 'vote-comment') {
      if (
        typeof targetItemId !== 'string' ||
        typeof commentId !== 'string' ||
        !targetItemId.trim() ||
        !commentId.trim() ||
        (delta !== 1 && delta !== -1)
      ) {
        return NextResponse.json({ error: 'Invalid vote payload' }, { status: 400 });
      }
      if (!(await archiveRepository.claimCommentVote(ipHash, commentId))) {
        return NextResponse.json(
          { error: 'Vote already recorded for this comment' },
          { status: 429 }
        );
      }
      const updated = await archiveRepository.voteComment(
        targetItemId.trim(),
        commentId.trim(),
        delta
      );
      return NextResponse.json({ ok: true, comment: updated });
    }

    if (action === 'reply-comment') {
      if (
        typeof targetItemId !== 'string' ||
        typeof commentId !== 'string' ||
        typeof author !== 'string' ||
        typeof text !== 'string' ||
        !targetItemId.trim() ||
        !commentId.trim() ||
        !author.trim() ||
        !text.trim()
      ) {
        return NextResponse.json({ error: 'Missing reply fields' }, { status: 400 });
      }
      const updated = await archiveRepository.addReply(
        targetItemId.trim().slice(0, 64),
        commentId.trim().slice(0, 64),
        author.trim().slice(0, 80),
        text.trim().slice(0, 800)
      );
      return NextResponse.json({ ok: true, comment: updated });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
  }
}
