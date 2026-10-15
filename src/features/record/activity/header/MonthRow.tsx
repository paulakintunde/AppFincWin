// Band 2 (D-52..D-55): month switcher sharing a line with Search / Filter / More. The long name
// is shown when it fits, then the short Intl name, then the icons wrap to their own right-aligned
// row. Measured, not a fixed width check (a fixed check fails at large text sizes).
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { size, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { formatMonthLabel, MonthSwitcher } from '../MonthSwitcher';
import { HeaderIconCluster } from './HeaderIconCluster';
import { chooseMonthLayout, formatMonthShort } from './monthLayout';

export const MONTH_ROW_ARROWS_WIDTH = 2 * space.touchMin + 2 * space.gapSm;
export const MONTH_ROW_ICONS_WIDTH = 3 * size.backCompact + 2 * space.gapSm;

export interface MonthRowProps {
  month: string;
  months: readonly string[];
  locale: string;
  onMonthChange: (m: string) => void;
  counts?: ReadonlyMap<string, number>;
  addMonth?: string | null;
  onAddMonth?: (m: string) => void;
  activeFilterCount: number;
  onSearch: () => void;
  onFilter: () => void;
  onMore: () => void;
  searchRef?: React.Ref<View>;
}

export function MonthRow({
  month,
  months,
  locale,
  onMonthChange,
  counts,
  addMonth,
  onAddMonth,
  activeFilterCount,
  onSearch,
  onFilter,
  onMore,
  searchRef,
}: MonthRowProps): React.JSX.Element {
  const { colors, pairing } = useTheme();
  const [rowWidth, setRowWidth] = useState(0);
  const [longWidth, setLongWidth] = useState(0);
  const [shortWidth, setShortWidth] = useState(0);

  const layout = chooseMonthLayout({
    rowWidth,
    longWidth,
    shortWidth,
    arrowsWidth: MONTH_ROW_ARROWS_WIDTH,
    iconsWidth: MONTH_ROW_ICONS_WIDTH,
    gap: space.gapSm,
  });
  const longLabel = formatMonthLabel(month, locale);
  const shortLabel = formatMonthShort(month, locale);
  const nameStyle = { ...textRole(pairing, 'sheetTitle'), color: colors.ink };

  const cluster = (
    <HeaderIconCluster
      activeFilterCount={activeFilterCount}
      onSearch={onSearch}
      onFilter={onFilter}
      onMore={onMore}
      searchRef={searchRef}
      testIDPrefix="month"
    />
  );

  return (
    <View testID="activity-month-row" onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.measure}
      >
        <Text
          testID="month-measure-long"
          numberOfLines={1}
          onLayout={(e) => setLongWidth(e.nativeEvent.layout.width)}
          style={nameStyle}
        >
          {longLabel}
        </Text>
        <Text
          testID="month-measure-short"
          numberOfLines={1}
          onLayout={(e) => setShortWidth(e.nativeEvent.layout.width)}
          style={nameStyle}
        >
          {shortLabel}
        </Text>
      </View>
      <View style={styles.line}>
        <View style={styles.monthCluster}>
          <MonthSwitcher
            month={month}
            months={months}
            locale={locale}
            onChange={onMonthChange}
            counts={counts}
            addMonth={addMonth}
            onAddMonth={onAddMonth}
            displayLabel={layout.name === 'short' ? shortLabel : longLabel}
          />
        </View>
        {layout.icons === 'inline' ? cluster : null}
      </View>
      {layout.icons === 'below' ? (
        <View testID="activity-month-icons-row" style={styles.iconsBelow}>
          {cluster}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  measure: { position: 'absolute', left: 0, top: 0, opacity: 0, flexDirection: 'column', alignItems: 'flex-start' },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapSm },
  monthCluster: { flexShrink: 1 },
  iconsBelow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: space.gapSm },
});
