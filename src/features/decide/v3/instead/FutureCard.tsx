// 05.3-29 (DSV-10): one card of "What could I do instead?". Surface, radius 26, padding 16; the heading row puts the
// title left and the figure right and stacks the figure under the title under rule S.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { useShouldStack } from '../../ui/textFit';

const FIGURE_MIN_SCALE = 0.8;

export interface FutureCardProps {
  title: string;
  /** The head figure; its screen-reader form is `figureA11y`. */
  figure: string | null;
  figureA11y?: string;
  children?: React.ReactNode;
}

export function FutureCard({ title, figure, figureA11y, children }: FutureCardProps): React.JSX.Element {
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack(figure === null ? undefined : figure.length);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={stacked ? styles.headStacked : styles.head}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, flexShrink: 1 }}>
          {title}
        </Text>
        {figure === null ? null : (
          <Text
            accessibilityLabel={figureA11y}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={FIGURE_MIN_SCALE}
            style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, flexShrink: 1 }}>
            {figure}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

export function CardBody({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { colors, pairing } = useTheme();
  return <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.gapMd },
  headStacked: { gap: space.gapSm / 2 },
});
