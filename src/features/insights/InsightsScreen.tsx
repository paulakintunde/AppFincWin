// 07-11 (D-16..D-19): the Insights tab root. One scope and one range shared by every section. Level 2 sees the Everyday
// sections; Net worth and Score appear from level 3 (their own feature ids). The sections own their own empty states;
// this screen owns only the whole-tab states (nothing recorded, nothing shared, deep link while hidden, load, error).
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import type { InsightsRange } from '@/engine/insights';
import { useTransactionMonths } from '@/data/queries/activity';
import { useInsightsPrepared } from '@/data/queries/insights';
import { useFeatureAccess } from '@/features/levels/useFeatureAccess';
import { openEntry } from '@/features/record/entry/entryHost';
import { useT } from '@/i18n';
import { FEATURES_HREF } from '@/features/plans/routes';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { TabRootScreen } from '@/shell/screen/TabRootScreen';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { EmptyState } from '@/ui/EmptyState';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { SyncStatusLine } from '@/ui/SyncStatusLine';
import { Text } from '@/ui/Text';
import { RangeControl } from './charts/RangeControl';
import { recordedMonths } from './model/everyday';
import { MoneyInOutSection } from './sections/MoneyInOutSection';
import { MonthAgainstLastSection } from './sections/MonthAgainstLastSection';
import { NetWorthSection } from './sections/NetWorthSection';
import { ScoreCard } from './sections/ScoreCard';
import { WhereItWentSection } from './sections/WhereItWentSection';
import { useCategoryNaming } from './useCategoryNaming';
import { useInsightsScope } from './useInsightsScope';

export function InsightsScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [range, setRange] = useState<InsightsRange>('6m');
  const s = useInsightsScope();
  const data = useInsightsPrepared(s.scope, s.householdCurrency);
  const entries = useTransactionMonths(s.householdId, s.today);
  const naming = useCategoryNaming(s.householdId, data.partnerCategories, data.categorySourceIds); // 07 D-32, D-33
  const visible = useFeatureAccess('insights').visible;
  const showNetWorth = useFeatureAccess('netWorthTrend').visible;
  const showScore = useFeatureAccess('healthScore').visible;

  const addOut = useCallback(() => openEntry({ kind: 'new', direction: 'out' }), []);
  const addIn = useCallback(() => openEntry({ kind: 'new', direction: 'in' }), []);
  const addAccount = useCallback(() => pushOnce('/accounts' as Href), []);
  const openFeatures = useCallback(() => pushOnce(FEATURES_HREF), []);
  const toMine = useCallback(() => s.setScope('mine'), [s]);
  const onGap = useCallback(
    (missing: 'income' | 'spending' | 'balance') => (missing === 'income' ? addIn() : missing === 'spending' ? addOut() : addAccount()),
    [addIn, addOut, addAccount],
  );

  const household = s.scope === 'household';
  const prepared = data.prepared;
  // WR-02: Decide's inputs hold no months until one full month is logged; 07 D-35 lays this month so far into Insights' own copy, so a
  // first-month user has one month here (entries no stored rate converts still leave it empty). In Just me the whole-tab
  // empty state is for a user with no entries at all; with entries this month the sections show and each owns its own empty state.
  const hasEntries = entries.months.some((m) => (entries.counts.get(m) ?? 0) > 0);
  const empty =
    visible && data.status === 'ready' && prepared !== null && recordedMonths(prepared).length === 0 && !(s.scope === 'mine' && hasEntries);

  let body: React.ReactNode;
  if (!visible) {
    // IN-06: a deep link below the level that shows Insights. Adding entries would not open it, so point at Features instead.
    body = (
      <EmptyState
        testID="insights-empty"
        heading={t('insights.states.lockedHeading')}
        body={t('insights.states.lockedBody')}
        actionLabel={t('insights.states.lockedAction')}
        onAction={openFeatures}
      />
    );
  } else if (empty) {
    const shared = household;
    body = (
      <EmptyState
        testID="insights-empty"
        heading={t(shared ? 'insights.states.householdEmptyHeading' : 'insights.states.emptyHeading')}
        body={t(shared ? 'insights.states.householdEmptyBody' : 'insights.states.emptyBody')}
        actionLabel={t(household ? 'insights.states.householdEmptyAction' : 'insights.states.emptyAction')}
        onAction={addOut}
      />
    );
  } else if (data.status === 'error') {
    body = (
      <EmptyState
        testID="insights-error"
        heading={t('insights.states.errorTitle')}
        body={t('insights.states.errorBody')}
        actionLabel={t('insights.states.retry')}
        onAction={data.retry}
      />
    );
  } else if (data.status === 'loading' || prepared === null) {
    body = (
      <View testID="insights-loading" style={styles.sections}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.placeholder, { backgroundColor: colors.fill1 }]} />
        ))}
      </View>
    );
  } else {
    body = (
      <View style={styles.sections}>
        <MoneyInOutSection prepared={prepared} currency={s.currency} range={range} />
        <WhereItWentSection prepared={prepared} currency={s.currency} range={range} naming={naming} />
        <MonthAgainstLastSection prepared={prepared} currency={s.currency} onAddEntry={addOut} naming={naming} />
        {showNetWorth ? <NetWorthSection range={range} scope={s.scope} currency={s.currency} onAddAccount={addAccount} /> : null}
        {showScore ? (
          <ScoreCard scope={s.scope} minePrepared={data.minePrepared} status={data.status} onSwitchToMine={toMine} onGapAction={onGap} onRetry={data.retry} />
        ) : null}
      </View>
    );
  }

  return (
    <TabRootScreen title={t('insights.title')}>
      <View testID="insights-screen" style={styles.body}>
        {visible && s.showScope ? (
          <SegmentedControl
            haptic={false}
            accessibilityLabel={t('insights.scope.label')}
            value={s.scope === 'household' ? 'household' : 'mine'}
            onChange={(k) => s.setScope(k === 'household' ? 'household' : 'mine')}
            options={[
              { key: 'mine', label: t('insights.scope.mine') },
              { key: 'household', label: t('insights.scope.household') },
            ]}
          />
        ) : null}
        {visible ? <RangeControl value={range} onChange={setRange} /> : null}
        {visible ? <SyncStatusLine /> : null}
        {body}
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('insights.footer')}</Text>
      </View>
    </TabRootScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.screenH, gap: space.groupGap },
  sections: { gap: space.groupGap },
  placeholder: { height: 160, borderRadius: radii.card },
});
