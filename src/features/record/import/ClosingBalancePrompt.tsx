// D-24: the optional closing-balance check for a PDF, an inline step. Check balance hands the
// typed text to the hook, which parses it with the account's currency; Skip carries on without.
import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useT } from '@/i18n';
import { Pill } from '@/ui/Pill';
import { useAmountParser, type AmountParseFailure } from '@/ui/money/useAmountParser';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Actions, Heading, T } from './importUi';

export interface ClosingBalancePromptProps {
  currency: string;
  onCheck: (text: string) => { ok: true } | { ok: false; error: AmountParseFailure };
  onSkip: () => void;
}

export function ClosingBalancePrompt({ currency, onCheck, onSkip }: ClosingBalancePromptProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const parser = useAmountParser();
  const [text, setText] = useState('');
  const [error, setError] = useState<AmountParseFailure | null>(null);

  const check = () => {
    const result = onCheck(text);
    setError(result.ok ? null : result.error);
  };

  return (
    <View>
      <Heading>{t('importCsv.pdf.balanceHeading')}</Heading>
      <T>{t('importCsv.pdf.balanceBody')}</T>
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          setError(null);
        }}
        keyboardType="decimal-pad"
        placeholder={currency}
        placeholderTextColor={colors.inkFaint}
        accessibilityLabel={t('importCsv.pdf.balanceLabel')}
        style={[
          textRole(pairing, 'body'),
          styles.field,
          { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2, borderColor: colors.inkFaint },
        ]}
      />
      {error !== null ? (
        <View accessibilityLiveRegion="polite">
          <T tone="danger">{parser.errorMessage(error)}</T>
        </View>
      ) : null}
      <Actions>
        <Pill label={t('importCsv.pdf.balanceCheck')} variant="primary" onPress={check} />
        <Pill label={t('importCsv.pdf.balanceSkip')} variant="secondary" onPress={onSkip} />
      </Actions>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: space.touchMin, paddingHorizontal: space.gapMd, borderWidth: 1, marginVertical: space.gapMd },
});
