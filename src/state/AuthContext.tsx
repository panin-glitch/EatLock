/**
 * Auth context — manages Supabase auth state across the app.
 * Auto-signs-in anonymously if no session exists on boot.
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { ensureAuth, isAutoAnonymousSignInEnabled } from '../services/authService';
import { fetchProfileByUserId, type ProfileRecord } from '../services/profileService';
import { getDisplayName } from '../utils/displayName';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: ProfileRecord | null;
  displayName: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshProfile: () => Promise<ProfileRecord | null>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  profile: null,
  displayName: 'User',
  isLoading: true,
  isAuthenticated: false,
  refreshProfile: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = React.useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) {
      setProfile(null);
      return null;
    }
    try {
      const next = await fetchProfileByUserId(uid);
      setProfile(next);
      return next;
    } catch {
      return null;
    }
  }, [session?.user?.id]);

  useEffect(() => {
    // Get initial session — if none exists, sign in anonymously
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (s) {
        setSession(s);
      } else {
        const autoAnonEnabled = await isAutoAnonymousSignInEnabled();
        if (autoAnonEnabled) {
          try {
            const accessToken = await ensureAuth({ allowAnonymousSignIn: true });
            if (accessToken) {
              const { data: refreshed } = await supabase.auth.getSession();
              setSession(refreshed.session ?? null);
            }
          } catch (e: any) {
            console.warn('[AuthProvider] Anonymous sign-in error:', e?.message);
          }
        }
      }
      setIsLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    profile,
    displayName: getDisplayName(session?.user ?? null, profile),
    isLoading,
    isAuthenticated: !!session?.user,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
