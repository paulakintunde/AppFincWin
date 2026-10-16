/** UI-SPEC stack and offsets rows: a checkbox row with an optional 44x44 remove target. */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';

const BOX_SIZE = 22; // UI-SPEC check box
const BOX_BORDER = 1.5; // UI-SPEC check box outline

export interface CheckRowProps {
  checked: boolean;
  onToggle: () => void;
  name: string;
  source?: string;
  amount: string;
  onRemove?: () => void;
  removeA11yLabel: string;
  disabled?: boolean;
}

export function CheckRow({ checked, onToggle, name, source, amount, onRemove, removeA11yLabel, disabled = false }: CheckRowProps) {
  const { colors, pairing } = useTheme();
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        accessibilityLabel={source ? `${name}, ${source}, ${amount}` : `${name}, ${amount}`}
        disabled={disabled}
        onPress={() => {
          hapticSelection();
          onToggle();
        }}
        style={({ pressed }) => [styles.main, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <View
          style={[
            styles.box,
            { borderColor: checked ? colors.ink : colors.line4, backgroundColor: checked ? colors.ink : 'transparent' },
          ]}
        />
        <View style={styles.text}>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>{name}</Text>
          {source ? (
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{source}</Text>
          ) : null}
        </View>
        <Text scale="capped" style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{amount}</Text>
      </Pressable>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={removeA11yLabel}
          onPress={onRemove}
          style={styles.remove}
        >
          <View style={[styles.removeBar, { backgroundColor: colors.inkDim }]} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  box: { width: BOX_SIZE, height: BOX_SIZE, borderRadius: 6, borderWidth: BOX_BORDER },
  text: { flex: 1 },
  remove: { width: space.touchMin, height: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  removeBar: { width: 12, height: 2, borderRadius: 1 },
});
