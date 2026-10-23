/** D-75 / UI-SPEC R1 "First-run hint": a one-line tile above the folds, gone for good after the first fold or details tap. Plain text, not a live region. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { DURATION, useReduceMotion } from '@/theme/motion';
import { fontSize, textRole } from '@/theme/typography';

const CHEVRON_SIZE = 8;
const TILE_RADIUS = 16;

export interface FoldHintProps {
  visible: boolean;
}

export function FoldHint({ visible }: FoldHintProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const reduced = useReduceMotion();
  if (!visible) return null;
  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(DURATION.entrance)}
      exiting={reduced ? undefined : FadeOut.duration(DURATION.entrance)}
      style={[styles.tile, { backgroundColor: colors.fill1 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, fontWeight: '600', color: colors.inkDim }}>
        {t('decide.hint.foldTap')}
      </Text>
      <View style={[styles.chevron, { borderColor: colors.inkSoft3 }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: TILE_RADIUS,
    paddingVertical: space.gapMd,
    paddingHorizontal: space.cardPad,
  },
  chevron: {
    width: CHEVRON_SIZE,
    height: CHEVRON_SIZE,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
});
