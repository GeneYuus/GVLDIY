// app/api/admin/schema/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { requireAdminSession } from '@/lib/dal/auth';

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized admin session' }, { status: 401 });
  }

  try {
    const sqlPath = path.join(process.cwd(), 'lib', 'storage', 'mysql-schema.sql');
    const sql = await readFile(sqlPath, 'utf8');
    return new NextResponse(sql, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': 'attachment; filename="greenville_diy_hostinger_mysql_schema.sql"',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Schema SQL file not found' }, { status: 500 });
  }
}
