// D-10, D-11, D-12: the first-launch, full-screen, non-dismissible welcome/sign-in screen.
// There is no credential entry field of any kind on this screen (D-10) -- Apple and Google
// are the two launch sign-in methods.
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize } from '@/theme/typography';
import { Screen } from '@/ui/Screen';
import { getEnv } from '@/config/env';
import { captureError } from '@/services/errors';
import { useAuth, type AuthContextValue } from './AuthProvider';
import { AppleSignInButton } from './AppleSignInButton';
import { GoogleSignInButton } from './GoogleSignInButton';

type SignInFn = AuthContextValue['signInWithApple'] | AuthContextValue['signInWithGoogle'];

export function WelcomeScreen() {
  const t = useT();
  const { colors, fonts } = useTheme();
  const { signInWithApple, signInWithGoogle } = useAuth();
  const { appleSignInEnabled } = getEnv();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const handleSignIn = useCallback(async (fn: SignInFn) => {
    setError(false);
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
    }
  }, []);

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={[styles.wordmark, { fontFamily: fonts.display, color: colors.ink }]}>
          {t('auth.welcome.wordmark')}
        </Text>
        <Text style={[styles.tagline, { fontFamily: fonts.body[500], color: colors.inkMuted }]}>
          {t('auth.welcome.tagline')}
        </Text>
        <View style={styles.buttons}>
          <AppleSignInButton
            enabled={appleSignInEnabled}
            busy={busy}
            onPress={() => {
              void handleSignIn(signInWithApple);
            }}
          />
          <GoogleSignInButton
            disabled={busy}
            onPress={() => {
              void handleSignIn(signInWithGoogle);
            }}
          />
        </View>
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
