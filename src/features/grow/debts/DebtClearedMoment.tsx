// 06.2-21 (D-19, D-20): the one debt milestone. Mounted only when a payment just carried this debt to zero (the mark in
// src/state/debtCleared.ts, taken once), it plays the debt-cleared icon once beside the "Debt cleared" badge and gives one
// Success tap. A debt that was cleared earlier shows only the badge (DebtClearedBadge). With Reduce Motion, or on a build
// without the native view, the icon is simply its last frame (AnimatedIcon shows the still glyph).
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { stateColors } from '@/theme/tokens';
import * as haptics from '@/ui/haptics';
import { MilestoneIcon } from '@/ui/icons/MilestoneIcon';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { subscribeDebtCleared, takeDebtCleared } from '@/state/debtCleared';

/** The quiet cleared state: the shared badge with the words "Debt cleared". */
export function DebtClearedBadge() {
  const t = useT();
  return <StatusBadge status="cleared" label={t('appLife.debts.debtCleared')} testID="debt-cleared-badge" />;
}

/** The moment: the icon once, the badge, one Success haptic on mount. */
export function DebtClearedMoment() {
  useEffect(() => {
    haptics.hapticMilestone();
  }, []);
  return (
    <View testID="debt-cleared-moment" style={styles.row}>
      <MilestoneIcon name="debtCleared" color={stateColors.fits.color} testID="debt-cleared-icon" />
      <DebtClearedBadge />
    </View>
  );
}

/**
 * True once this screen has taken a fresh cleared mark for `id`. Only checked while the debt reads as cleared, and a mark
 * made after the screen mounted (the payment's write finishing) is taken when it arrives. Once true it stays true for the
 * life of the screen, so the moment never replays on a re-render; a later visit finds no mark.
 */
export function useDebtClearedMoment(id: string, cleared: boolean): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!cleared || show) return;
    const check = () => {
      if (takeDebtCleared(id)) setShow(true);
    };
    check();
    return subscribeDebtCleared(check);
  }, [id, cleared, show]);
  return show;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
});
