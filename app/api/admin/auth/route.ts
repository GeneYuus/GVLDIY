// app/api/admin/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  appendAdminSessionCookie,
  clearAdminSessionCookie,
  createSignedAdminToken,
  isPreviewDemoModeEnabled,
  verifyAdminSession,
  verifyOrClaimAdminPasskey,
} from '@/lib/dal/auth';
import { archiveRepository } from '@/lib/storage/repository';

export async function GET(req: NextRequest) {
  const authenticated = await verifyAdminSession(req);
  const demoModeAvailable = isPreviewDemoModeEnabled();

  if (!authenticated) {
    const publicPayload = await archiveRepository.getPublicPayload();
    return NextResponse.json({
      authenticated: false,
      demoModeAvailable,
      siteSettings: publicPayload.siteSettings,
    });
  }

  const adminPayload = await archiveRepository.getAdminFullPayload();
  return NextResponse.json({
    authenticated: true,
    demoModeAvailable,
    adminPayload,
    subscribers: adminPayload.subscribers,
    futureTasks: adminPayload.futureTasks,
    siteSettings: adminPayload.siteSettings,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = String(body.mode || 'passkey');
    const demoModeAvailable = isPreviewDemoModeEnabled();

    if (mode === 'demo') {
      if (!demoModeAvailable) {
        return NextResponse.json(
          { error: 'Demo unlock is disabled when ADMIN_PASSKEY is configured' },
          { status: 403 }
        );
      }
    } else {
      const passkey = String(body.passkey || '');
      if (!verifyOrClaimAdminPasskey(passkey)) {
        return NextResponse.json(
          { error: 'Invalid curator passkey' },
          { status: 401 }
        );
      }
    }

    const token = await createSignedAdminToken();
    const adminPayload = await archiveRepository.getAdminFullPayload();

    const res = NextResponse.json({
      authenticated: true,
      token,
      demoModeAvailable,
      adminPayload,
      subscribers: adminPayload.subscribers,
      futureTasks: adminPayload.futureTasks,
      siteSettings: adminPayload.siteSettings,
    });

    appendAdminSessionCookie(res, req, token);
    return res;
  } catch {
    return NextResponse.json(
      { error: 'Invalid login request' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ authenticated: false });
  clearAdminSessionCookie(res, req);
  return res;
}
