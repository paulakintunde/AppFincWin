// 08.1-23: a radio group of plain choices, each with a helper line, an optional tag ("Default for this setup") and its own
// tap-to-explain tip. The SplitRuleList pattern (RadioDot, 64-high rows); the tip sits outside the radio so a screen reader reaches
// it as its own button.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { RadioDot } from '@/ui/RadioDot';
import { hapticTick } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { rowHeight, step } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { ExplainTip } from './ExplainTip';

export interface Choice<K extends string> {
  key: K;
  label: string;
  helper: string;
  /** a short tag after the helper, e.g. "Default for this setup" */
  tag?: string | null;
  tip: string;
}

export interface ChoiceListProps<K extends string> {
  value: K | null;
  choices: readonly Choice<K>[];
  onChange: (next: K) => void;
  accessibilityLabel: string;
  testIDPrefix: string;
  disabled?: boolean;
}

export function ChoiceList<K extends string>({ value, choices, onChange, accessibilityLabel, testIDPrefix, disabled = false }: ChoiceListProps<K>) {
  const { colors, pairing } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {choices.map((c) => {
        const selected = c.key === value;
        const spoken = [c.label, c.helper, c.tag ?? null].filter((x): x is string => x !== null && x !== '').join('. ');
        return (
          <View key={c.key}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected, disabled }}
              accessibilityLabel={spoken}
              disabled={disabled}
              onPress={() => {
                if (selected) return;
                hapticTick();
                onChange(c.key);
              }}
              style={[styles.row, { minHeight: rowHeight.two }]}
              testID={`${testIDPrefix}-${c.key}`}
            >
              <RadioDot selected={selected} />
              <View style={styles.text}>
                <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{c.label}</Text>
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{c.helper}</Text>
                {c.tag ? (
                  <Text testID={`${testIDPrefix}-${c.key}-tag`} style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.accent }}>
                    {c.tag}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            <View style={styles.tip}>
              <ExplainTip name={c.label} text={c.tip} testID={`${testIDPrefix}-${c.key}-tip`} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: step.row, paddingVertical: step.tight },
  text: { flex: 1, flexShrink: 1, gap: step.hair },
  // lines the tip up with the choice's words (past the 18-wide radio dot and its gap)
  tip: { paddingLeft: 18 + step.row },
});
