// 10-21 (UI-SPEC "New components"): six 12 dp circles. Empty is a 1.5 dp inkMuted ring, filled is an ink fill.
// Only inkMuted and ink are used. The spoken label gives the count, never the digits.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { PIN_LENGTH } from '@/services/lock/pin';

const DOT = 12;
const RING = 1.5;

export function PinDots({ filled }: { filled: number }): React.JSX.Element {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('system.appLock.a11yPinDigits', { count: filled })}
      style={styles.row}
      testID="pin-dots"
    >
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <View
          key={i}
          testID={i < filled ? 'pin-dot-filled' : 'pin-dot-empty'}
          style={[
            styles.dot,
            i < filled
              ? { backgroundColor: colors.ink, borderColor: colors.ink }
              : { backgroundColor: 'transparent', borderColor: colors.inkMuted },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: step.tight, minHeight: 28, alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: RING },
});
