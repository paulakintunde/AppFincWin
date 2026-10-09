// The Activity header block: month switcher, totals line and the view / sort pills, with a
// trailing slot for the More menu (plan 34). Composition only.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { MonthTotals, SortKey } from '@/engine/activity';
import { space } from '@/theme/layout';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useT } from '@/i18n';
import { Dropdown, type DropdownOption } from '@/ui/Dropdown';
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
  /** ACT-15: entry count per month, and the month the Add row creates (null at the limit). */
  counts?: ReadonlyMap<string, number>;
  addMonth?: string | null;
  onAddMonth?: (month: string) => void;
  /** REC-19 / REC-21: the More menu. `prevMonthName` is the long name of the month before the viewed one. */
  prevMonthName?: string;
  onMore?: (key: MoreKey) => void;
}

export type MoreKey = 'clone' | 'paste';

function MoreMenu({ prevMonthName, onMore }: { prevMonthName: string; onMore: (key: MoreKey) => void }) {
  const t = useT();
  const label = t('activity.more.label');
  const options: DropdownOption<MoreKey>[] = [
    { key: 'clone', label: t('activity.more.clone', { month: prevMonthName }), subLabel: t('activity.more.cloneSub'), triggerLabel: label },
    { key: 'paste', label: t('activity.more.paste'), subLabel: t('activity.more.pasteSub'), triggerLabel: label },
  ];
  // The trigger always reads "More" (each option's triggerLabel); the Dropdown needs a value, so Clone stands in.
  return (
    <Dropdown
      title={label}
      options={options}
      value="clone"
      onSelect={onMore}
      triggerA11yLabel={t('activity.more.triggerA11y')}
    />
  );
}

export function ActivityHeader(props: ActivityHeaderProps) {
  const { view, sort } = props;
  return (
    <>
      <View testID="activity-month-row" style={styles.row}>
        <MonthSwitcher month={props.month} months={props.months} locale={props.formatter.locale} onChange={props.onMonthChange}
          counts={props.counts}
          addMonth={props.addMonth}
          onAddMonth={props.onAddMonth}
        />
      </View>
      {props.showTotals ? (
        <MonthTotalsBar totals={props.totals} homeCurrency={props.homeCurrency} formatter={props.formatter} />
      ) : null}
      <View testID="activity-view-row" style={styles.pills}>
        <ViewDropdown views={props.views} value={view} onSelect={props.onViewChange} />
        {view === 'calendar' ? null : <SortDropdown value={sort} onSelect={props.onSortChange} />}
        {props.onMore !== undefined ? <MoreMenu prevMonthName={props.prevMonthName ?? ''} onMore={props.onMore} /> : null}
        {props.trailing}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
  pills: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.gapSm },
});
