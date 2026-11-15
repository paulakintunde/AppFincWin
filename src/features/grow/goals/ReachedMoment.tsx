// 06-22 (G02a): the one success moment when a deposit carries a goal to its target. Mounted only when a deposit reached the
// target (justReached && reached in GoalDetailScreen), so it plays once per reaching, never on a normal deposit or a revisit.
// 06.2-20 (D-15, D-19, D-20): the goal-reached animated icon (MilestoneIcon, 48) plays once beside the shared Reached badge
// (StatusBadge: check + word, never colour alone), and one Success haptic fires on mount. No confetti, nothing at 25/50/75%.
// Under Reduce Motion the icon shows its last frame (AnimatedIcon's still); the haptic still fires once (it is not motion).
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { stateColors } from '@/theme/tokens';
import { hapticMilestone } from '@/ui/haptics';
import { MilestoneIcon } from '@/ui/icons/MilestoneIcon';
import { StatusBadge } from '@/ui/status/StatusBadge';

export function ReachedMoment() {
  const t = useT();

  useEffect(() => {
    hapticMilestone();
  }, []);

  return (
    <View testID="goal-reached" style={styles.row}>
      <MilestoneIcon name="goalReached" color={stateColors.fits.color} size={48} testID="goal-reached-icon" />
      <StatusBadge status="reached" label={t('grow.goals.detail.reached')} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
});
