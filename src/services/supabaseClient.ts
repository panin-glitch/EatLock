/**
 * Supabase client singleton for EatLock.
 */
import { createClient } from '@supabase/supabase-js';
import { ENV } from '../config/env';
import { secureSessionStorage } from './secureSessionStorage';

const supabaseUrl = ENV.SUPABASE_URL || 'https://placeholder.invalid';
const supabaseAnonKey = ENV.SUPABASE_ANON_KEY || 'sb_publishable_placeholder';

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
  console.warn('[supabase] Missing EXPO_PUBLIC_SUPABASE_* environment variables in this build.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureSessionStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
