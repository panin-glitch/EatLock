/**
 * userSettingsService — reads/writes user_settings from Supabase.
 *
 * The `user_settings` table stores per-user feature flags like
 * `micronutrients_enabled`. This service syncs the toggle to the
 * remote table so it persists across devices.
 */

import { supabase } from './supabaseClient';

export interface RemoteUserSettings {
  micronutrients_enabled: boolean;
}

const DEFAULTS: RemoteUserSettings = {
  micronutrients_enabled: false,
};

/**
 * Fetch the user's remote settings row. Returns defaults if none exists.
 */
export async function fetchRemoteUserSettings(): Promise<RemoteUserSettings> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return DEFAULTS;

    const { data, error } = await supabase
      .from('user_settings')
      .select('micronutrients_enabled')
      .eq('user_id', session.user.id)
      .single();

    if (error || !data) return DEFAULTS;
    return {
      micronutrients_enabled: !!data.micronutrients_enabled,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Upsert the micronutrients_enabled flag.
 */
export async function setMicronutrientsEnabled(enabled: boolean): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('user_settings')
    .upsert(
      {
        user_id: session.user.id,
        micronutrients_enabled: enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) throw new Error(error.message);
}
