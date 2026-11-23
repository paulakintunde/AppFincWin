// 07-08: one "Where it went" row: glyph, name, amount, share, a thin bar in the chart colour for its rank (D-24).
import React from 'react';
import { View } from 'react-native';
import { useT } from '@/i18n';
import { chartPalette } from '@/theme/tokens';
import { CategoryGlyph, type CategoryGlyphProps } from '@/ui/CategoryGlyph';
import { ProgressBar } from '@/ui/ProgressBar';
import { Row } from '@/ui/Row';
import { percentText } from '../format';

export interface CategoryRowProps {
  categoryId: string | null;
  glyph: Omit<CategoryGlyphProps, 'size' | 'testID'> | null;
  name: string;
  amount: string;
  spokenAmount: string;
  shareBp: number;
  /** The row's rank (0 = biggest); null for the Everything else bucket. */
  colorIndex: number | null;
  onPress?: () => void;
  testID?: string;
}

export function CategoryRow({ glyph, name, amount, spokenAmount, shareBp, colorIndex, onPress, testID }: CategoryRowProps) {
  const t = useT();
  const percent = percentText(shareBp);
  const spoken = t('insights.categories.rowA11y', { name, amount: spokenAmount, percent });
  // Without onPress there is no "Opens Activity": drop that sentence.
  const label = onPress ? spoken : spoken.replace(/ Opens Activity\.$/, '');
  const shown = glyph ?? { colorKey: 'slate' as const, letter: name.charAt(0).toUpperCase() };
  return (
    <View testID={testID}>
      <Row
        label={name}
        emphasis
        amount={amount}
        sublabel={t('insights.categories.share', { percent })}
        leading={<CategoryGlyph {...shown} size={36} />}
        chevron={onPress !== undefined}
        onPress={onPress}
        accessibilityLabel={label}
        footer={
          <ProgressBar
            percent={Number(percent)}
            variant="thin"
            tone="ink"
            chartColor={colorIndex === null ? undefined : chartPalette[colorIndex % chartPalette.length]}
            animate
          />
        }
      />
    </View>
  );
}
