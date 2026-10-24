/** D-25: the edge tag. Display only; the verdict state never changes because of it. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { warnTint } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';

const PAD_V = 2;

export function EdgeTag() {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: warnTint }]}>
      <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.tabLabel, color: colors.warn1 }}>
        {t('decide.depth.edge.tag')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.gapMd,
    paddingVertical: PAD_V,
    borderRadius: radii.pill,
  },
});
