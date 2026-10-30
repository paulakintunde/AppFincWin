// 05.3-42 (DSV-06, D-18, UI-SPEC Value block): "What it's worth to you". Stored only: the figures go to CheckV2.value and the
// alternative to layerAnswers 'L2.alternative'. Nothing here changes the answer, and the card says so in its note.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CheckV2 } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { useShouldStack } from '@/features/decide/ui/textFit';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { useLooseT } from '../check/useLooseT';
import { withLayerAnswer, withValue } from '../model/checkEdits';
import { LayerCard } from './LayerCard';

export interface ValueCardProps {
  check: CheckV2;
  edit(next: CheckV2): void;
  currency: string;
  readOnly?: boolean;
}

export const VALUE_YEARS = [
  { years: 1, key: 'y1' },
  { years: 3, key: 'y3' },
  { years: 5, key: 'y5' },
  { years: 10, key: 'y10' },
] as const;
const ALTERNATIVES = ['cheaper', 'used', 'rent', 'notYet'] as const;
export const ALTERNATIVE_KEY = 'L2.alternative';

export function ValueCard({ check, edit, currency, readOnly = false }: ValueCardProps): React.JSX.Element {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack();
  const alt = check.layerAnswers[ALTERNATIVE_KEY];
  const yearCell = stacked ? styles.yearCellStacked : styles.yearCell;
  const label = { ...textRole(pairing, 'label'), color: colors.inkDim };

  return (
    <LayerCard eyebrowKey="decide.v3.ui.layers.valueEyebrow" testID="value-card">
      <MoneyInput
        value={check.value.earnsMonthly}
        currency={currency}
        onChange={(m) => edit(withValue(check, { earnsMonthly: m === null ? null : minorUnits(m) }))}
        label={t('decide.v3.ui.layers.earns')}
        accessibilityLabel={t('decide.v3.ui.layers.earns')}
        readOnly={readOnly}
      />
      <View style={styles.field}>
        <Text style={label}>{t('decide.v3.ui.layers.useFor')}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.v3.ui.layers.useFor')} style={styles.years}>
          {VALUE_YEARS.map((y) => (
            <View key={y.key} style={yearCell}>
              <Chip
                label={t(`decide.v3.ui.layers.years.${y.key}`)}
                selected={check.value.useYears === y.years}
                onPress={readOnly ? undefined : () => edit(withValue(check, { useYears: y.years }))}
              />
            </View>
          ))}
        </View>
      </View>
      <View style={styles.field}>
        <Text style={label}>{t('decide.v3.ui.layers.alternatives')}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.v3.ui.layers.alternatives')} style={styles.wrap}>
          {ALTERNATIVES.map((a) => (
            <Chip
              key={a}
              label={t(`decide.v3.ui.layers.alt.${a}`)}
              selected={alt === a}
              onPress={readOnly ? undefined : () => edit(withLayerAnswer(check, ALTERNATIVE_KEY, a))}
            />
          ))}
        </View>
      </View>
      {alt === 'cheaper' ? (
        <MoneyInput
          value={check.value.cheaperPrice}
          currency={currency}
          onChange={(m) => edit(withValue(check, { cheaperPrice: m === null ? null : minorUnits(m) }))}
          label={t('decide.v3.ui.layers.theirPrice')}
          accessibilityLabel={t('decide.v3.ui.layers.theirPrice')}
          readOnly={readOnly}
        />
      ) : null}
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.v3.ui.layers.storedNote')}</Text>
    </LayerCard>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.gapSm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  years: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  yearCell: { flexGrow: 1, flexBasis: '22%' },
  yearCellStacked: { flexGrow: 1, flexBasis: '47%' },
});
