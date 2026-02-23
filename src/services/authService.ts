/**
 * Auth service — wraps Supabase Auth operations.
 */
import { supabase } from './supabaseClient';

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'eatlock://reset-password',
  });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Ensure a Supabase session exists. If no session is found, sign in
 * anonymously so the app has a valid JWT for authenticated Worker calls.
 * The session is persisted in AsyncStorage and auto-refreshed by the client.
 */
export async function ensureAuth(): Promise<void> {
  // First try: maybe we already have a persisted session
  const { data } = await supabase.auth.getSession();
  if (data.session) return;

  // No session — sign in anonymously
  console.log('[ensureAuth] No session found, signing in anonymously…');
  const { data: anonData, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('[ensureAuth] Anonymous sign-in failed:', error.message);
    throw error;
  }
  if (!anonData.session) {
    console.error('[ensureAuth] signInAnonymously returned no session');
    throw new Error('Anonymous sign-in succeeded but no session was returned');
  }
  console.log('[ensureAuth] Signed in anonymously ✓');
}
