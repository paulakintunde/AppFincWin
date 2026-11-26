// 10-21 (ACC-08, ACC-09, UI-SPEC 1c, D-03, D-29, D-33).
//  - Device mode (default): the phone's own lock. IconTile, heading and an "Unlock" pill; the prompt opens once on its own.
//    The phone owns wrong tries and lockouts, so there is no pad, no wait ladder and no re-sign-in here.
//  - App-PIN mode (optional extra): PinDots + PinPad, the wait ladder, and after the 10th wrong try (or "Forgot PIN?")
//    a sign-in again with Apple or Google. The same person keeps the phone copy and sets a new PIN; a different person
//    gets the normal sign-out wipe (D-29).
// Wrong tries are ink text with no shake and no red. Nothing here shows a balance, name or amount.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useT } from '@/i18n';
import { getEnv } from '@/config/env';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppleSignInButton } from '@/features/auth/AppleSignInButton';
import { GoogleSignInButton } from '@/features/auth/GoogleSignInButton';
import { performSignOut, requestSignOut } from '@/features/auth/signOut';
import { PlanLink } from '@/features/plans/components/NoticeCard';
import {
  authenticateBiometric,
  authenticateDevice,
  biometricKind,
  type BiometricKind,
} from '@/services/lock/biometric';
import { checkPin, clearTries, loadLockState, type LockSettings } from '@/services/lock/lockStore';
import { PIN_LENGTH } from '@/services/lock/pin';
import { decideAfterReauth } from '@/services/lock/reauth';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { hapticTap, hapticWarn } from '@/ui/haptics';
import { IconTile } from '@/ui/icons/IconTile';
import { Pill } from '@/ui/Pill';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { Text } from '@/ui/Text';
import { LockSetupSheet } from './LockSetupSheet';
import { PinDots } from './PinDots';
import { PinPad } from './PinPad';
import { currentUserId } from './currentUser';
import { formatClock } from './timing';

type View_ = 'pin' | 'wait' | 'reauth';
type Line = { key: 'wrong'; left: number } | { key: 'over' } | null;

export interface LockScreenProps {
  settings: LockSettings;
  onUnlock: () => void;
}

export function LockScreen({ settings, onUnlock }: LockScreenProps): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { colors, pairing } = theme;
  const insets = useSafeAreaInsets();
  const { signInWithApple, signInWithGoogle } = useAuth();
  const device = settings.lockMethod === 'device';

  const [view, setView] = useState<View_>('pin');
  const [digits, setDigits] = useState('');
  const [line, setLine] = useState<Line>(null);
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [kind, setKind] = useState<BiometricKind>('none');
  const [reauthed, setReauthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signInFailed, setSignInFailed] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [unsentCount, setUnsentCount] = useState<number | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const alive = useRef(true);
  const autoRan = useRef(false);

  // The gate unmounts the app behind this screen, and the app's own Gate is what hides the splash, so hide it here.
  useEffect(() => {
    try {
      void Promise.resolve(SplashScreen.hideAsync?.()).catch(() => undefined);
    } catch {
      // Already hidden.
    }
  }, []);

  // Android back is consumed: it never reveals content, and the app stays on this screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const unlocked = useCallback(() => {
    hapticTap();
    onUnlock();
  }, [onUnlock]);

  const runDevice = useCallback(async () => {
    const r = await authenticateDevice(t('system.appLock.promptOpen'), t('system.appLock.promptCancel'));
    if (r === 'ok' && alive.current) unlocked();
  }, [t, unlocked]);

  const runBiometric = useCallback(async () => {
    const r = await authenticateBiometric(t('system.appLock.promptOpen'), t('system.appLock.usePinInstead'));
    if (!alive.current) return;
    if (r === 'ok') unlocked();
  }, [t, unlocked]);

  // On appear: the system prompt opens once on its own (Pitfall 8: the lock host ignores AppState while it is open).
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (device) {
      void runDevice();
      return;
    }
    void (async () => {
      const [state, k] = await Promise.all([loadLockState(), biometricKind()]);
      if (!alive.current) return;
      setKind(k);
      const t0 = Date.now();
      if (state.wrongTries >= 10) {
        setView('reauth');
        return;
      }
      if (state.lockUntil !== null && state.lockUntil > t0) {
        setUntil(state.lockUntil);
        setNow(t0);
        setView('wait');
        return;
      }
      if (settings.biometric && k !== 'none') void runBiometric();
    })();
  }, [device, runDevice, runBiometric, settings.biometric]);

  // The wait counts down each second; the pad comes back when it ends.
  useEffect(() => {
    if (view !== 'wait') return undefined;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) {
        setView('pin');
        setLine({ key: 'over' });
        setDigits('');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [view, until]);

  const submit = useCallback(
    async (pin: string) => {
      const res = await checkPin(pin, Date.now());
      if (!alive.current) return;
      if (res.ok) {
        unlocked();
        return;
      }
      setDigits('');
      hapticWarn();
      if (res.backoff.kind === 'reauth') {
        setView('reauth');
      } else if (res.backoff.kind === 'wait') {
        const n = Date.now();
        setNow(n);
        setUntil(n + res.backoff.ms);
        setLine(null);
        setView('wait');
      } else {
        setLine({ key: 'wrong', left: Math.max(1, 5 - res.wrongTries) });
      }
    },
    [unlocked]
  );

  const onDigit = (d: string): void => {
    if (digits.length >= PIN_LENGTH) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  const handleSignIn = async (fn: () => Promise<{ status: 'signedIn' | 'cancelled' }>): Promise<void> => {
    setSignInFailed(false);
    setBusy(true);
    try {
      const r = await fn();
      if (r.status !== 'signedIn') return;
      const uid = await currentUserId();
      if (uid === null) return;
      if (decideAfterReauth(settings.ownerUserId, uid) === 'keep') {
        await clearTries();
        if (!alive.current) return;
        setReauthed(true);
        setSetupOpen(true);
      } else {
        await performSignOut({ resetTheme: theme.reset });
      }
    } catch {
      if (alive.current) setSignInFailed(true);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const confirmSignOut = async (): Promise<void> => {
    setSignOutOpen(false);
    const r = await requestSignOut({ resetTheme: theme.reset });
    if (r.needsConfirm && alive.current) setUnsentCount(r.count ?? 0);
  };

  const remaining = Math.max(0, until - now);
  const bucket = Math.ceil(remaining / 10_000) * 10_000; // spoken every 10 s, not every second
  const bioLabel = kind === 'faceId' ? 'useFaceId' : kind === 'touchId' ? 'useTouchId' : 'useFingerprint';
  const showBioLink = !device && view === 'pin' && settings.biometric && kind !== 'none';

  const bodyKey = device
    ? 'system.appLock.lockedBodyDevice'
    : settings.biometric && kind === 'faceId'
      ? 'system.appLock.lockedBodyFaceId'
      : settings.biometric && kind === 'touchId'
        ? 'system.appLock.lockedBodyTouchId'
        : settings.biometric && kind === 'fingerprint'
          ? 'system.appLock.lockedBodyFingerprint'
          : 'system.appLock.lockedBodyPin';

  const muted = { ...textRole(pairing, 'body'), color: colors.inkMuted, textAlign: 'center' as const };
  const label = { ...textRole(pairing, 'label'), color: colors.ink, textAlign: 'center' as const };

  return (
    <Animated.View
      testID="lock-screen"
      entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
      style={[styles.root, { backgroundColor: colors.canvas }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + step.section, paddingBottom: insets.bottom + step.section },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {view === 'reauth' ? (
          <View style={styles.column} testID="lock-reauth">
            <IconTile icon="pinLock" size={48} color={colors.inkDim} tint={colors.fill1} />
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink, textAlign: 'center' }}>
              {t('system.appLock.tenTitle')}
            </Text>
            <Text style={muted}>{t('system.appLock.tenBody')}</Text>
            {reauthed ? (
              <View style={styles.full}>
                <Pill label={t('system.appLock.setNewPin')} variant="primary" tall onPress={() => setSetupOpen(true)} />
              </View>
            ) : (
              <View style={styles.full}>
                <AppleSignInButton
                  enabled={getEnv().appleSignInEnabled}
                  busy={busy}
                  onPress={() => void handleSignIn(signInWithApple)}
                />
                <GoogleSignInButton disabled={busy} onPress={() => void handleSignIn(signInWithGoogle)} />
              </View>
            )}
            {signInFailed ? <Text style={label}>{t('auth.error.signInFailed')}</Text> : null}
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>
              {t('system.appLock.tenFooter')}
            </Text>
          </View>
        ) : device ? (
          <View style={styles.column} testID="lock-device">
            <IconTile icon="pinLock" size={48} color={colors.inkDim} tint={colors.fill1} />
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink, textAlign: 'center' }}>
              {t('system.appLock.lockedTitle')}
            </Text>
            <Text style={muted}>{t(bodyKey)}</Text>
            <View style={styles.full}>
              <Pill label={t('system.appLock.deviceUnlock')} variant="primary" tall onPress={() => void runDevice()} />
            </View>
          </View>
        ) : (
          <View style={styles.column} testID="lock-pin">
            <IconTile icon="pinLock" size={48} color={colors.inkDim} tint={colors.fill1} />
            {view === 'wait' ? (
              <>
                <StatusBadge status="locked" />
                <Text
                  accessibilityRole="header"
                  accessibilityLiveRegion="polite"
                  accessibilityLabel={t('system.appLock.waitAnnounce', { time: formatClock(bucket) })}
                  style={{ ...textRole(pairing, 'heading'), color: colors.ink, textAlign: 'center', fontVariant: ['tabular-nums'] }}
                >
                  {t('system.appLock.waitTitle', { time: formatClock(remaining) })}
                </Text>
              </>
            ) : (
              <>
                <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink, textAlign: 'center' }}>
                  {t('system.appLock.lockedTitle')}
                </Text>
                <Text style={muted}>{t(bodyKey)}</Text>
              </>
            )}
            <Text style={label} accessibilityLiveRegion="polite">
              {line?.key === 'wrong'
                ? t('system.appLock.wrongPin', { count: line.left })
                : line?.key === 'over'
                  ? t('system.appLock.waitOver')
                  : view === 'wait'
                    ? ' '
                    : t('system.appLock.enterPin')}
            </Text>
            <PinDots filled={digits.length} />
            <PinPad
              disabled={view === 'wait'}
              onDigit={onDigit}
              onBackspace={() => setDigits((d) => d.slice(0, -1))}
            />
          </View>
        )}

        <View style={styles.footer}>
          {showBioLink ? (
            <PlanLink label={t(`system.appLock.${bioLabel}`)} onPress={() => void runBiometric()} testID="lock-use-biometric" />
          ) : null}
          {!device && view === 'pin' ? (
            <PlanLink label={t('system.appLock.forgotPin')} onPress={() => setForgotOpen(true)} testID="lock-forgot" />
          ) : null}
          <PlanLink label={t('system.appLock.signOut')} onPress={() => setSignOutOpen(true)} testID="lock-sign-out" />
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={signOutOpen}
        title={t('system.appLock.signOutSheetTitle')}
        body={t('system.appLock.signOutSheetBody')}
        confirmLabel={t('system.appLock.signOutSheetConfirm')}
        cancelLabel={t('system.appLock.signOutSheetStay')}
        onConfirm={() => void confirmSignOut()}
        onCancel={() => setSignOutOpen(false)}
      />
      <ConfirmSheet
        visible={unsentCount !== null}
        body={t('signOut.confirm.body', { count: unsentCount ?? 0 })}
        confirmLabel={t('signOut.confirm.proceed')}
        cancelLabel={t('signOut.confirm.cancel')}
        destructive
        onConfirm={() => {
          setUnsentCount(null);
          void performSignOut({ resetTheme: theme.reset });
        }}
        onCancel={() => setUnsentCount(null)}
      />
      <ConfirmSheet
        visible={forgotOpen}
        title={t('system.appLock.forgotSheetTitle')}
        body={t('system.appLock.forgotSheetBody')}
        confirmLabel={t('system.appLock.tenButton')}
        cancelLabel={t('system.appLock.signOutSheetStay')}
        onConfirm={() => {
          setForgotOpen(false);
          setView('reauth');
        }}
        onCancel={() => setForgotOpen(false)}
      />
      <LockSetupSheet
        visible={setupOpen}
        method="appPin"
        resetPin
        onClose={() => setSetupOpen(false)}
        onDone={onUnlock}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: step.edge, gap: step.section },
  column: { alignItems: 'center', gap: step.row },
  full: { alignSelf: 'stretch', gap: step.row },
  footer: { alignItems: 'center', gap: step.tight },
});
