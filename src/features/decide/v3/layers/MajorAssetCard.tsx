// 05.3-42 (DSV-06, D-18, T-05.3-42-01, UI-SPEC Major asset): "Major purchase details". Every answer is stored under
// layerAnswers 'L6.*' and nothing reaches extras or the answer. Legal/closing and moving costs are not asked here when the
// item type's preset already asks them (a property), so nothing is counted twice. 05.3-113: an own kind follows the preset
// it counts like (a removed one is General), the same base the item costs card asks.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CheckV2, V3PresetItemType } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { useShouldStack } from '@/features/decide/ui/textFit';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { useLooseT } from '../check/useLooseT';
import { withLayerAnswer } from '../model/checkEdits';
import { majorAssetFields } from '../model/costFields';
import { itemBaseOf } from '../model/itemBase';
import { VALUE_YEARS } from './ValueCard';
import { LayerCard } from './LayerCard';

export interface MajorAssetCardProps {
  check: CheckV2;
  edit(next: CheckV2): void;
  currency: string;
  readOnly?: boolean;
  /** 05.3-113: the preset the kind counts like (LayerStack resolves own kinds); absent = a preset itself, an own kind is General. */
  itemBase?: V3PresetItemType;
}

const NO_ROWS = [] as const;
const SOURCES = ['unspent', 'envelope', 'selling', 'other'] as const;

function minorOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function MajorAssetCard({ check, edit, currency, readOnly = false, itemBase }: MajorAssetCardProps): React.JSX.Element {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack();
  const asks = majorAssetFields(itemBase ?? itemBaseOf(check.itemType, NO_ROWS));
  const anyHidden = !asks.legal || !asks.moving;
  const label = { ...textRole(pairing, 'label'), color: colors.inkDim };
  const yearCell = stacked ? styles.yearCellStacked : styles.yearCell;

  const money = (key: string, caption: string): React.JSX.Element => (
    <MoneyInput
      value={minorOf(check.layerAnswers[key])}
      currency={currency}
      onChange={(m) => edit(withLayerAnswer(check, key, m === null ? undefined : minorUnits(m)))}
      label={caption}
      accessibilityLabel={caption}
      readOnly={readOnly}
    />
  );

  return (
    <LayerCard eyebrowKey="decide.v3.ui.layers.majorEyebrow" testID="major-asset-card">
      <View style={styles.field}>
        <Text style={label}>{t('decide.v3.ui.layers.depositFrom')}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.v3.ui.layers.depositFrom')} style={styles.wrap}>
          {SOURCES.map((s) => (
            <Chip
              key={s}
              label={t(`decide.v3.ui.layers.from.${s}`)}
              selected={check.layerAnswers['L6.depositFrom'] === s}
              onPress={readOnly ? undefined : () => edit(withLayerAnswer(check, 'L6.depositFrom', s))}
            />
          ))}
        </View>
      </View>
      {asks.legal ? money('L6.closing', t('decide.v3.ui.layers.legal')) : null}
      {asks.moving ? money('L6.moving', t('decide.v3.ui.layers.moving')) : null}
      {anyHidden ? <Text style={label}>{t('decide.v3.ui.layers.askedInCosts')}</Text> : null}
      <View style={styles.field}>
        <Text style={label}>{t('decide.v3.ui.layers.keep')}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.v3.ui.layers.keep')} style={styles.wrap}>
          {VALUE_YEARS.map((y) => (
            <View key={y.key} style={yearCell}>
              <Chip
                label={t(`decide.v3.ui.layers.years.${y.key}`)}
                selected={check.layerAnswers['L6.keepYears'] === y.years}
                onPress={readOnly ? undefined : () => edit(withLayerAnswer(check, 'L6.keepYears', y.years))}
              />
            </View>
          ))}
        </View>
      </View>
      <Text accessibilityRole="header" style={label}>{t('decide.v3.ui.layers.after')}</Text>
      {money('L6.newBills', t('decide.v3.ui.layers.newBills'))}
      {money('L6.stopBills', t('decide.v3.ui.layers.stopBills'))}
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.v3.ui.layers.storedNote')}</Text>
    </LayerCard>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.gapSm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  yearCell: { flexGrow: 1, flexBasis: '22%' },
  yearCellStacked: { flexGrow: 1, flexBasis: '47%' },
});
