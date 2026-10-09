// REC-25: the Home currency row. Tapping opens the currency picker; choosing a different code
// opens the all-or-nothing confirm sheet.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useCurrencyOptions } from '@/data/queries/currencyOptions';
import { CurrencyPicker } from '@/features/record/entry/pickers/CurrencyPicker';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { HomeCurrencyChangeSheet } from './HomeCurrencyChangeSheet';

export function HomeCurrencyRow() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const { options } = useCurrencyOptions(rc.userId ?? undefined);
  const [picking, setPicking] = useState(false);
  const [next, setNext] = useState<string | null>(null);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('you.homeCurrency.label')}
        onPress={() => setPicking(true)}
        style={styles.row}
      >
        <Text style={[styles.label, { ...textRole(pairing, 'body'), color: colors.ink }]}>
          {t('you.homeCurrency.label')}
        </Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{rc.homeCurrency}</Text>
      </Pressable>
      <CurrencyPicker
        visible={picking}
        title={t('you.homeCurrency.label')}
        options={options}
        homeCurrency={rc.homeCurrency}
        selected={rc.homeCurrency}
        onSelect={(code) => {
          setPicking(false);
          if (code !== rc.homeCurrency) setNext(code);
        }}
        onClose={() => setPicking(false)}
      />
      <HomeCurrencyChangeSheet visible={next !== null} next={next ?? rc.homeCurrency} onClose={() => setNext(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: space.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapSm,
  },
  label: { flex: 1 },
});
