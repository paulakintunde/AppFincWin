// D-10, D-11, D-12: the first-launch, full-screen, non-dismissible welcome/sign-in screen.
// There is no credential entry field of any kind on this screen (D-10) -- Apple and Google
// are the two launch sign-in methods.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Screen } from '@/ui/Screen';
import { getEnv } from '@/config/env';
import { captureError } from '@/services/errors';
import { useAuth, type AuthContextValue } from './AuthProvider';
import { AppleSignInButton } from './AppleSignInButton';
import { GoogleSignInButton } from './GoogleSignInButton';
import { RecentAccountTile } from './RecentAccountTile';
import {
  forgetRememberedAccount,
  loadRememberedAccounts,
  type RememberedAccount,
} from './rememberedAccounts';

type SignInFn = () => ReturnType<AuthContextValue['signInWithApple']>;

const keyOf = (a: RememberedAccount): string => `${a.provider}:${a.email}`;

export function WelcomeScreen() {
  const t = useT();
  const { colors, fonts, pairing } = useTheme();
  const { signInWithApple, signInWithGoogle, continueAs, signInWithDifferentAccount } = useAuth();
  const { appleSignInEnabled } = getEnv();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [accounts, setAccounts] = useState<RememberedAccount[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const tileRefs = useRef<Record<string, View | null>>({});
  const buttonsRef = useRef<View | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadRememberedAccounts()
      .then((list) => {
        if (mounted) setAccounts(list);
      })
      .catch(() => {
        // Remembered tiles are a convenience; the sign-in buttons still work without them.
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSignIn = useCallback(async (fn: SignInFn, key: string | null = null) => {
    setError(false);
    setBusyKey(key);
    setBusy(true);
    try {
      // A resolved promise only ever carries 'signedIn' or 'cancelled' (services/auth's own
      // SignInResult type) -- a genuine failure always rejects, never resolves with an error
      // status, so no branch is needed here for a cancelled vs. successful result: neither
      // shows an error, and 'signedIn' also flips useAuth().status, which the root layout
      // (app/_layout.tsx) routes away from this screen on.
      await fn();
    } catch (e) {
      // T-00-17-05: only a generic, localised message reaches the user; provider error
      // detail goes to captureError's scrubbed reporter only.
      captureError(e, { area: 'auth' });
      setError(true);
    } finally {
      setBusy(false);
      setBusyKey(null);
    }
  }, []);

  const handleRemove = useCallback(async (account: RememberedAccount, index: number) => {
    const next = await forgetRememberedAccount(account.provider, account.email);
    setAccounts(next);
    const target = next[Math.min(index, next.length - 1)];
    const node = target ? tileRefs.current[keyOf(target)] : buttonsRef.current;
    const handle = node ? findNodeHandle(node) : null;
    if (handle) {
      try {
        AccessibilityInfo.setAccessibilityFocus(handle);
      } catch {
        // Focus is a nicety; ignore failures.
      }
    }
  }, []);

  const hasTiles = accounts.length > 0;

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={[styles.wordmark, { fontFamily: fonts.display, color: colors.ink }]}>
          {t('auth.welcome.wordmark')}
        </Text>
        <Text style={[styles.tagline, { fontFamily: fonts.body[500], color: colors.inkMuted }]}>
          {t('auth.welcome.tagline')}
        </Text>
        {hasTiles ? (
          <View style={styles.tiles}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, textRole(pairing, 'label'), { color: colors.inkMuted }]}
            >
              {t('auth.welcome.recentHeading')}
            </Text>
            {accounts.map((a, i) => (
              <RecentAccountTile
                key={keyOf(a)}
                account={a}
                busy={busyKey === keyOf(a)}
                disabled={busy}
                tileRef={(node) => {
                  tileRefs.current[keyOf(a)] = node;
                }}
                onPress={() => {
                  void handleSignIn(() => continueAs(a), keyOf(a));
                }}
                onRemove={() => {
                  void handleRemove(a, i);
                }}
              />
            ))}
          </View>
        ) : null}
        <View ref={buttonsRef} style={styles.buttons}>
          <AppleSignInButton
            enabled={appleSignInEnabled}
            busy={busy}
            onPress={() => {
              void handleSignIn(signInWithApple);
            }}
          />
          <GoogleSignInButton
            disabled={busy}
            label={hasTiles ? t('auth.google.different') : undefined}
            onPress={() => {
              void handleSignIn(hasTiles ? signInWithDifferentAccount : signInWithGoogle);
            }}
          />
        </View>
        {hasTiles ? (
          <Text style={[styles.note, { fontFamily: fonts.body[500], color: colors.inkMuted }]}>
            {t('auth.welcome.recentNote')}
          </Text>
        ) : null}
        {error ? (
          <Text style={[styles.error, { fontFamily: fonts.body[600], color: colors.danger }]}>
            {t('auth.error.signInFailed')}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  wordmark: {
    fontSize: fontSize.display,
    lineHeight: fontSize.display,
    letterSpacing: fontSize.display * -0.01,
    textAlign: 'center',
  },
  tagline: {
    marginTop: 12,
    fontSize: fontSize.body,
    textAlign: 'center',
  },
  tiles: {
    marginTop: 26,
    gap: space.gapMd,
  },
  heading: {
    textAlign: 'center',
  },
  note: {
    marginTop: 12,
    fontSize: fontSize.label,
    textAlign: 'center',
  },
  buttons: {
    marginTop: 26,
    gap: space.gapMd,
  },
  error: {
    marginTop: 12,
    fontSize: fontSize.label,
    textAlign: 'center',
  },
});
