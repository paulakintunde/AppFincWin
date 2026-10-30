/**
 * 05.3-39 (D-20): the quiet "Something changed?" row on Decide home. It only opens the 05.2 SomethingChangedSheet; a picked
 * change goes where Decide settings sends it (targetOf). Nothing is applied here (life changes are user-led, T-05.3-39-04).
 */
import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { useT } from '@/i18n';
import * as a11yFocus from '@/shell/a11yFocus';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { EmergencyFundSheet } from '../../setup/EmergencyFundSheet';
import { isNeeded } from '../../setup/setupFlow';
import { SomethingChangedSheet } from '../../settings/SomethingChangedSheet';
import { targetOf, type ChangeId } from '../../settings/somethingChanged';
import { useSettingsData } from '../../settings/useSettingsData';

type Translate = (key: string) => string;

const ROW_RADIUS = 16;
const ROW_MIN = 44;
const PAD_V = 10;
const PAD_H = 16;
const CHEVRON = 8;

export function SomethingChangedRow(): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const loaded = useSettingsData();
  const [open, setOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const rowRef = useRef<React.ComponentRef<typeof Pressable>>(null);

  const close = (): void => {
    setOpen(false);
    a11yFocus.focusAccessibility(rowRef.current);
  };
  const pick = (id: ChangeId): void => {
    const target = targetOf(id, {
      hasRegularPay: loaded !== null && isNeeded('pay', loaded.facts),
      fullMonths: loaded?.facts.fullMonthsOfRecords,
    });
    setOpen(false);
    if (target.kind === 'sheet') setEmergencyOpen(true);
    else pushOnce(target.href as Href);
  };

  const K = 'decide.v3.ui.home.';
  return (
    <>
      <Pressable
        ref={rowRef}
        accessibilityRole="button"
        accessibilityLabel={t(`${K}somethingChangedA11y`)}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: colors.surface, borderColor: colors.line2, opacity: pressed ? PRESSED_OPACITY : 1 },
        ]}
      >
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flex: 1 }}>{t(`${K}somethingChanged`)}</Text>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.chevron, { borderColor: colors.inkFaint }]} />
      </Pressable>
      <SomethingChangedSheet visible={open} onClose={close} onPick={pick} />
      <EmergencyFundSheet visible={emergencyOpen} onClose={() => setEmergencyOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: ROW_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    borderRadius: ROW_RADIUS,
    borderWidth: 1,
    paddingVertical: PAD_V,
    paddingHorizontal: PAD_H,
  },
  chevron: { width: CHEVRON, height: CHEVRON, borderTopWidth: 2, borderRightWidth: 2, transform: [{ rotate: '45deg' }] },
});
