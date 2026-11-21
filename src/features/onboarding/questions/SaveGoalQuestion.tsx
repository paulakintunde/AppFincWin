// 09-21 Q11: goal name, target and per month, in the currency from question 2. Target left blank means an open-ended pot
// (stored as 0). Kept in the setup answers; the goal becomes a record when the trial starts (owner P3, 09-23).
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MoneyInput } from '@/ui/MoneyInput';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useCopy } from '../useCopy';

export interface SaveGoalValue {
  name: string;
  targetMinor: number;
  perMonthMinor: number;
}

export interface SaveGoalQuestionProps {
  currency: string;
  value: SaveGoalValue | undefined;
  /** Reports a complete value (a name), or undefined while the name is empty. */
  onChange: (value: SaveGoalValue | undefined) => void;
}

export function SaveGoalQuestion({ currency, value, onChange }: SaveGoalQuestionProps) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const [name, setName] = useState(value?.name ?? '');
  const [target, setTarget] = useState<number | null>(value ? value.targetMinor || null : null);
  const [monthly, setMonthly] = useState<number | null>(value ? value.perMonthMinor || null : null);

  const report = (n: string, tg: number | null, pm: number | null) => {
    const trimmed = n.trim();
    onChange(trimmed === '' ? undefined : { name: trimmed, targetMinor: tg ?? 0, perMonthMinor: pm ?? 0 });
  };

  return (
    <View style={styles.wrap}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('onboarding.q.save.fieldGoal')}</Text>
      <TextInput
        testID="onb-save-name"
        accessibilityLabel={t('onboarding.q.save.fieldGoal')}
        value={name}
        maxLength={60}
        onChangeText={(text) => {
          setName(text);
          report(text, target, monthly);
        }}
        placeholderTextColor={colors.inkMuted}
        style={[styles.input, { ...textRole(pairing, 'body'), color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line2 }]}
      />
      <MoneyInput
        value={target}
        currency={currency}
        label={t('onboarding.q.save.fieldTarget')}
        accessibilityLabel={t('onboarding.q.save.fieldTarget')}
        onChange={(minor) => {
          setTarget(minor);
          report(name, minor, monthly);
        }}
      />
      <MoneyInput
        value={monthly}
        currency={currency}
        label={t('onboarding.q.save.fieldMonthly')}
        accessibilityLabel={t('onboarding.q.save.fieldMonthly')}
        onChange={(minor) => {
          setMonthly(minor);
          report(name, target, minor);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.gapSm },
  input: {
    minHeight: 52,
    paddingHorizontal: space.cardPad,
    borderRadius: radii.card,
    borderWidth: 1.5,
  },
});
