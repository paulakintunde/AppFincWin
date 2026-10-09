// The Activity header block: month switcher, totals line and the view / sort pills, with a
// trailing slot for the More menu (plan 34). Composition only.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { MonthTotals, SortKey } from '@/engine/activity';
import { space } from '@/theme/layout';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { MonthSwitcher } from './MonthSwitcher';
import { MonthTotalsBar } from './MonthTotalsBar';
import { SortDropdown } from './SortDropdown';
import { ViewDropdown } from './ViewDropdown';
import type { ActivityView } from './activityViewPrefs';

export interface ActivityHeaderProps {
  month: string;
  months: readonly string[];
  onMonthChange: (month: string) => void;
  totals: MonthTotals;
  showTotals: boolean;
  homeCurrency: string;
  formatter: MoneyFormatter;
  views: readonly ActivityView[];
  view: ActivityView;
  onViewChange: (view: ActivityView) => void;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  trailing?: React.ReactNode;
}

export function ActivityHeader(props: ActivityHeaderProps) {
  const { view, sort } = props;
  return (
    <>
      <View testID="activity-month-row" style={styles.row}>
        <MonthSwitcher month={props.month} months={props.months} locale={props.formatter.locale} onChange={props.onMonthChange} />
      </View>
      {props.showTotals ? (
        <MonthTotalsBar totals={props.totals} homeCurrency={props.homeCurrency} formatter={props.formatter} />
      ) : null}
      <View testID="activity-view-row" style={styles.pills}>
        <ViewDropdown views={props.views} value={view} onSelect={props.onViewChange} />
        {view === 'calendar' ? null : <SortDropdown value={sort} onSelect={props.onSortChange} />}
        {props.trailing}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
  pills: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.gapSm },
});
