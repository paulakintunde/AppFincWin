// 09-21 Q2: "What do you count in?" The existing currency list, opened from one row. The starting value is the device default
// (user override > device region > time zone; no IP), chosen by the flow and passed in as `value`.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useCurrencyOptions } from '@/data/queries/currencyOptions';
import { CurrencyPicker } from '@/features/record/entry/pickers/CurrencyPicker';
import { Row } from '@/ui/Row';
import { useT } from '@/i18n';

export interface CurrencyQuestionProps {
  userId: string | undefined;
  value: string;
  homeCurrency: string;
  onChange: (code: string) => void;
}

export function CurrencyQuestion({ userId, value, homeCurrency, onChange }: CurrencyQuestionProps) {
  const t = useT();
  const { options } = useCurrencyOptions(userId);
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.code === value);
  const label = current ? `${current.code} · ${current.name}` : value;
  return (
    <View style={styles.wrap}>
      <Row label={label} chevron accessibilityLabel={label} onPress={() => setOpen(true)} />
      <CurrencyPicker
        visible={open}
        title={t('onboarding.q.cur.title')}
        options={options}
        homeCurrency={homeCurrency}
        selected={value}
        onSelect={(code) => {
          onChange(code);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: {} });
