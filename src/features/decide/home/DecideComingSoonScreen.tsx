// Owner decision (00-UPGRADE-PLAN.md §2 option 3, §9 decision 1): while DECIDE_OPEN is false the
// Decide tab shows only this screen. Heading copy from 00-MAJOR-CHANGES.md §16.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { TabRootScreen } from '@/shell/screen/TabRootScreen';
import { space } from '@/theme/layout';
import { EmptyState } from '@/ui/EmptyState';

export function DecideComingSoonScreen() {
  const t = useT();
  return (
    <TabRootScreen title={t('decide.home.header')} hideSyncLine>
      <View style={styles.body}>
        <EmptyState heading={t('decide.home.comingSoon.heading')} body={t('decide.home.comingSoon.body')} />
      </View>
    </TabRootScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.screenH, paddingTop: space.groupGap },
});
