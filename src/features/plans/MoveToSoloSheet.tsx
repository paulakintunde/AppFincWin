/**
 * 09-20 (UI-SPEC 8e, D-42, D-44): the payer's "Move to Solo". Solo takes effect at the next renewal, so the spare places stay
 * until then. It is offered only when nobody else is in the home: with other members it says to remove them first and has no
 * confirm. The confirm is the accent action, not a loss: nothing is lost today. 09-19's notices open this sheet.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useT } from '@/i18n';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Pill } from '@/ui/Pill';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { formatPlanDate } from './formatPlanDate';
import { useChangePlan } from './useChangePlan';

const HOUSEHOLD_HREF = '/household' as Href;

export interface MoveToSoloSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function MoveToSoloSheet({ visible, onClose }: MoveToSoloSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const change = useChangePlan(visible);
  const { plan, flow } = change;
  const others = plan.members > 1;
  const pv = change.preview('solo');
  const busy = flow.state === 'pending' || flow.state === 'waitingServer' || flow.state === 'slow';

  // A move that starts at renewal is finished as soon as the store has it; the sheet closes then.
  const done = flow.state === 'done';
  useEffect(() => {
    if (visible && done) onClose();
  }, [visible, done, onClose]);

  if (others) {
    return (
      <Sheet visible={visible} onDismiss={onClose}>
        <View style={styles.column} testID="move-solo-members">
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
            {t('plans.solo.title')}
          </Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('plans.solo.removeFirst')}</Text>
          <Pressable
            accessibilityRole="link"
            hitSlop={LINK_HIT_SLOP}
            onPress={() => {
              onClose();
              router.push(HOUSEHOLD_HREF);
            }}
            style={styles.link}
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('plans.solo.seeMembers')}</Text>
          </Pressable>
          <Pill label={t('plans.solo.secondary')} variant="secondary" onPress={onClose} />
        </View>
      </Sheet>
    );
  }

  const confirm = () => {
    if (busy) return;
    hapticTap();
    if (!change.run('solo')) hapticFailed();
  };

  return (
    <ConfirmSheet
      visible={visible}
      title={t('plans.solo.title')}
      body={t('plans.solo.body', { date: formatPlanDate(plan.coveredUntil) })}
      cancelLabel={t('plans.solo.secondary')}
      confirmLabel={t('plans.solo.primary')}
      onCancel={onClose}
      onConfirm={confirm}
    >
      {pv.blocked ? (
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('plans.paywall.states.storeProblem')}</Text>
      ) : null}
      {flow.state === 'failed' ? (
        <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.ink }}>
          {t('plans.paywall.states.failed')} {flow.notCharged ? t('plans.paywall.states.notCharged') : ''}
        </Text>
      ) : null}
      {busy ? (
        <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {t('plans.paywall.states.updating')}
        </Text>
      ) : null}
    </ConfirmSheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.groupGap },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
