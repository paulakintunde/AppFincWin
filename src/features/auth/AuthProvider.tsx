// ACC-01/ACC-02/ACC-05: exposes session/user/status from supabase.auth.onAuthStateChange, and
// the two sign-in entry points screens call. Sign-out is NOT here -- it lives in 00-18, which
// needs the D-15 wipe flow and the analytics consent reset.
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import {
  configureGoogle,
  retryPendingFirstAuthProfile,
  signInWithApple,
  signInWithGoogle,
  type SignInResult,
} from '@/services/auth';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  signInWithApple(): Promise<SignInResult>;
  signInWithGoogle(): Promise<SignInResult>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Configured once, independent of the session-loading effect below.
  useEffect(() => {
    configureGoogle();
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setStatus(data.session ? 'signedIn' : 'signedOut');
      if (data.session) {
        // ACC-03: best-effort -- a failed replay leaves the pending payload queued for the
        // next launch (see firstAuthProfile.ts), so it is never surfaced here.
        void retryPendingFirstAuthProfile();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'SIGNED_IN') setStatus('signedIn');
      else if (event === 'SIGNED_OUT') setStatus('signedOut');
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    status,
    session,
    user: session?.user ?? null,
    signInWithApple,
    signInWithGoogle,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
