/**
 * 05-71 (D-72, UI-SPEC R1 "Empty-state add row"): the slim line under the quick-check card. Left, "+ Add a change coming up"
 * (only while there are no changes); right, "Check an investment" (only while Open checks is hidden). No card, no fill.
 * Under rule S the two items stack, each on its own 44 line. Renders nothing when neither shows.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { useShouldStack } from '../ui/textFit';

const BAR_LONG = 10;
const BAR_THICK = 1.5;

export interface AddChangeRowProps {
  showAdd: boolean;
  showInvest: boolean;
  onAdd: () => void;
  onInvest: () => void;
}

function PlusGlyph() {
  const { colors } = useTheme();
  return (
    <View style={styles.glyph} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.barH, { backgroundColor: colors.accent }]} />
      <View style={[styles.barV, { backgroundColor: colors.accent }]} />
    </View>
  );
}

export function AddChangeRow({ showAdd, showInvest, onAdd, onInvest }: AddChangeRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const stack = useShouldStack();
  if (!showAdd && !showInvest) return null;
  const labelStyle = { ...textRole(pairing, 'label'), color: colors.accent };
  const addLabel = t('decide.home.addChange');
  const investLabel = t('decide.home.checkInvestment');

  return (
    <View style={[styles.line, stack ? styles.stacked : null, !showAdd && !stack ? styles.alone : null]}>
      {showAdd ? (
        <Pressable
          testID="add-change-row"
          accessibilityRole="button"
          accessibilityLabel={addLabel}
          onPress={onAdd}
          style={({ pressed }) => [styles.item, styles.addItem, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <PlusGlyph />
          <Text style={[labelStyle, styles.addText]}>{addLabel}</Text>
        </Pressable>
      ) : null}
      {showInvest ? (
        <Pressable
          testID="check-investment-link"
          accessibilityRole="button"
          accessibilityLabel={investLabel}
          onPress={onInvest}
          style={({ pressed }) => [styles.item, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={labelStyle}>{investLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapSm, paddingHorizontal: space.cardPadLg },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  alone: { justifyContent: 'flex-end' },
  item: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  addItem: { flexShrink: 1, gap: space.gapSm },
  addText: { flexShrink: 1 },
  glyph: { width: BAR_LONG, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  barH: { position: 'absolute', width: BAR_LONG, height: BAR_THICK },
  barV: { position: 'absolute', height: BAR_LONG, width: BAR_THICK },
});
