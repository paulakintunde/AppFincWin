// Band 2 (D-52..D-55): month switcher sharing a line with Search / Filter / More. The long name
// is shown when it fits, then the short Intl name, then the icons wrap to their own right-aligned
// row. Measured, not a fixed width check (a fixed check fails at large text sizes).
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { size, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { canArchiveMonth, visibleMonths } from '@/engine/archive';
import { localDateIn } from '@/engine/time';
import { ArchiveMonthConfirm } from '@/features/archive/ArchiveMonthConfirm';
import { useArchiveState } from '@/features/archive/useArchiveState';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { showToast } from '@/state/undoToast';
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

/** The month to move to when the selected one is archived: the nearest one still visible, later months first on a tie. */
function nearestVisible(month: string, months: readonly string[], archived: ReadonlySet<string>): string | null {
  const at = months.indexOf(month);
  if (at < 0) return null;
  for (let d = 1; d < months.length; d += 1) {
    const newer = months[at - d];
    if (newer !== undefined && !archived.has(newer)) return newer;
    const older = months[at + d];
    if (older !== undefined && !archived.has(older)) return older;
  }
  return null;
}

export function MonthRow({
  month,
  months: allMonths,
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
  // 10-16 (D-13, D-15): a view filter on the switcher only. Archived months leave this person's list; nothing else reads archive state.
  const archiveState = useArchiveState();
  const [pending, setPending] = useState<string | null>(null);
  const months = useMemo(() => visibleMonths(allMonths, archiveState.archived), [allMonths, archiveState.archived]);
  const today = useMemo(() => localDateIn(new Date(), getDeviceTimeZone()), []);
  useEffect(() => {
    if (!archiveState.archived.has(month)) return;
    const target = nearestVisible(month, allMonths, archiveState.archived);
    if (target !== null) onMonthChange(target);
  }, [month, allMonths, archiveState.archived, onMonthChange]);
  const confirmArchive = (): void => {
    const m = pending;
    setPending(null);
    if (m === null) return;
    archiveState.archive(m);
    showToast({
      kind: 'ordinary',
      text: { key: 'system.archive.archivedToast', params: { month: formatMonthLabel(m, locale) } },
      onUndo: () => archiveState.restore(m),
    });
  };
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
            archivable={archiveState.enabled ? (m) => canArchiveMonth(m, today) : undefined}
            onArchive={archiveState.enabled ? setPending : undefined}
            archivedCount={archiveState.count}
            onOpenArchive={() => router.push('/archive' as Href)}
            displayLabel={layout.name === 'short' ? shortLabel : longLabel}
          />
        </View>
        {layout.icons === 'inline' ? cluster : null}
      </View>
      <ArchiveMonthConfirm
        visible={pending !== null}
        monthLabel={pending === null ? '' : formatMonthLabel(pending, locale)}
        shared={archiveState.shared}
        onConfirm={confirmArchive}
        onCancel={() => setPending(null)}
      />
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
