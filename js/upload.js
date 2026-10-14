// Supabase upload (ported from SupabaseManager.swift). The supabase-js UMD
// bundle in vendor/ exposes a global `supabase`.

import { SUPABASE } from './config.js';

let client = null;

export const uploadsConfigured = !!(SUPABASE.url && SUPABASE.publishableKey);

function getClient() {
  if (!uploadsConfigured) throw new Error('Uploads are not set up. Add your Supabase details to js/config.js.');
  if (!client) {
    if (!window.supabase?.createClient) throw new Error('Supabase library failed to load.');
    client = window.supabase.createClient(SUPABASE.url, SUPABASE.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/** Reuses the saved Supabase session when possible, otherwise signs in anonymously. */
export async function ensureAuthenticated() {
  const auth = getClient().auth;
  const { data } = await auth.getSession();
  if (data?.session) return data.session;
  const { data: signIn, error } = await auth.signInAnonymously();
  if (error) throw error;
  return signIn.session;
}

/** Uploads a file and returns its public URL. */
export async function uploadMedia(path, blob, contentType) {
  await ensureAuthenticated();
  const storage = getClient().storage.from(SUPABASE.bucket);
  const { error } = await storage.upload(path, blob, { contentType, upsert: false });
  if (error) throw error;
  return storage.getPublicUrl(path).data.publicUrl;
}

/** Same folder naming as the iOS app: MMddyyyy_THH-mm-ssZ in New York time. */
export function makeSessionID(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.month}${parts.day}${parts.year}_T${parts.hour}-${parts.minute}-${parts.second}Z`;
}
