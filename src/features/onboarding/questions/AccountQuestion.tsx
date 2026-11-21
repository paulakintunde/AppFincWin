// 09-21 Q3: one account, a name and a balance in the currency from question 2. Kept in the setup answers only; the account
// becomes a record when the trial starts (owner P3, 09-23). Balance is integer minor units.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MoneyInput } from '@/ui/MoneyInput';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useCopy } from '../useCopy';

export interface AccountValue {
  name: string;
  balanceMinor: number;
}

export interface AccountQuestionProps {
  currency: string;
  value: AccountValue | undefined;
  /** Reports a complete value (a name), or undefined while the name is empty. */
  onChange: (value: AccountValue | undefined) => void;
}

export function AccountQuestion({ currency, value, onChange }: AccountQuestionProps) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const [name, setName] = useState(value?.name ?? '');
  const [balance, setBalance] = useState<number | null>(value ? value.balanceMinor : null);

  const report = (n: string, b: number | null) => {
    const trimmed = n.trim();
    onChange(trimmed === '' ? undefined : { name: trimmed, balanceMinor: b ?? 0 });
  };

  return (
    <View style={styles.wrap}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('onboarding.q.acct.fieldName')}</Text>
      <TextInput
        testID="onb-acct-name"
        accessibilityLabel={t('onboarding.q.acct.fieldName')}
        value={name}
        maxLength={60}
        onChangeText={(text) => {
          setName(text);
          report(text, balance);
        }}
        placeholderTextColor={colors.inkMuted}
        style={[styles.input, { ...textRole(pairing, 'body'), color: colors.ink, backgroundColor: colors.surface, borderColor: colors.line2 }]}
      />
      <MoneyInput
        value={balance}
        currency={currency}
        label={t('onboarding.q.acct.fieldBalance')}
        accessibilityLabel={t('onboarding.q.acct.fieldBalance')}
        onChange={(minor) => {
          setBalance(minor);
          report(name, minor);
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
