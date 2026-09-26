// D-14: loads the signed-in user's own profile row and applies its saved theme (accent +
// font pairing) to the live ThemeProvider on load; setAccent/setPairing update the theme
// immediately (live, FND-06) and persist only the changed column to profiles. Consent
// (analytics_consent/analytics_consent_at) is read here but written by useConsent.ts, which
// is built on top of this hook. Analytics tracking is a no-op unless the user has consented
// (src/services/analytics's own enabled gate), so calling track() unconditionally here is safe.
//
// react-hooks/set-state-in-effect: mirrors useMinVersionGate.ts's shape — the effect calls a
// synchronous wrapper (refresh) that never itself calls a state setter; every setState call
// happens inside the query's own `.then()` callback, one async boundary away from the effect.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { getAnalytics } from '@/services/analytics';
import type { AccentKey } from '@/theme/accents';
import type { FontPairingKey } from '@/theme/fonts';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  accent: AccentKey;
  font_pairing: FontPairingKey;
  analytics_consent: 'granted' | 'declined' | null;
  analytics_consent_at: string | null;
}

export interface UseProfileResult {
  profile: Profile | null;
  loading: boolean;
  saveError: boolean;
  setAccent(key: AccentKey): Promise<void>;
  setPairing(key: FontPairingKey): Promise<void>;
  refresh(): Promise<void>;
}

const PROFILE_COLUMNS = 'id, full_name, email, accent, font_pairing, analytics_consent, analytics_consent_at';

export function useProfile(): UseProfileResult {
  const { user } = useAuth();
  const theme = useTheme();
  // react-hooks/refs: writing a ref during render is disallowed — reflect the latest theme
  // into the ref from an effect (runs after every render) instead, so refresh()/setAccent()/
  // setPairing() (invoked later, from a query callback or an event handler) still always see
  // the current theme context value without re-creating those callbacks on every render.
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  });

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);
  // Guards theme.applyRemote() to once per signed-in user id, so a later refresh() (e.g.
  // after a successful consent/theme write) never re-applies and clobbers an in-flight local
  // selection, but a genuinely different user signing in on the same device gets their own
  // saved theme applied again.
  const appliedThemeUserIdRef = useRef<string | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (!user) return Promise.resolve();
    return Promise.resolve(
      supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).single()
    ).then(({ data, error }) => {
      if (!error && data) {
        const next = data as Profile;
        setProfile(next);
        if (appliedThemeUserIdRef.current !== next.id) {
          themeRef.current.applyRemote(next.accent, next.font_pairing);
          appliedThemeUserIdRef.current = next.id;
        }
      }
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void refresh();
  }, [user, refresh]);

  // Derived, not stored: a signed-out user always reads as no profile / not loading, with no
  // separate setState call needed for that branch (see the file-header note above).
  const effectiveProfile = user ? profile : null;
  const effectiveLoading = user ? loading : false;

  const setAccent = useCallback(
    async (key: AccentKey) => {
      themeRef.current.setAccent(key);
      setSaveError(false);
      if (!user) return;
      const { error } = await supabase.from('profiles').update({ accent: key }).eq('id', user.id);
      if (error) {
        setSaveError(true);
        return;
      }
      setProfile((prev) => (prev ? { ...prev, accent: key } : prev));
      getAnalytics().track('theme_accent_changed', { accent: key });
    },
    [user]
  );

  const setPairing = useCallback(
    async (key: FontPairingKey) => {
      themeRef.current.setPairing(key);
      setSaveError(false);
      if (!user) return;
      const { error } = await supabase.from('profiles').update({ font_pairing: key }).eq('id', user.id);
      if (error) {
        setSaveError(true);
        return;
      }
      setProfile((prev) => (prev ? { ...prev, font_pairing: key } : prev));
      getAnalytics().track('theme_font_changed', { pairing: key });
    },
    [user]
  );

  return { profile: effectiveProfile, loading: effectiveLoading, saveError, setAccent, setPairing, refresh };
}
