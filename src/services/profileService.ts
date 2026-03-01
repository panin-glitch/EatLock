import { supabase } from './supabaseClient';

export const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;

export type UsernameSaveResult =
  | { ok: true; username: string }
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

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        username,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (!error) {
    return { ok: true, username };
  }

  if (isUniqueUsernameError(error)) {
    return { ok: false, code: 'taken', message: 'That username is taken' };
  }

  return { ok: false, code: 'unknown', message: error.message || 'Could not update username.' };
}
