// UI-SPEC primitive: the split rules as a radio group (Even, By weight, By amount, Mine only), min 64 px per row.
// By weight and By amount are present only while their household feature is on (D-12, always true until Phase 9).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { RadioDot } from '@/ui/RadioDot';
import { hapticTick } from '@/ui/haptics';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { rowHeight, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useFeature } from '../useFeature';

export type SplitRuleKey = 'even' | 'weight' | 'amount' | 'mine';

export interface SplitRuleListProps {
  value: SplitRuleKey;
  onChange: (next: SplitRuleKey) => void;
  /** Which rules to offer; the household default leaves out 'mine'. Defaults to all four. */
  rules?: readonly SplitRuleKey[];
  accessibilityLabel?: string;
}

const ALL: readonly SplitRuleKey[] = ['even', 'weight', 'amount', 'mine'];

export function SplitRuleList({ value, onChange, rules = ALL, accessibilityLabel }: SplitRuleListProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const weightOn = useFeature('hh.weightSplit');
  const amountOn = useFeature('hh.amountSplit');
  const shown = rules.filter((r) => (r === 'weight' ? weightOn : r === 'amount' ? amountOn : true));
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel ?? t('household.rules.splitTitle')}>
      {shown.map((rule) => {
        const selected = rule === value;
        const name = t(`household.rules.names.${rule}`);
        const description = t(`household.rules.descriptions.${rule}`);
        return (
          <Pressable
            key={rule}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, selected }}
            accessibilityLabel={`${name}. ${description}`}
            onPress={() => {
              if (selected) return;
              hapticTick();
              onChange(rule);
            }}
            style={[styles.row, { minHeight: rowHeight.two }]}
            testID={`split-rule-${rule}`}
          >
            <RadioDot selected={selected} />
            <View style={styles.text}>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{name}</Text>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{description}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: step.row, paddingVertical: step.tight },
  text: { flex: 1, flexShrink: 1, gap: 2 },
});
