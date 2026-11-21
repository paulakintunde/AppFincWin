/**
 * 09-16 (UI-SPEC 9b, section 4): the small sheet a gated write button opens. Locked: names the action and leads to
 * Plans. Sample look-around: "That needs your own records" and leads to the trial. Declarative, never advice.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useT } from '@/i18n';
import { Pill } from '@/ui/Pill';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { hapticTap } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { PlanLink } from './components/NoticeCard';
import type { LockActionId, LockVariant } from './lockTypes';
import { plansHref } from './routes';

export interface LockedSheetProps {
  visible: boolean;
  action: LockActionId | null;
  variant: LockVariant;
  onClose: () => void;
}

export function LockedSheet({ visible, action, variant, onClose }: LockedSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const sample = variant === 'sample';
  const title = sample ? t('onboarding.sample.lockedTitle') : action ? t(`plans.paywall.lockActions.${action}`) : '';
  const body = sample ? t('onboarding.sample.lockedBody') : t('lock.sheetBody');
  const primary = sample ? t('plans.paywall.cta.startTrial') : t('lock.sheetPrimary');
  const secondary = sample ? t('onboarding.sample.keepLooking') : t('lock.sheetKeepReading');

  const choose = (): void => {
    hapticTap();
    onClose();
    router.push(sample ? plansHref({ mode: 'first_run', trigger: 'sample_bar' }) : plansHref({ mode: 'locked', trigger: 'locked' }));
  };

  return (
    <Sheet visible={visible} onDismiss={onClose}>
      <View style={styles.column} testID="locked-sheet">
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
          {title}
        </Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{body}</Text>
        <Pill label={primary} variant="primary" onPress={choose} />
        <PlanLink label={secondary} onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({ column: { gap: space.groupGap } });
