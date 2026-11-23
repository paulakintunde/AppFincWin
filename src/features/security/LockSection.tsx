// 10-21 (ACC-08, ACC-09, UI-SPEC 2 items 1-4 and 6, D-01, D-02, D-33): the "Phone lock" groups of the Security screen.
// Plan 10-27 places this first on the screen. Self-contained: it reads and writes the lock settings itself.
//  - "Lock FincWin": on opens the setup sheet (the phone's own lock by default); off asks for the phone's lock, the PIN
//    or biometrics first, then toasts "Lock is off".
//  - "Ask for it": right away, 1, 5 or 15 minutes (default 1), saved at once with a tick.
//  - "Extra FincWin PIN": the optional separate 6-digit PIN. Change PIN and the Face ID toggle show only in this mode.
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { PinCheckSheet } from '@/features/lock/PinCheckSheet';
import { LockSetupSheet } from '@/features/lock/LockSetupSheet';
import { notifyLockChanged, subscribeLockChanged } from '@/features/lock/lockEvents';
import { TIMING_CHOICES } from '@/features/lock/timing';
import { SettingsGroup } from '@/features/you/components/SettingsGroup';
import {
  authenticateBiometric,
  authenticateDevice,
  biometricKind,
  deviceLockAvailable,
  type BiometricKind,
} from '@/services/lock/biometric';
import { clearPin, clearTries, loadLockState, saveLockSettings, type LockState } from '@/services/lock/lockStore';
import type { LockTiming } from '@/services/lock/pin';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { hapticTick } from '@/ui/haptics';
import { RadioDot } from '@/ui/RadioDot';
import { Row } from '@/ui/Row';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';

// D-02: the choice shown as selected when nothing has been saved yet.
const DEFAULT_TIMING: LockTiming = 'oneMinute';

type Pending = null | 'turnOff' | 'extraOff' | 'changePin';

export function SwitcherMetaLine(): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  return <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('system.security.switcherMeta')}</Text>;
}

export function LockSection({ showSwitcherMeta = true }: { showSwitcherMeta?: boolean }): React.JSX.Element | null {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [state, setState] = useState<LockState | null>(null);
  const [kind, setKind] = useState<BiometricKind>('none');
  const [deviceLock, setDeviceLock] = useState(true);
  const [setupOpen, setSetupOpen] = useState<null | 'auto' | 'appPin' | 'resetPin'>(null);
  const [pending, setPending] = useState<Pending>(null);

  const load = useCallback(async () => {
    const [s, k, d] = await Promise.all([loadLockState(), biometricKind(), deviceLockAvailable()]);
    setState(s);
    setKind(k);
    setDeviceLock(d);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the phone's lock settings once on mount
    void load();
    return subscribeLockChanged(() => void load());
  }, [load]);

  const save = async (patch: Parameters<typeof saveLockSettings>[0]): Promise<void> => {
    await saveLockSettings(patch);
    notifyLockChanged();
    await load();
  };

  if (state === null) return null;
  const s = state.settings;
  const on = s.enabled;
  const pinMode = s.lockMethod === 'appPin';
  const timing = s.timing ?? DEFAULT_TIMING;

  const turnOff = async (): Promise<void> => {
    await save({ enabled: false, lockMethod: 'device', biometric: false, ownerUserId: null, offerAnswered: true });
    await clearTries();
    showToast({ kind: 'ordinary', text: { key: 'system.appLock.lockIsOffToast' } });
  };

  // Turning off needs the phone's lock (device mode) or biometrics, then the PIN (app-PIN mode).
  const requestOff = async (): Promise<void> => {
    if (!pinMode) {
      const r = await authenticateDevice(t('system.appLock.verifyTurnOff'), t('system.appLock.promptCancel'));
      if (r === 'ok') await turnOff();
      return;
    }
    if (s.biometric && kind !== 'none') {
      const r = await authenticateBiometric(t('system.appLock.verifyTurnOff'), t('system.appLock.usePinInstead'));
      if (r === 'ok') {
        await turnOff();
        return;
      }
    }
    setPending('turnOff');
  };

  const requestBiometric = async (next: boolean): Promise<void> => {
    if (!next) {
      await save({ biometric: false });
      return;
    }
    const r = await authenticateBiometric(t('system.appLock.promptOpen'), t('system.appLock.promptCancel'));
    if (r === 'ok') await save({ biometric: true });
  };

  const verified = async (): Promise<void> => {
    const what = pending;
    setPending(null);
    if (what === 'turnOff') await turnOff();
    else if (what === 'extraOff') {
      await clearPin();
      await save({ lockMethod: 'device', biometric: false });
    }
    else if (what === 'changePin') setSetupOpen('resetPin');
  };

  const toggleSub = pinMode
    ? kind === 'faceId'
      ? t('system.security.lockToggleSubFaceId')
      : kind === 'touchId'
        ? t('system.security.lockToggleSubTouchId')
        : t('system.security.lockToggleSubPin')
    : t('system.security.lockToggleSubDevice');
  const biometricLabel =
    kind === 'faceId'
      ? t('system.security.biometricRow')
      : kind === 'touchId'
        ? t('system.security.biometricRowTouchId')
        : t('system.security.biometricRowFingerprint');
  const meta = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  return (
    <View style={styles.wrap}>
      <SettingsGroup title={t('system.security.lockGroup')}>
        <ToggleRow
          label={t('system.security.lockToggle')}
          sub={toggleSub}
          value={on}
          accessibilityLabel={on ? t('system.appLock.a11yLockSwitchOn') : t('system.appLock.a11yLockSwitchOff')}
          onChange={(next) => {
            if (next) setSetupOpen('auto');
            else void requestOff();
          }}
        />
        {on ? (
          <ToggleRow
            label={t('system.appLock.extraPinTitle')}
            sub={t('system.appLock.extraPinSub')}
            value={pinMode}
            disabled={pinMode && !deviceLock}
            onChange={(next) => {
              if (next) setSetupOpen('appPin');
              else setPending('extraOff');
            }}
          />
        ) : null}
        {on && pinMode && kind !== 'none' ? (
          <ToggleRow label={biometricLabel} value={s.biometric} onChange={(next) => void requestBiometric(next)} />
        ) : null}
        {on && pinMode ? (
          <Row label={t('system.security.changePin')} chevron onPress={() => setPending('changePin')} />
        ) : null}
      </SettingsGroup>

      {on ? (
        <SettingsGroup title={t('system.security.timingGroup')}>
          {TIMING_CHOICES.map((c) => (
            <Row
              key={c.timing}
              label={t(c.key)}
              leading={<RadioDot selected={timing === c.timing} />}
              selected={timing === c.timing}
              onPress={() => {
                hapticTick();
                void save({ timing: c.timing });
              }}
            />
          ))}
        </SettingsGroup>
      ) : null}

      <Text style={meta}>{t('system.security.lockScopeMeta')}</Text>
      {showSwitcherMeta ? <SwitcherMetaLine /> : null}

      <LockSetupSheet
        visible={setupOpen !== null}
        method={setupOpen === 'auto' ? 'auto' : 'appPin'}
        resetPin={setupOpen === 'resetPin'}
        onClose={() => {
          setSetupOpen(null);
          void load();
        }}
      />
      <PinCheckSheet visible={pending !== null} onClose={() => setPending(null)} onVerified={() => void verified()} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: step.row },
});
