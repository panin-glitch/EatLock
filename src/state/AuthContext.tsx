/**
 * Auth context — manages Supabase auth state across the app.
 * Auto-signs-in anonymously if no session exists on boot.
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  isLoading: true,
  isAuthenticated: false,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session — if none exists, sign in anonymously
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (s) {
        setSession(s);
      } else {
        // No persisted session — auto sign-in anonymously
        console.log('[AuthProvider] No session found, signing in anonymously…');
        try {
          const { data: anonData, error } = await supabase.auth.signInAnonymously();
          if (!error && anonData.session) {
            setSession(anonData.session);
            console.log('[AuthProvider] Anonymous sign-in ✓');
          } else {
            console.warn('[AuthProvider] Anonymous sign-in failed:', error?.message);
          }
        } catch (e: any) {
          console.warn('[AuthProvider] Anonymous sign-in error:', e?.message);
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

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    isLoading,
    isAuthenticated: !!session?.user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
