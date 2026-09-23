import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ACCENTS, DEFAULT_ACCENT, type AccentKey } from './accents';
import { FONT_PAIRINGS, type FontPairingKey, type FontWeight } from './fonts';
import { colors } from './tokens';
import { DEFAULT_PAIRING, readThemeCache, writeThemeCache } from './themeCache';

export interface ThemeContextValue {
  /** True once the cached accent/pairing has been read from AsyncStorage. */
  ready: boolean;
  accent: AccentKey;
  pairing: FontPairingKey;
  colors: typeof colors & { accent: string };
  fonts: { display: string; body: Record<FontWeight, string> };
  setAccent: (key: AccentKey) => void;
  setPairing: (key: FontPairingKey) => void;
  /** Applies accent/pairing pushed from the profiles row (D-14, used by 00-18). */
  applyRemote: (accent: AccentKey, pairing: FontPairingKey) => void;
  /** Returns to defaults — called after sign-out, once wipeDeviceData has cleared the cache. */
  reset: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [accent, setAccent] = useState<AccentKey>(DEFAULT_ACCENT);
  const [pairing, setPairing] = useState<FontPairingKey>(DEFAULT_PAIRING);

  // Hydrate from the local cache once on mount, so first ready render already shows the
  // saved theme rather than a flash of the default green (D-14).
  useEffect(() => {
    let cancelled = false;
    readThemeCache().then((cached) => {
      if (cancelled) return;
      setAccent(cached.accent);
      setPairing(cached.pairing);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist every accent/pairing change, including remote-applied and reset changes.
  // Runs after hydration completes so cold-boot hydration never re-writes what it just read.
  useEffect(() => {
    if (!ready) return;
    void writeThemeCache({ accent, pairing });
  }, [ready, accent, pairing]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ready,
      accent,
      pairing,
      colors: { ...colors, accent: ACCENTS[accent] },
      fonts: {
        display: FONT_PAIRINGS[pairing].display,
        body: FONT_PAIRINGS[pairing].body,
      },
      setAccent,
      setPairing,
      applyRemote: (nextAccent: AccentKey, nextPairing: FontPairingKey) => {
        setAccent(nextAccent);
        setPairing(nextPairing);
      },
      reset: () => {
        setAccent(DEFAULT_ACCENT);
        setPairing(DEFAULT_PAIRING);
      },
    }),
    [ready, accent, pairing]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
