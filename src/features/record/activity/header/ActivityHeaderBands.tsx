// 03.1 D-43 four bands; visual order = tree order (D-69); no money maths here.
// Composes the month row, summary card, Display row, Unpaid banner and offer card, and holds every
// visibility rule for them so the screen only wires state into props.
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { DURATION, useMotion } from '@/theme/motion';
import { textRole } from '@/theme/typography';
import type { SortKey } from '@/engine/activity';
import type { ActivityView } from '../activityViewPrefs';
import { SearchBar, type SearchScope } from '../SearchBar';
import { UnpaidBanner } from '../UnpaidBanner';
import { formatMonthLabel } from '../MonthSwitcher';
import { MonthRow } from './MonthRow';
import { ActivitySummaryCard, type ActivitySummaryCardProps } from './ActivitySummaryCard';
import { DisplayChip } from './DisplayChip';
import { FilterChipRow } from './FilterChipRow';
import { SelectBar } from './SelectBar';
import type { FilterChipModel, FilterKind } from './activeFilters';

const TITLE_TO_MONTH_GAP = 4; // UI-SPEC declared one-off exception, not a token

export interface ActivityHeaderBandsProps {
  // band 2
  month: string;
  months: readonly string[];
  locale: string;
  onMonthChange: (m: string) => void;
  counts?: ReadonlyMap<string, number>;
  addMonth?: string | null;
  onAddMonth?: (m: string) => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  onOpenMore: () => void;
  searchIconRef?: React.Ref<View>;
  // search (D-59..D-62)
  searchOpen: boolean;
  onOpenSearch: () => void;
  onCancelSearch: () => void;
  term: string;
  scope: SearchScope;
  onTermChange: (t: string) => void;
  onScopeChange: (s: SearchScope) => void;
  resultsCount: number | null;
  // band 3
  monthEmpty: boolean;
  loading: boolean;
  card: Omit<ActivitySummaryCardProps, 'loading'>;
  // band 4
  view: ActivityView;
  sort: SortKey;
  onOpenDisplay: () => void;
  displayChipRef: React.RefObject<View | null>;
  filterChips: readonly FilterChipModel[];
  onRemoveFilter: (kind: FilterKind) => void;
  onClearAllFilters: () => void;
  selectionActive: boolean;
  selectionCount: number;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectDone: () => void;
  // after band 4
  unpaidOnly: boolean;
  onClearUnpaid: () => void;
  offerCard: React.ReactNode;
}

export function ActivityHeaderBands(p: ActivityHeaderBandsProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  const motion = useMotion();

  // D-62: month row and search field cross-fade over 150 ms; instant under Remove animations.
  const fade = useSharedValue(p.searchOpen ? 1 : 0);
  const { searchOpen } = p;
  const duration = motion.duration(DURATION.searchFade);
  const easing = motion.easing;
  useEffect(() => {
    fade.value = withTiming(searchOpen ? 1 : 0, { duration, easing });
  }, [searchOpen, duration, easing, fade]);
  const monthStyle = useAnimatedStyle(() => ({ opacity: 1 - fade.value }));
  const searchStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  // D-51 (empty month) and D-61 (search open) hide the card and the Display row.
  const hideBands = searchOpen || (p.monthEmpty && !p.loading);

  return (
    <View style={{ marginTop: TITLE_TO_MONTH_GAP, gap: space.gapMd }}>
      {/* Band 2: both layers share one box. The month layer stays mounted so the Search icon ref
          survives for focus return on Cancel (D-59). */}
      <View>
        <Animated.View
          style={[monthStyle, searchOpen ? styles.overlay : null]}
          pointerEvents={searchOpen ? 'none' : 'auto'}
          accessibilityElementsHidden={searchOpen}
          importantForAccessibility={searchOpen ? 'no-hide-descendants' : 'auto'}
        >
          <MonthRow
            month={p.month}
            months={p.months}
            locale={p.locale}
            onMonthChange={p.onMonthChange}
            counts={p.counts}
            addMonth={p.addMonth}
            onAddMonth={p.onAddMonth}
            activeFilterCount={p.activeFilterCount}
            onSearch={p.onOpenSearch}
            onFilter={p.onOpenFilters}
            onMore={p.onOpenMore}
            searchRef={p.searchIconRef}
          />
        </Animated.View>
        {searchOpen ? (
          <Animated.View style={searchStyle}>
            <SearchBar
              term={p.term}
              scope={p.scope}
              monthLabel={formatMonthLabel(p.month, p.locale)}
              onTermChange={p.onTermChange}
              onScopeChange={p.onScopeChange}
              onCancel={p.onCancelSearch}
              autoFocus
            />
          </Animated.View>
        ) : null}
      </View>

      {/* D-61: results count is the first line under the field once a term is entered. */}
      {searchOpen && p.resultsCount !== null ? (
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {t('activity.count', { count: p.resultsCount })}
        </Text>
      ) : null}

      {/* Band 3 */}
      {!hideBands ? <ActivitySummaryCard {...p.card} loading={p.loading} /> : null}

      {/* Band 4: D-63 the SelectBar replaces the Display row in select mode. Review WR-02: it shows
          whenever select mode is on, even while searching or in an empty month, so the count and
          Done are always reachable while the BulkBar is up. */}
      {p.selectionActive ? (
        <SelectBar
          count={p.selectionCount}
          onSelectAll={p.onSelectAll}
          onSelectNone={p.onSelectNone}
          onDone={p.onSelectDone}
        />
      ) : !hideBands ? (
        <FilterChipRow
          leading={<DisplayChip view={p.view} sort={p.sort} onPress={p.onOpenDisplay} chipRef={p.displayChipRef} />}
          leadingFocusRef={p.displayChipRef}
          chips={p.filterChips}
          onOpenFilters={p.onOpenFilters}
          onRemove={p.onRemoveFilter}
          onClearAll={p.onClearAllFilters}
        />
      ) : null}

      {/* D-66: the Unpaid banner stays under band 4 while the Unpaid filter is on. */}
      {!searchOpen && p.unpaidOnly ? <UnpaidBanner onClear={p.onClearUnpaid} /> : null}

      {/* D-46: the offer card sits below the bands and above the list. */}
      {!searchOpen ? p.offerCard : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
});
