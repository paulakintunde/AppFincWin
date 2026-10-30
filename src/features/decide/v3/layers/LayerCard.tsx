// 05.3-40 (UI-SPEC Layer cards): the shared card shell of every layer on the Check screen: surface, radius 26, padding 16,
// gap 12, with an eyebrow. 05.3-42 builds the value, major-asset and very-large cards on the same shell.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLooseT } from '../check/useLooseT';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';

export interface LayerCardProps {
  /** The full copy key of the eyebrow, for example decide.v3.ui.layers.planEyebrow. */
  eyebrowKey: string;
  testID?: string;
  children: React.ReactNode;
}

export function LayerCard({ eyebrowKey, testID, children }: LayerCardProps): React.JSX.Element {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted, textTransform: 'uppercase' }}>
        {t(eyebrowKey)}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPad, gap: space.gapMd },
});
