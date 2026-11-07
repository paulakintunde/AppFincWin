// 06-15 (G01, D-21): the Grow tab root. Date-free title, a tab-role segmented control (Goals / Debts / Investing), the segment's
// content in place (no navigation, no haptic), the Tools row and the footer. The FAB label follows the segment.
// The FAB opens the sheet of the selected segment: NewGoalSheet, AddDebtSheet (through DebtsSegment addOpen / onAddClosed) or
// AddHoldingSheet. 06-16 adds the first-open safety-net confirm (D-07) over the screen.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { DebtsSegment } from '@/features/grow/debts/DebtsSegment';
import { growFeatureFlags, growSegments, isGrowBasics, type GrowSegment } from '@/features/grow/growFeatureFlags';
import { AddHoldingSheet } from '@/features/grow/investing/AddHoldingSheet';
import { InvestingSegment } from '@/features/grow/investing/InvestingSegment';
import { FirstOpenNetSheet } from '@/features/grow/safetyNet/FirstOpenNetSheet';
import { useRegisterFab } from '@/shell/fab/FabProvider';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { TabRootScreen } from '@/shell/screen/TabRootScreen';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { NewGoalSheet } from '@/features/grow/goals/NewGoalSheet';
import { GoalsSegment } from './GoalsSegment';
import { ToolsRow } from './ToolsRow';

const FAB_KEY = { goals: 'goal', debts: 'debt', investing: 'holding' } as const;

interface SegmentTabsProps {
  segments: readonly GrowSegment[];
  selected: GrowSegment;
  onSelect: (s: GrowSegment) => void;
}

/** A tablist, not SegmentedToggle (that one is a radiogroup). 44 px tall, selected is announced as selected. */
function SegmentTabs({ segments, selected, onSelect }: SegmentTabsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View
      testID="grow-segments"
      accessibilityRole="tablist"
      accessibilityLabel={t('grow.home.segmentsLabel')}
      style={[styles.tabs, { backgroundColor: colors.fill1 }]}
    >
      {segments.map((s) => {
        const on = s === selected;
        return (
          <Pressable
            key={s}
            testID={`grow-segment-${s}`}
            accessibilityRole="tab"
            accessibilityLabel={t(`grow.home.segments.${s}`)}
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(s)}
            style={[styles.tab, on ? { backgroundColor: colors.surface } : null]}
          >
            <Text style={{ ...textRole(pairing, 'label'), color: on ? colors.ink : colors.inkMuted }}>{t(`grow.home.segments.${s}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface GrowHomeProps {
  /** Plan 06-22 passes NewGoalSheet here; it is drawn over the screen and gets the open state. */
  sheets?: (state: { newGoalOpen: boolean; closeNewGoal: () => void }) => React.ReactNode;
}

export function GrowHome({ sheets }: GrowHomeProps = {}) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const flags = useMemo(() => growFeatureFlags(), []);
  const basics = isGrowBasics(flags);
  const segments = growSegments(flags);
  const [picked, setPicked] = useState<GrowSegment>('goals');
  const selected: GrowSegment = segments.includes(picked) ? picked : (segments[0] ?? 'goals');
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [addDebtOpen, setAddDebtOpen] = useState(false);
  const [addHoldingOpen, setAddHoldingOpen] = useState(false);

  const onNewGoal = useCallback(() => setNewGoalOpen(true), []);
  const closeNewGoal = useCallback(() => setNewGoalOpen(false), []);
  const onAddDebt = useCallback(() => setAddDebtOpen(true), []);
  const closeAddDebt = useCallback(() => setAddDebtOpen(false), []);
  const onAddHolding = useCallback(() => setAddHoldingOpen(true), []);
  const closeAddHolding = useCallback(() => setAddHoldingOpen(false), []);
  const onChooseTrack = useCallback(() => pushOnce('/you'), []);

  const fabKey = FAB_KEY[selected];
  const onFab = selected === 'goals' ? onNewGoal : selected === 'debts' ? onAddDebt : onAddHolding;
  const fab = useMemo(
    () => (basics ? null : { label: t(`grow.home.fab.${fabKey}`), accessibilityLabel: t(`grow.home.fab.${fabKey}`), onPress: onFab }),
    [basics, t, fabKey, onFab]
  );
  useRegisterFab(fab);

  return (
    <TabRootScreen
      title={t('grow.home.title')}
      overlay={
        <>
          <NewGoalSheet visible={newGoalOpen} onClose={closeNewGoal} />
          <AddHoldingSheet visible={addHoldingOpen} onClose={closeAddHolding} />
          <FirstOpenNetSheet />
          {sheets ? sheets({ newGoalOpen, closeNewGoal }) : null}
        </>
      }
    >
      <View testID="grow-home" style={styles.body}>
        {basics ? null : <SegmentTabs segments={segments} selected={selected} onSelect={setPicked} />}
        {basics || selected === 'goals' ? (
          <GoalsSegment basics={basics} onNewGoal={onNewGoal} onChooseTrack={onChooseTrack} />
        ) : selected === 'debts' ? (
          <DebtsSegment addOpen={addDebtOpen} onAddClosed={closeAddDebt} />
        ) : (
          <InvestingSegment />
        )}
        {basics ? null : <ToolsRow />}
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('grow.home.footer')}</Text>
      </View>
    </TabRootScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.screenH, gap: space.groupGap },
  tabs: { flexDirection: 'row', borderRadius: radii.pill, padding: 3, minHeight: space.touchMin },
  tab: { flex: 1, minHeight: space.touchMin - 6, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
});
