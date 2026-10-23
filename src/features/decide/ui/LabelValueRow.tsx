/** D-76 rule S: a label/value row that puts the value under the label when side by side would not fit. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { useShouldStack } from './textFit';

export interface LabelValueRowProps {
  label: string;
  sub?: string;
  value: string;
  valueTone?: 'ink' | 'danger' | 'accent';
  leading?: React.ReactNode;
  a11yLabel?: string;
}

export function LabelValueRow({ label, sub, value, valueTone = 'ink', leading, a11yLabel }: LabelValueRowProps) {
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack(value.length);
  const valueColor = valueTone === 'danger' ? colors.danger : valueTone === 'accent' ? colors.accent : colors.ink;
  const labelBlock = (
    <View style={styles.text}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>{label}</Text>
      {sub ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sub}</Text> : null}
    </View>
  );
  const valueText = (
    <Text
      scale="capped"
      style={{ ...textRole(pairing, 'label'), color: valueColor, textAlign: stacked ? 'left' : 'right' }}
    >
      {value}
    </Text>
  );
  return (
    <View
      accessible
      accessibilityLabel={a11yLabel ?? [label, value, sub].filter(Boolean).join(', ')}
      style={[styles.row, { borderTopColor: colors.line2 }]}
    >
      {stacked ? (
        <View style={styles.stackBody}>
          <View style={styles.stackHead}>
            {leading}
            {labelBlock}
          </View>
          {valueText}
        </View>
      ) : (
        <>
          {leading}
          {labelBlock}
          <View style={styles.value}>{valueText}</View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    minHeight: space.touchMin,
    paddingVertical: space.gapSm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, flexShrink: 1 },
  value: { flexShrink: 0 },
  stackBody: { flex: 1, gap: space.gapSm },
  stackHead: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
});
