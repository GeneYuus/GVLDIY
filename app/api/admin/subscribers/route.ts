// app/api/admin/subscribers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/dal/auth';
import { archiveRepository } from '@/lib/storage/repository';

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized admin session' }, { status: 401 });
  }

  const format = req.nextUrl.searchParams.get('format');
  if (format === 'csv') {
    const csv = await archiveRepository.serializeSubscribersToCsv();
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="greenville_diy_admin_subscribers.csv"',
      },
    });
  }

  const subscribers = await archiveRepository.listSubscribersAdminOnly();
  return NextResponse.json({ subscribers });
}
