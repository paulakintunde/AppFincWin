// 10-21: asks for the current FincWin PIN before a change (Change PIN, turning the lock or the extra PIN off).
// Uses the same wrong-try counter as the lock screen, so this cannot be used to guess around the ladder.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { checkPin } from '@/services/lock/lockStore';
import { PIN_LENGTH } from '@/services/lock/pin';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { hapticWarn } from '@/ui/haptics';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { PinDots } from './PinDots';
import { PinPad } from './PinPad';
import { formatClock } from './timing';

export interface PinCheckSheetProps {
  visible: boolean;
  onClose: () => void;
  onVerified: () => void;
}

export function PinCheckSheet({ visible, onClose, onVerified }: PinCheckSheetProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [digits, setDigits] = useState('');
  const [line, setLine] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the entry each time the sheet opens
      setDigits('');
      setLine(null);
    }
  }, [visible]);

  const submit = async (pin: string): Promise<void> => {
    const res = await checkPin(pin, Date.now());
    if (!alive.current) return;
    if (res.ok) {
      onVerified();
      return;
    }
    setDigits('');
    hapticWarn();
    if (res.backoff.kind === 'wait') setLine(t('system.appLock.waitShort', { time: formatClock(res.backoff.ms) }));
    else if (res.backoff.kind === 'reauth') setLine(t('system.appLock.tenTitle'));
    else setLine(t('system.appLock.wrongPin', { count: Math.max(1, 5 - res.wrongTries) }));
  };

  const onDigit = (d: string): void => {
    if (digits.length >= PIN_LENGTH) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={t('system.appLock.currentPinTitle')}>
      <View style={styles.column}>
        <SheetHeader title={t('system.appLock.currentPinTitle')} cancelLabel={t('a11y.close')} onCancel={onClose} />
        <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, textAlign: 'center' }} accessibilityLiveRegion="polite">
          {line ?? t('system.appLock.enterPin')}
        </Text>
        <PinDots filled={digits.length} />
        <PinPad onDigit={onDigit} onBackspace={() => setDigits((d) => d.slice(0, -1))} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.card, alignItems: 'stretch' },
});
