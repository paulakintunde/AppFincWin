// D-17: consent is null until the user answers the one-screen prompt (needsPrompt=true).
// Built on useProfile's data (analytics_consent/analytics_consent_at live on the same
// profiles row) rather than duplicating the fetch — grant()/decline() write only the two
// consent columns, then patch the shared cached row so every consumer (notably the (app)
// layout's redirect gate) flips in the same render, then refetch it.
import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/you/useProfile';
import { getAnalytics } from '@/services/analytics';
import { registerWipeHandler } from '@/services/storage/wipe';

export interface UseConsentResult {
  consent: 'granted' | 'declined' | null;
  /** True until the consent answer can be trusted: the profile is still loading, or the only
   * copy is a persisted "no consent" from an earlier session and the fresh fetch is still in
   * flight. The (app) route group's layout gates the D-17 redirect on this, so neither a
   * loading profile nor a stale cached null is misread as "no consent on record". */
  loading: boolean;
  /** True only when a loaded profile row genuinely has no consent recorded. A failed or
   * missing profile fetch never prompts (the prompt is re-offered once a fetch succeeds). */
  needsPrompt: boolean;
  /** Resolves true once the answer is saved; false if the write failed (nothing changes on the
   * server; decline() still turns analytics off on this device). */
  grant(): Promise<boolean>;
  decline(): Promise<boolean>;
  setEnabled(on: boolean): Promise<boolean>;
}

// WR-01: a user who declined on this device this session, even if the server write failed and
// the stored row still reads 'granted'. Module-level so no other useConsent consumer (or a
// later mount) re-enables analytics from that stale row; cleared by a successful grant().
let declinedLocallyUserId: string | null = null;
registerWipeHandler({
  id: 'consent-declined-locally',
  wipe: async () => {
    declinedLocallyUserId = null;
  },
});

export function useConsent(): UseConsentResult {
  const { user } = useAuth();
  const { profile, loading: profileLoading, fetching, fresh, refresh, patchCached } = useProfile();
  const consent = profile?.analytics_consent ?? null;

  // A persisted "no consent" restored from an earlier session is not trusted while the fresh
  // fetch is still running -- otherwise a cold start could briefly redirect a user who has
  // already answered (the refetch must win). If that fetch fails, this settles to false.
  const awaitingFresh = profile !== null && consent === null && !fresh && fetching;
  const loading = profileLoading || awaitingFresh;
  const needsPrompt = !loading && profile !== null && consent === null;

  const enabledOnceRef = useRef(false);

  const writeConsent = useCallback(
    async (value: 'granted' | 'declined'): Promise<boolean> => {
      if (!user) return false;
      const at = new Date().toISOString();
      const { error } = await supabase
        .from('profiles')
        .update({ analytics_consent: value, analytics_consent_at: at })
        .eq('id', user.id);
      if (error) return false;
      // Every consumer of the shared row sees the new answer in the same render, before the
      // confirming refetch lands.
      patchCached({ analytics_consent: value, analytics_consent_at: at });
      void refresh();
      return true;
    },
    [user, refresh, patchCached]
  );

  const grant = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const ok = await writeConsent('granted');
    if (!ok) return false;
    declinedLocallyUserId = null;
    getAnalytics().enable(user.id);
    enabledOnceRef.current = true;
    getAnalytics().track('analytics_opted_in', {});
    return true;
  }, [user, writeConsent]);

  // WR-01: withdrawal takes effect on this device first, whatever happens to the server write
  // (GDPR Art. 7(3)); a false result still tells the caller the answer was not saved.
  const decline = useCallback(async (): Promise<boolean> => {
    declinedLocallyUserId = user?.id ?? null;
    enabledOnceRef.current = false;
    await getAnalytics().disable();
    return writeConsent('declined');
  }, [user, writeConsent]);

  const setEnabled = useCallback((on: boolean) => (on ? grant() : decline()), [grant, decline]);

  // On sign-in with a stored 'granted' consent, enable() runs exactly once — not on every
  // render, and not again after grant()/decline() already called it directly. Only a row
  // fetched or written this session counts (CR-01): a persisted 'granted' from an earlier
  // session may since have been withdrawn on another device, so it never enables analytics
  // on its own. A fresh answer that is no longer 'granted' turns analytics back off.
  useEffect(() => {
    if (!user) {
      enabledOnceRef.current = false;
      return;
    }
    if (!fresh) return;
    if (consent === 'granted' && !enabledOnceRef.current && declinedLocallyUserId !== user.id) {
      getAnalytics().enable(user.id);
      enabledOnceRef.current = true;
    } else if (consent !== 'granted' && enabledOnceRef.current) {
      enabledOnceRef.current = false;
      void getAnalytics().disable();
    }
  }, [consent, user, fresh]);

  return { consent, loading, needsPrompt, grant, decline, setEnabled };
}
