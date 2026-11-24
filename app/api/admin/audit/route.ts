// app/api/admin/audit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/dal/auth';
import { archiveRepository } from '@/lib/storage/repository';

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession(req);
  } catch {
    return NextResponse.json(
      { error: 'Unauthorized admin session' },
      { status: 401 }
    );
  }

  const filter = req.nextUrl.searchParams.get('filter') || 'all';
  const format = req.nextUrl.searchParams.get('format');

  if (format === 'csv') {
    const csv = await archiveRepository.serializeAuditLogsToCsv(filter);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="greenville_diy_security_audit_log.csv"',
        'Cache-Control': 'no-store',
      },
    });
  }

  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || 1));
  const pageSize = Math.max(
    1,
    Math.min(100, Number(req.nextUrl.searchParams.get('pageSize') || 50))
  );

  const result = await archiveRepository.queryAuditLogs({
    filter,
    page,
    pageSize,
  });

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
