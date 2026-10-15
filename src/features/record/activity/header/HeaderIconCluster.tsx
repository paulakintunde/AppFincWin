// D-58: the Search / Filter / More icon trio, shared by the month row and the compact header.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { HeaderIconButton } from './HeaderIconButton';

export interface HeaderIconClusterProps {
  activeFilterCount: number;
  onSearch: () => void;
  onFilter: () => void;
  onMore: () => void;
  searchRef?: React.Ref<View>;
  /** 'month' in the month row, 'compact' in the compact header. */
  testIDPrefix?: string;
}

export function HeaderIconCluster({
  activeFilterCount,
  onSearch,
  onFilter,
  onMore,
  searchRef,
  testIDPrefix,
}: HeaderIconClusterProps): React.JSX.Element {
  const t = useT();
  const id = (name: string) => (testIDPrefix !== undefined ? `${testIDPrefix}-${name}-button` : undefined);
  return (
    <View style={styles.row}>
      <HeaderIconButton
        glyph="search"
        label={t('activity.searchIcon')}
        onPress={onSearch}
        buttonRef={searchRef}
        testID={id('search')}
      />
      <HeaderIconButton
        glyph="filter"
        label={
          activeFilterCount > 0
            ? t('activity.filter.iconActiveA11y', { count: activeFilterCount })
            : t('activity.filter.title')
        }
        onPress={onFilter}
        badge={activeFilterCount}
        testID={id('filter')}
      />
      <HeaderIconButton glyph="more" label={t('activity.more.triggerA11y')} onPress={onMore} testID={id('more')} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
});
