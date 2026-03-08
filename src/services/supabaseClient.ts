/**
 * Supabase client singleton for EatLock.
 */
import { createClient } from '@supabase/supabase-js';
import { ENV } from '../config/env';
import { secureSessionStorage } from './secureSessionStorage';

export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: {
    storage: secureSessionStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
