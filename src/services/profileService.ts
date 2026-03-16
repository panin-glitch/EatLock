import { supabase } from './supabaseClient';

export interface ProfileRecord {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  updated_at: string | null;
}

export const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;

export type UsernameSaveResult =
  | { ok: true; username: string; userId: string; updatedAt?: string | null }
  | { ok: false; code: 'invalid' | 'taken' | 'unknown'; message: string };

export function normalizeUsername(raw: string): string {
  return (raw || '').trim();
}

export function isValidUsername(raw: string): boolean {
  const value = normalizeUsername(raw);
  return USERNAME_REGEX.test(value);
}

function isUniqueUsernameError(error: any): boolean {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  return (
    code === '23505' ||
    message.includes('profiles_username_lower_unique_idx') ||
    details.includes('profiles_username_lower_unique_idx')
  );
}

export async function saveUsername(userId: string, rawUsername: string): Promise<UsernameSaveResult> {
  const username = normalizeUsername(rawUsername);

  if (!isValidUsername(username)) {
    return {
      ok: false,
      code: 'invalid',
      message: 'Username must be 3–20 characters and use only letters, numbers, or _.',
    };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) {
    return { ok: false, code: 'unknown', message: authError?.message || 'Could not resolve current user.' };
  }

  const uid = authData.user.id;
  if (uid !== userId) {
    return { ok: false, code: 'unknown', message: 'User session changed. Please try again.' };
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: uid,
        username,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('user_id, username, updated_at')
    .single();

  if (!error && data?.username === username) {
    return { ok: true, username: data.username, userId: data.user_id, updatedAt: data.updated_at };
  }

  if (!error) {
    return { ok: false, code: 'unknown', message: 'Username save did not persist. Please try again.' };
  }

  if (isUniqueUsernameError(error)) {
    return { ok: false, code: 'taken', message: 'That username is taken' };
  }

  return { ok: false, code: 'unknown', message: error.message || 'Could not update username.' };
}

export async function fetchProfileByUserId(userId: string): Promise<ProfileRecord | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, avatar_url, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}
