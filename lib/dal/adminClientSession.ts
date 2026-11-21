// lib/dal/adminClientSession.ts
'use client';

import { useSyncExternalStore } from 'react';

// Held strictly in JS runtime memory (never written to localStorage or sessionStorage)
let inMemoryAdminToken: string | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function getAdminMemoryToken(): string | null {
  return inMemoryAdminToken;
}

export function setAdminMemoryToken(token: string | null): void {
  inMemoryAdminToken = token;
  emitChange();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAdminMemoryToken(): string | null {
  return useSyncExternalStore(subscribe, getAdminMemoryToken, () => null);
}

export async function adminFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set('X-Requested-With', 'gvl-admin');
  if (inMemoryAdminToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryAdminToken}`);
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });
}

export async function downloadAuthenticatedFile(
  url: string,
  filename: string
): Promise<boolean> {
  try {
    const res = await adminFetch(url, { method: 'GET' });
    if (!res.ok) return false;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    return true;
  } catch {
    return false;
  }
}
