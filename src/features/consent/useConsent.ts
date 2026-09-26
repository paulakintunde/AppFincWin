// D-17: consent is null until the user answers the one-screen prompt (needsPrompt=true).
// Built on useProfile's data (analytics_consent/analytics_consent_at live on the same
// profiles row) rather than duplicating the fetch — grant()/decline() write only the two
// consent columns and refresh() the shared profile hook afterwards.
import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/you/useProfile';
import { getAnalytics } from '@/services/analytics';

export interface UseConsentResult {
  consent: 'granted' | 'declined' | null;
  /** True once the underlying profile fetch has settled — see useProfile's `loading`. The
   * (app) route group's layout gates the D-17 redirect on this, so a profile still loading
   * is never misread as "no consent on record" and briefly redirected to /consent. */
  loading: boolean;
  needsPrompt: boolean;
  grant(): Promise<void>;
  decline(): Promise<void>;
  setEnabled(on: boolean): Promise<void>;
}

export function useConsent(): UseConsentResult {
  const { user } = useAuth();
  const { profile, loading, refresh } = useProfile();
  const consent = profile?.analytics_consent ?? null;
  // Only "no consent on record" once the profile has actually loaded — otherwise a still-
  // loading profile (consent momentarily null) would falsely read as needing the prompt.
  const needsPrompt = !loading && consent === null;

  const writeConsent = useCallback(
    async (value: 'granted' | 'declined') => {
      if (!user) return;
      await supabase
        .from('profiles')
        .update({ analytics_consent: value, analytics_consent_at: new Date().toISOString() })
        .eq('id', user.id);
      await refresh();
    },
    [user, refresh]
  );

  const grant = useCallback(async () => {
    if (!user) return;
    await writeConsent('granted');
    getAnalytics().enable(user.id);
    getAnalytics().track('analytics_opted_in', {});
  }, [user, writeConsent]);

  const decline = useCallback(async () => {
    await writeConsent('declined');
    await getAnalytics().disable();
  }, [writeConsent]);

  const setEnabled = useCallback(
    async (on: boolean) => {
      if (on) {
        await grant();
      } else {
        await decline();
      }
    },
    [grant, decline]
  );

  // On sign-in with a stored 'granted' consent, enable() runs exactly once — not on every
  // render, and not again after grant()/decline() already called it directly.
  const enabledOnceRef = useRef(false);
  useEffect(() => {
    if (!user) {
      enabledOnceRef.current = false;
      return;
    }
    if (consent === 'granted' && !enabledOnceRef.current) {
      getAnalytics().enable(user.id);
      enabledOnceRef.current = true;
    }
  }, [consent, user]);

  return { consent, loading, needsPrompt, grant, decline, setEnabled };
}
