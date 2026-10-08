// The currency picker: Your currency, then Popular by continent, then every currency A-Z
// (D-08 amended 2026-10-07). Sits in the scrollable Sheet body so Cancel stays reachable (CR-05).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Row } from '@/ui/Row';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { CurrencyOption } from '@/data/queries/currencyOptions';
import { currencyPickerSections } from '@/data/queries/popularCurrencies';

export interface CurrencyPickerProps {
  visible: boolean;
  title: string;
  options: readonly CurrencyOption[];
  homeCurrency: string;
  selected: string | null;
  onSelect: (code: string) => void;
  onClose: () => void;
}

export function CurrencyPicker({ visible, title, options, homeCurrency, selected, onSelect, onClose }: CurrencyPickerProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const sections = currencyPickerSections(options, homeCurrency);
  const headingStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  const heading = (text: string) => (
    <Text accessibilityRole="header" style={[styles.heading, headingStyle]}>
      {text}
    </Text>
  );
  const row = (option: CurrencyOption, keyPrefix: string) => {
    const label = `${option.code} · ${option.name}`;
    return (
      <Row
        key={`${keyPrefix}-${option.code}`}
        label={label}
        dense
        chevron={false}
        value={option.code === selected ? '✓' : undefined}
        selected={option.code === selected}
        accessibilityLabel={label}
        onPress={() => onSelect(option.code)}
      />
    );
  };

  return (
    <Sheet visible={visible} onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll>
        {sections.home ? (
          <View testID="currency-section-home">
            {heading(t('currencyPicker.yourCurrency'))}
            {row(sections.home, 'home')}
          </View>
        ) : null}
        {sections.popular.length > 0 ? (
          <View testID="currency-section-popular">
            {heading(t('currencyPicker.popular'))}
            {sections.popular.map((group) => (
              <View key={group.continent}>
                {heading(t(`currencyPicker.continent.${group.continent}`))}
                {group.options.map((option) => row(option, group.continent))}
              </View>
            ))}
          </View>
        ) : null}
        <View testID="currency-section-all">
          {heading(t('currencyPicker.allCurrencies'))}
          {sections.all.map((option) => row(option, 'all'))}
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  heading: { paddingTop: space.rowPad },
});
