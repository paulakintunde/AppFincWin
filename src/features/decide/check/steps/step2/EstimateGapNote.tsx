/**
 * 05-44 (D-36, 04 D-56): a neutral line about how past estimates compared with what happened. Declarative, no colour, and
 * absent unless the engine had 3 or more past decisions with actuals (a null or zero gap renders nothing).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { EstimateBias } from '@/engine/decide';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { estimateGapCopy } from '../../../copy/depthInputsCopy';
import { refText } from '../../refText';

type Translate = Parameters<typeof refText>[0];

export function EstimateGapNote({ bias }: { bias: EstimateBias | null }) {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const copy = bias === null ? null : estimateGapCopy(bias);
  if (copy === null) return null;
  return (
    <View style={[styles.note, { backgroundColor: colors.fill1 }]}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>{refText(t, copy)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { borderRadius: space.cardPad, padding: space.cardPad },
});
