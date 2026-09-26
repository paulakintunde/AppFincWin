// D-14: loads the signed-in user's own profile row and applies its saved theme (accent +
// font pairing) to the live ThemeProvider on load; setAccent/setPairing update the theme
// immediately (live, FND-06) and persist only the changed column to profiles. Consent
// (analytics_consent/analytics_consent_at) is read here but written by useConsent.ts, which
// is built on top of this hook. Analytics tracking is a no-op unless the user has consented
// (src/services/analytics's own enabled gate), so calling track() unconditionally here is safe.
//
// The row lives in ONE TanStack Query cache entry (queryKeys.profile), not per-hook state.
// Every caller -- the (app) layout's consent gate, ConsentScreen, YouScreen -- reads the same
// copy, so a write seen by one is seen by all in the same render. Per-instance state here was
// the cause of the Phase 0 /you <-> /consent redirect loop: grant() refreshed only the
// consent screen's copy while the layout's copy kept reading "no consent".
import { useCallback, useEffect, useState } from 'react';
import { useIsRestoring, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { getAnalytics } from '@/services/analytics';
import { queryKeys } from '@/data/keys';
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
  /** True only while there is no settled answer yet: the persisted cache is still being
   * restored, or the first fetch is actively in flight. A failed, missing-row or paused
   * (offline) fetch settles to false with profile null -- never an indefinite wait. */
  loading: boolean;
  /** True while a server fetch for the row is in flight (including background refetches). */
  fetching: boolean;
  /** True when the cached row was fetched or written during this app session; false when it
   * is only a copy restored from the persisted cache of an earlier session. */
  fresh: boolean;
  saveError: boolean;
  setAccent(key: AccentKey): Promise<void>;
  setPairing(key: FontPairingKey): Promise<void>;
  /** Refetches the shared row (every caller sees the result). */
  refresh(): Promise<void>;
  /** Patches the shared cached row in place, for a write that has already succeeded. */
  patchCached(patch: Partial<Profile>): void;
}

const PROFILE_COLUMNS = 'id, full_name, email, accent, font_pairing, analytics_consent, analytics_consent_at';

/** Anything the cache holds with an older timestamp was restored from a previous app session. */
const SESSION_STARTED_AT = Date.now();

// Guards theme.applyRemote() to once per signed-in user id across every useProfile caller,
// so a later fetch or a newly mounted screen never re-applies and clobbers an in-flight local
// selection, but a genuinely different user (or the same user after a sign-out, which resets
// the theme) gets their saved theme applied again.
let appliedThemeUserId: string | null = null;

async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single();
  if (error || !data) {
    throw new Error(`profile fetch failed: ${(error as { code?: string } | null)?.code ?? 'no row'}`);
  }
  return data as Profile;
}

export function useProfile(): UseProfileResult {
  const { user } = useAuth();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const isRestoring = useIsRestoring();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: queryKeys.profile(userId ?? ''),
    queryFn: () => fetchProfile(userId as string),
    enabled: userId !== null,
  });

  const [saveError, setSaveError] = useState(false);

  const profile = userId !== null && query.data?.id === userId ? query.data : null;

  const { applyRemote } = theme;
  useEffect(() => {
    if (!userId) {
      appliedThemeUserId = null;
      return;
    }
    if (profile && appliedThemeUserId !== profile.id) {
      applyRemote(profile.accent, profile.font_pairing);
      appliedThemeUserId = profile.id;
    }
  }, [userId, profile, applyRemote]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
  }, [queryClient, userId]);

  const patchCached = useCallback(
    (patch: Partial<Profile>) => {
      if (!userId) return;
      queryClient.setQueryData<Profile>(queryKeys.profile(userId), (prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [queryClient, userId]
  );

  const setAccent = useCallback(
    async (key: AccentKey) => {
      theme.setAccent(key);
      setSaveError(false);
      if (!userId) return;
      const { error } = await supabase.from('profiles').update({ accent: key }).eq('id', userId);
      if (error) {
        setSaveError(true);
        return;
      }
      patchCached({ accent: key });
      getAnalytics().track('theme_accent_changed', { accent: key });
    },
    [theme, userId, patchCached]
  );

  const setPairing = useCallback(
    async (key: FontPairingKey) => {
      theme.setPairing(key);
      setSaveError(false);
      if (!userId) return;
      const { error } = await supabase.from('profiles').update({ font_pairing: key }).eq('id', userId);
      if (error) {
        setSaveError(true);
        return;
      }
      patchCached({ font_pairing: key });
      getAnalytics().track('theme_font_changed', { pairing: key });
    },
    [theme, userId, patchCached]
  );

  // Signed out: always no profile / not loading. Signed in: loading only while the persisted
  // cache restores or the very first fetch is actually running -- a 'paused' (offline) or
  // errored fetch is a settled "no profile", so nothing that gates on this can hang.
  const loading = userId !== null && (isRestoring || (query.isPending && query.fetchStatus === 'fetching'));
  const fetching = userId !== null && query.fetchStatus === 'fetching';
  const fresh = profile !== null && query.dataUpdatedAt >= SESSION_STARTED_AT;

  return { profile, loading, fetching, fresh, saveError, setAccent, setPairing, refresh, patchCached };
}
