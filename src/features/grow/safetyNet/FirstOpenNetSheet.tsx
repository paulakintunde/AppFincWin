// 06-16 (D-07): the one-time "We moved your safety net here" sheet over Grow home. It shows when the migrated net has a size or a
// saved amount and has not been confirmed. The figures are the flagged goal's CURRENT values, read while the sheet is open (never
// values captured when the migration copied them: an old build may have changed decide_settings afterwards). "Looks right"
// confirms (it never shows again); "Change it" opens the size sheet; the backdrop and Close dismiss it for this session only.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useConfirmSafetyNet } from '@/data/mutations/growGoals';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { useT } from '@/i18n';
import { useGoalMoney } from '@/features/grow/home/useGoalMoney';
import { useGoalsRead } from '@/features/grow/goals/useGoalsRead';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { NetSizeSheet } from './NetSizeSheet';

// Dismissed for this app session only: gone with the process, so an unconfirmed net asks again on the next open.
let dismissedThisSession = false;

/** For tests: forget the session dismissal. */
export function resetFirstOpenNetDismissal(): void {
  dismissedThisSession = false;
}

export function FirstOpenNetSheet() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const money = useGoalMoney();
  const read = useGoalsRead();
  const rowsQ = useSavingsGoalRows(read.userId ?? undefined, read.householdId ?? undefined);
  const { confirm } = useConfirmSafetyNet();
  const [gone, setGone] = useState(dismissedThisSession);
  const [changing, setChanging] = useState(false);

  const point = read.model.safetyNet;
  const row = rowsQ.data?.find((r) => r.is_safety_net === true && r.deleted_at === null) ?? null;
  const dismiss = () => {
    dismissedThisSession = true;
    setGone(true);
  };

  if (changing && row !== null) {
    return (
      <NetSizeSheet
        visible
        net={row}
        saved={point === null ? 0 : point.saved}
        onClose={() => {
          setChanging(false);
          dismiss();
        }}
      />
    );
  }
  if (gone || read.status !== 'ready' || !read.model.needsNetConfirm || point === null || row === null || read.userId === null) return null;

  const userId = read.userId;
  const figure =
    point.size !== null
      ? t('grow.firstOpen.figure', { saved: money.amount(point.saved), target: money.amount(point.size) })
      : `${money.amount(point.saved)} · ${t('grow.safetyNet.locked')}`;
  const title = t('grow.firstOpen.title');
  return (
    <Sheet visible onDismiss={dismiss} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('grow.firstOpen.close')} onCancel={dismiss} />
      <SheetScroll>
        <View style={styles.body}>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('grow.firstOpen.body')}</Text>
          <View testID="first-open-net-figure" style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{figure}</Text>
            <StateBadge tone="blue" shape="lock" label={t('grow.safetyNet.locked')} accessibilityLabel={t('grow.safetyNet.lockedA11y')} />
          </View>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.firstOpen.footnote')}</Text>
          <Pill
            label={t('grow.firstOpen.confirm')}
            variant="primary"
            onPress={() => {
              confirm(row, userId);
              dismiss();
            }}
          />
          <Pill label={t('grow.firstOpen.change')} variant="secondary" onPress={() => setChanging(true)} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap, paddingBottom: space.groupGap },
  card: { borderWidth: 1, borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
});
