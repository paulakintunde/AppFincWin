// 05.3-24 (UI-SPEC band chip): "Band {n} · {range}" and "Asks about: ..." from the live evaluation of the draft. A polite live
// region that changes only when the band number changes, ~150 ms after it settles, so typing a price in one band says nothing new.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Band, HomeThresholds, Layer } from '@/engine/decide/v3';
import { currencyExponent } from '@/engine/money';
import { useLooseT } from './useLooseT';
import { useRecordContext } from '@/features/record/useRecordContext';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { bandChip, compactAmount } from '../model/bandChip';
import { useSettledLabel } from '../shared/useSettledLabel';
import { useV3Format } from '../shared/useV3Format';

export const BAND_SETTLE_MS = 150;
const BADGE_MIN = 32;

export interface BandChipProps {
  band: Band | null;
  thresholds: HomeThresholds;
  layers: readonly Layer[];
}

export function BandChip({ band, thresholds, layers }: BandChipProps): React.JSX.Element | null {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  const fmt = useV3Format();
  const rc = useRecordContext();
  const { locale } = useDeviceLocale();
  const model = bandChip({ band, thresholds, layers });

  const edge = (minor: number | null): string => {
    if (minor === null) return '';
    const exponent = currencyExponent(rc.homeCurrency);
    const c = compactAmount(minor as never, exponent);
    if (c.key === null) return fmt.money(minor);
    let amount: string;
    try {
      amount = new Intl.NumberFormat(locale, { style: 'currency', currency: rc.homeCurrency, maximumFractionDigits: 0 }).format(c.value);
    } catch {
      amount = String(c.value);
    }
    return t(c.key, { amount });
  };

  const range =
    model.rangeKey === null ? null : t(model.rangeKey, { low: edge(model.low), high: edge(model.high) });
  const label =
    model.n === null
      ? ''
      : range === null
        ? t(model.titleKey, { n: model.n })
        : t(model.titleKey, { n: model.n, range });
  const asks =
    model.layerKeys.length === 0
      ? null
      : t('decide.v3.ui.band.asksAbout', { layers: model.layerKeys.map((k) => t(k)).join(t('decide.v3.ui.band.layerJoin')) });

  const spoken = [label, asks].filter((s): s is string => s !== null && s !== '').join('. ');
  // keyed on the band number: the label settles ~150 ms after typing stops, or at once when the band changes
  const settled = useSettledLabel(spoken, String(model.n), BAND_SETTLE_MS);

  if (model.n === null) return null;
  return (
    <View
      testID="band-chip"
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={settled}
      style={[styles.chip, { backgroundColor: colors.fill2 }]}
    >
      <View style={[styles.badge, { backgroundColor: colors.ink }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={{ ...textRole(pairing, 'label'), color: colors.surface }}>{t('decide.v3.ui.band.badge', { n: model.n })}</Text>
      </View>
      <View style={styles.lines}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{label}</Text>
        {asks === null ? null : <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{asks}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, borderRadius: space.cardPad, paddingVertical: space.gapMd, paddingHorizontal: 14 },
  badge: { minWidth: BADGE_MIN, minHeight: BADGE_MIN, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gapSm },
  lines: { flex: 1, flexShrink: 1 },
});
