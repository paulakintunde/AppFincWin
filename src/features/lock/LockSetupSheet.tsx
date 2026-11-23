// 10-21 (UI-SPEC 1b, D-01, D-33): the one setup flow for the phone lock.
//  - method 'auto' (the default): the phone's own lock when the phone has a screen lock (device mode); otherwise the
//    optional FincWin PIN is offered with the "no screen lock" line.
//  - method 'appPin': the extra FincWin PIN. A biometric explainer comes first when the phone has biometrics.
//  - resetPin: the PIN steps only, after a same-person re-sign-in (D-29). The biometric choice is kept.
// Nothing is saved until the last step, so Close before "Lock is on" leaves the lock as it was. The sheet cannot be
// dragged away mid-PIN.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useAuth } from '@/features/auth/AuthProvider';
import { PlanLink } from '@/features/plans/components/NoticeCard';
import {
  authenticateBiometric,
  authenticateDevice,
  biometricKind,
  deviceLockAvailable,
  type BiometricKind,
} from '@/services/lock/biometric';
import { loadLockState, saveLockSettings, setPin } from '@/services/lock/lockStore';
import { PIN_LENGTH, type LockTiming } from '@/services/lock/pin';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { hapticTap, hapticTick } from '@/ui/haptics';
import { IconTile } from '@/ui/icons/IconTile';
import { LabelValueRow } from '@/ui/LabelValueRow';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { notifyLockChanged } from './lockEvents';
import { PinDots } from './PinDots';
import { PinPad } from './PinPad';
import { TIMING_CHOICES } from './timing';

type Step = 'loading' | 'introDevice' | 'introBio' | 'introNoLock' | 'pin' | 'pinAgain' | 'done';

export interface LockSetupSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called when the person taps Done on "Lock is on" (before the sheet closes). */
  onDone?: () => void;
  method?: 'auto' | 'appPin';
  resetPin?: boolean;
}

export function LockSetupSheet({ visible, onClose, onDone, method = 'auto', resetPin = false }: LockSetupSheetProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [stepNow, setStep] = useState<Step>('loading');
  const [kind, setKind] = useState<BiometricKind>('none');
  const [biometric, setBiometric] = useState(false);
  const [denied, setDenied] = useState(false);
  const [first, setFirst] = useState('');
  const [digits, setDigits] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [timing, setTiming] = useState<LockTiming>('oneMinute');
  const [timingOpen, setTimingOpen] = useState(false);
  const [usedPin, setUsedPin] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restarts the flow each time the sheet opens
    setStep('loading');
    setFirst('');
    setDigits('');
    setMismatch(false);
    setDenied(false);
    setTimingOpen(false);
    void (async () => {
      const [k, available, state] = await Promise.all([biometricKind(), deviceLockAvailable(), loadLockState()]);
      if (!alive.current) return;
      setKind(k);
      setTiming(state.settings.timing);
      setBiometric(resetPin ? state.settings.biometric : false);
      if (resetPin) setStep('pin');
      else if (method === 'auto') setStep(available ? 'introDevice' : 'introNoLock');
      else setStep(k !== 'none' ? 'introBio' : 'pin');
    })();
  }, [visible, method, resetPin]);

  const finishDevice = async (): Promise<void> => {
    const r = await authenticateDevice(t('system.appLock.promptOpen'), t('system.appLock.promptCancel'));
    if (r !== 'ok' || !alive.current) return; // cancelled: the intro stays up with its button
    await saveLockSettings({ enabled: true, lockMethod: 'device', biometric: false, ownerUserId: userId, offerAnswered: true });
    notifyLockChanged();
    hapticTap();
    setUsedPin(false);
    setStep('done');
  };

  const bioIntro = async (): Promise<void> => {
    const r = await authenticateBiometric(t('system.appLock.promptOpen'), t('system.appLock.promptCancel'));
    if (!alive.current) return;
    if (r === 'ok') setBiometric(true);
    else setDenied(true);
    setStep('pin');
  };

  const onDigit = (d: string): void => {
    if (digits.length >= PIN_LENGTH) return;
    const next = digits + d;
    setDigits(next);
    if (next.length < PIN_LENGTH) return;
    if (stepNow === 'pin') {
      setFirst(next);
      setDigits('');
      setMismatch(false);
      setStep('pinAgain');
      return;
    }
    if (next !== first) {
      setDigits('');
      setFirst('');
      setMismatch(true);
      setStep('pin');
      return;
    }
    void (async () => {
      await setPin(next);
      await saveLockSettings({
        enabled: true,
        lockMethod: 'appPin',
        biometric,
        ownerUserId: userId,
        offerAnswered: true,
      });
      notifyLockChanged();
      if (!alive.current) return;
      hapticTap();
      setUsedPin(true);
      setDigits('');
      setStep('done');
    })();
  };

  const chooseTiming = async (next: LockTiming): Promise<void> => {
    hapticTick();
    setTiming(next);
    await saveLockSettings({ timing: next });
    notifyLockChanged();
  };

  const done = (): void => {
    onDone?.();
    onClose();
  };

  const midPin = stepNow === 'pin' || stepNow === 'pinAgain';
  const titleFor = (): string => {
    if (stepNow === 'pin') return t('system.appLock.setupPinTitle');
    if (stepNow === 'pinAgain') return t('system.appLock.setupPinAgainTitle');
    if (stepNow === 'done') return t('system.appLock.setupDoneTitle');
    if (stepNow === 'introDevice') return t('system.appLock.deviceSetupTitle');
    if (stepNow === 'introBio') {
      return kind === 'faceId'
        ? t('system.appLock.setupBiometricTitleFaceId')
        : kind === 'touchId'
          ? t('system.appLock.setupBiometricTitleTouchId')
          : t('system.appLock.setupBiometricTitleFingerprint');
    }
    return t('system.appLock.setupTurnOn');
  };
  const bioBody =
    kind === 'faceId'
      ? t('system.appLock.setupBiometricBodyFaceId')
      : kind === 'touchId'
        ? t('system.appLock.setupBiometricBodyTouchId')
        : t('system.appLock.setupBiometricBodyFingerprint');
  const timingLabel = t(TIMING_CHOICES.find((c) => c.timing === timing)?.key ?? 'system.appLock.timingOneMinute');
  const deniedLine = kind === 'faceId' ? t('system.appLock.setupBiometricDenied') : t('system.appLock.setupBiometricDeniedGeneric');
  const body = { ...textRole(pairing, 'body'), color: colors.inkMuted, textAlign: 'center' as const };
  const heading = { ...textRole(pairing, 'heading'), color: colors.ink, textAlign: 'center' as const };

  return (
    <Sheet visible={visible} onDismiss={onClose} dismissible={!midPin} accessibilityLabel={titleFor()}>
      <View style={styles.column} testID="lock-setup">
        <SheetHeader title={t('system.security.lockToggle')} cancelLabel={t('a11y.close')} onCancel={onClose} />

        {stepNow === 'introDevice' || stepNow === 'introBio' || stepNow === 'introNoLock' ? (
          <View style={styles.center}>
            <IconTile icon={kind === 'faceId' ? 'faceId' : 'pinLock'} size={48} color={colors.inkDim} tint={colors.fill1} />
            <Text accessibilityRole="header" style={heading}>
              {stepNow === 'introNoLock' ? t('system.appLock.setupPinTitle') : titleFor()}
            </Text>
            <Text style={body}>
              {stepNow === 'introDevice'
                ? t('system.appLock.deviceSetupBody')
                : stepNow === 'introBio'
                  ? bioBody
                  : t('system.appLock.noScreenLock')}
            </Text>
            <View style={styles.full}>
              <Pill
                label={t('system.appLock.setupTurnOn')}
                variant="primary"
                tall
                onPress={() => {
                  if (stepNow === 'introDevice') void finishDevice();
                  else if (stepNow === 'introBio') void bioIntro();
                  else setStep('pin');
                }}
              />
            </View>
          </View>
        ) : null}

        {midPin ? (
          <View style={styles.center}>
            <Text accessibilityRole="header" style={heading}>
              {titleFor()}
            </Text>
            {mismatch && stepNow === 'pin' ? (
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textAlign: 'center' }} accessibilityLiveRegion="polite">
                {t('system.appLock.setupPinMismatch')}
              </Text>
            ) : null}
            {denied && stepNow === 'pin' ? (
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{deniedLine}</Text>
            ) : null}
            <PinDots filled={digits.length} />
            <PinPad onDigit={onDigit} onBackspace={() => setDigits((d) => d.slice(0, -1))} />
          </View>
        ) : null}

        {stepNow === 'done' ? (
          <View style={styles.center}>
            <Text accessibilityRole="header" style={heading}>
              {titleFor()}
            </Text>
            <Text style={body}>{usedPin ? t('system.appLock.setupDoneBodyPin') : t('system.appLock.setupDoneBodyDevice')}</Text>
            <View style={styles.full}>
              <LabelValueRow label={t('system.appLock.setupAskFor')} value={timingLabel} />
              <PlanLink label={t('system.appLock.setupChange')} onPress={() => setTimingOpen((o) => !o)} testID="lock-timing-change" />
              {timingOpen
                ? TIMING_CHOICES.map((c) => (
                    <Pressable
                      key={c.timing}
                      accessibilityRole="radio"
                      accessibilityLabel={t(c.key)}
                      accessibilityState={{ selected: timing === c.timing }}
                      onPress={() => void chooseTiming(c.timing)}
                      style={styles.choice}
                      testID={`lock-timing-${c.timing}`}
                    >
                      <RadioDot selected={timing === c.timing} />
                      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t(c.key)}</Text>
                    </Pressable>
                  ))
                : null}
              <Pill label={t('system.appLock.setupDone')} variant="primary" tall onPress={done} />
            </View>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.card },
  center: { alignItems: 'center', gap: step.row },
  full: { alignSelf: 'stretch', gap: step.row },
  choice: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: step.row },
});
