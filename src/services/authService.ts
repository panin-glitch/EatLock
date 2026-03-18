/**
 * Auth service — wraps Supabase Auth operations.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { ENV } from '../config/env';

type SignOutScope = 'global' | 'local' | 'others';
const AUTO_ANON_SIGN_IN_KEY = 'tadlock:auto_anonymous_sign_in_enabled';
let autoAnonEnabledCache: boolean | null = null;

function isAnonymousSignInDisabledError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message || error || '').toLowerCase();
  return (
    message.includes('anonymous sign-ins are disabled')
    || message.includes('anonymous signups are disabled')
    || message.includes('anonymous provider is disabled')
  );
}

async function setAutoAnonymousSignInEnabled(enabled: boolean): Promise<void> {
  autoAnonEnabledCache = enabled;
  await AsyncStorage.setItem(AUTO_ANON_SIGN_IN_KEY, enabled ? 'true' : 'false');
}

export async function isAutoAnonymousSignInEnabled(): Promise<boolean> {
  if (autoAnonEnabledCache != null) {
    return autoAnonEnabledCache;
  }
  const stored = await AsyncStorage.getItem(AUTO_ANON_SIGN_IN_KEY);
  autoAnonEnabledCache = stored !== 'false';
  return autoAnonEnabledCache;
}

export async function allowAutoAnonymousSignIn(): Promise<void> {
  await setAutoAnonymousSignInEnabled(true);
}

export async function suppressAutoAnonymousSignIn(): Promise<void> {
  await setAutoAnonymousSignInEnabled(false);
}

export async function signUp(email: string, password: string) {
  await allowAutoAnonymousSignIn();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  await allowAutoAnonymousSignIn();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut(scope: SignOutScope = 'global') {
  await suppressAutoAnonymousSignIn();
  const { error } = await supabase.auth.signOut({ scope });
  if (error) {
    await allowAutoAnonymousSignIn();
    throw error;
  }
}

function extractApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const candidate = (payload as { error?: string; message?: string }).error
    || (payload as { error?: string; message?: string }).message;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : fallback;
}

export async function resetPassword(email: string) {
  const options = ENV.PASSWORD_RESET_URL
    ? { redirectTo: ENV.PASSWORD_RESET_URL }
    : undefined;
  const { error } = options
    ? await supabase.auth.resetPasswordForEmail(email, options)
    : await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export function getResetPasswordSuccessMessage(): string {
  return ENV.PASSWORD_RESET_URL
    ? 'A password reset link has been sent. It will open in your browser.'
    : 'A password reset link has been sent using your secure web reset flow.';
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function updateEmail(newEmail: string) {
  const { error } = await supabase.auth.updateUser({ email: newEmail });
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

export async function refreshAuthSession(): Promise<string | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    console.warn('[auth] refreshSession failed:', error.message);
    return null;
  }
  return data.session?.access_token ?? null;
}

export async function deleteCurrentAccountRemote(): Promise<void> {
  await suppressAutoAnonymousSignIn();
  let token = await getAccessToken();
  if (!token) {
    token = await refreshAuthSession();
  }
  if (!token) {
    throw new Error('Not authenticated');
  }

  const request = async (bearer: string) =>
    fetch(`${ENV.WORKER_API_URL}/v1/account`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${bearer}`,
      },
    });

  let response = await request(token);
  if (response.status === 401) {
    const refreshed = await refreshAuthSession();
    if (!refreshed) {
      throw new Error('Session expired. Please sign in again.');
    }
    response = await request(refreshed);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(extractApiErrorMessage(payload, `Account deletion failed: HTTP ${response.status}`));
  }
}

/**
 * Ensure a Supabase session exists. If no session is found, sign in
 * anonymously so the app has a valid JWT for authenticated Worker calls.
 * The session is persisted securely and auto-refreshed by the client.
 */
export async function ensureAuth(options?: { allowAnonymousSignIn?: boolean }): Promise<string | null> {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
    console.warn('[auth] Skipping auth bootstrap because Supabase env is missing in this build.');
    return null;
  }

  // First try: maybe we already have a persisted session
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) return data.session.access_token;

  const allowAnonymousSignIn = options?.allowAnonymousSignIn ?? await isAutoAnonymousSignInEnabled();
  if (!allowAnonymousSignIn) {
    return null;
  }

  // No session — sign in anonymously
  await allowAutoAnonymousSignIn();
  const { data: anonData, error } = await supabase.auth.signInAnonymously();
  if (error) {
    if (isAnonymousSignInDisabledError(error)) {
      await suppressAutoAnonymousSignIn();
      return null;
    }
    console.error('[ensureAuth] Anonymous sign-in failed:', error.message);
    throw error;
  }
  if (!anonData.session) {
    console.error('[ensureAuth] signInAnonymously returned no session');
    throw new Error('Anonymous sign-in succeeded but no session was returned');
  }
  return anonData.session.access_token;
}
