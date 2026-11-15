// 06.1-71 (CN-10, OQ-71-1 B): You > Region. The country (the user's own choice, else this phone's region) and, for the US and
// Canada, the state or province. Decide's sales tax estimate reads both; the Price step's "Set your region" opens You on this row.
// Precedence stays the user's own choice, then the device region, then the time zone; never IP (services/locale/resolveRegion).
// Applied at once with no confirm, like Week starts on.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/ui/Text';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Row } from '@/ui/Row';
import { useUpdateMoneyPrefs } from '@/data/mutations/moneyPrefs';
import { useSetRegionSubdivision } from '@/data/mutations/regionSubdivision';
import { useRegionSubdivision } from '@/data/queries/regionSubdivision';
import { useRecordContext } from '@/features/record/useRecordContext';
import { getDeviceRegion } from '@/services/locale/deviceLocale';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { COUNTRIES, countryName, subdivisionName, subdivisionsOf, type Place } from '../regionPlaces';

/** The "from this phone" choice in the country list (clears the user's own choice). */
const FROM_PHONE = '';

export interface RegionRowProps {
  /** The row's host, so the You screen can scroll to it and move focus to it (?focus=region). */
  rowRef?: React.Ref<View>;
  onRowLayout?: (event: LayoutChangeEvent) => void;
}

export function RegionRow({ rowRef, onRowLayout }: RegionRowProps = {}) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const userId = rc.userId ?? '';
  const { setRegion } = useUpdateMoneyPrefs(userId);
  const setSubdivision = useSetRegionSubdivision(userId);
  const subdivision = useRegionSubdivision(rc.userId ?? undefined);
  const [picking, setPicking] = useState<'country' | 'subdivision' | null>(null);

  const own = rc.region;
  const phone = getDeviceRegion(null) ?? null;
  const country = own ?? phone;
  const nameOf = (code: string | null): string => countryName(code) ?? code ?? t('you.region.notSet');
  const countryValue = own === null && phone !== null ? t('you.region.fromPhone', { country: nameOf(phone) }) : nameOf(country);
  const subdivisions = subdivisionsOf(country);
  const subdivisionValue = subdivisionName(country, subdivision) ?? t('you.region.notSet');
  const disabled = rc.userId === null;

  const chooseCountry = (code: string): void => {
    setPicking(null);
    const next = code === FROM_PHONE ? null : code;
    if (next === own) return;
    setRegion(next);
    // A state or province belongs to one country: drop it when the country it belongs to is no longer in force.
    const nextCountry = next ?? phone;
    if (subdivision !== null && subdivisionName(nextCountry, subdivision) === null) setSubdivision(null);
  };
  const chooseSubdivision = (code: string): void => {
    setPicking(null);
    if (code !== subdivision) setSubdivision(code);
  };

  const list = (title: string, places: readonly Place[], selected: string | null, onSelect: (code: string) => void, first?: Place) => (
    <Sheet visible onDismiss={() => setPicking(null)} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={() => setPicking(null)} />
      <SheetScroll>
        {[...(first === undefined ? [] : [first]), ...places].map((p) => (
          <Row
            key={p.code === FROM_PHONE ? 'from-phone' : p.code}
            label={p.name}
            dense
            value={p.code === selected ? '✓' : undefined}
            selected={p.code === selected}
            accessibilityLabel={p.name}
            onPress={() => onSelect(p.code)}
          />
        ))}
      </SheetScroll>
    </Sheet>
  );

  return (
    <View ref={rowRef} onLayout={onRowLayout} testID="you-region">
      <Pressable
        testID="you-region-country"
        accessibilityRole="button"
        accessibilityLabel={`${t('you.region.label')}, ${countryValue}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setPicking('country')}
        style={styles.row}
      >
        <Text style={[styles.label, { ...textRole(pairing, 'body'), color: colors.ink }]}>{t('you.region.label')}</Text>
        <Text style={[styles.value, { ...textRole(pairing, 'label'), color: colors.inkMuted }]}>{countryValue}</Text>
      </Pressable>
      {subdivisions.length > 0 ? (
        <Pressable
          testID="you-region-subdivision"
          accessibilityRole="button"
          accessibilityLabel={`${t('you.region.subdivision')}, ${subdivisionValue}`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => setPicking('subdivision')}
          style={styles.row}
        >
          <Text style={[styles.label, { ...textRole(pairing, 'body'), color: colors.ink }]}>{t('you.region.subdivision')}</Text>
          <Text style={[styles.value, { ...textRole(pairing, 'label'), color: colors.inkMuted }]}>{subdivisionValue}</Text>
        </Pressable>
      ) : null}
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('you.region.sub')}</Text>
      {picking === 'country'
        ? list(t('you.region.label'), COUNTRIES, own ?? FROM_PHONE, chooseCountry, { code: FROM_PHONE, name: t('you.region.fromPhoneOption') })
        : null}
      {picking === 'subdivision' ? list(t('you.region.subdivision'), subdivisions, subdivision, chooseSubdivision) : null}
    </View>
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
  value: { flexShrink: 1, textAlign: 'right' },
});
