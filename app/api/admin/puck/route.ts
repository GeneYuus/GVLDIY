// app/api/admin/puck/route.ts
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/dal/auth';
import { archiveRepository } from '@/lib/storage/repository';
import { PuckSerializedData } from '@/types/archive';

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized admin session' }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get('slug');
  if (slug) {
    const page = await archiveRepository.getPuckPageBySlug(slug);
    if (!page) {
      return NextResponse.json({ error: 'Puck page not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, page });
  }

  const pages = await archiveRepository.listPuckPages();
  return NextResponse.json({ ok: true, pages });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized admin session' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = String(body.action || 'save');

    if (action === 'create') {
      const slug = String(body.slug || '').trim();
      const title = String(body.title || '').trim();
      if (!slug || !title) {
        return NextResponse.json(
          { error: 'Both page title and URL slug are required' },
          { status: 400 }
        );
      }
      const created = await archiveRepository.createCustomPuckPage({ slug, title });
      revalidatePath(`/p/${created.slug}`);
      return NextResponse.json({ ok: true, page: created });
    }

    if (action === 'delete') {
      const slug = String(body.slug || '').trim();
      if (!slug) {
        return NextResponse.json({ error: 'Slug required' }, { status: 400 });
      }
      await archiveRepository.deleteCustomPuckPage(slug);
      revalidatePath('/');
      if (!slug.startsWith('slot:')) {
        revalidatePath(`/p/${slug}`);
      }
      const pages = await archiveRepository.listPuckPages();
      return NextResponse.json({ ok: true, pages });
    }

    // Default action: 'save' (Publish from Puck Visual Editor)
    const slug = String(body.slug || '').trim();
    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    const rawData = body.puckData as PuckSerializedData | undefined;
    if (!rawData || !Array.isArray(rawData.content)) {
      return NextResponse.json({ error: 'Invalid Puck data payload' }, { status: 400 });
    }

    const saved = await archiveRepository.savePuckPageData(slug, {
      title: typeof body.title === 'string' ? body.title : undefined,
      published: typeof body.published === 'boolean' ? body.published : true,
      puckData: rawData,
    });

    revalidatePath('/');
    if (!slug.startsWith('slot:')) {
      revalidatePath(`/p/${slug}`);
    }

    return NextResponse.json({ ok: true, page: saved });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to save Puck page',
      },
      { status: 400 }
    );
  }
}
