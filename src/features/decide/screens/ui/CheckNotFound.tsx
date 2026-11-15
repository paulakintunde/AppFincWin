// 06.1-28 (D-05): "This check isn't here" for the new Decide routes (a deleted, foreign or invalid id). Moved out of the old
// check flow so plan 36 can delete that folder; the old copy keys stay until plan 37.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space, useScreenInsets } from '@/theme/layout';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/decide' as Href);
}

export function CheckNotFound(): React.JSX.Element {
  const t = useT();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  return (
    <View style={[styles.page, { backgroundColor: colors.canvas, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <EmptyState heading={t('decide.flow.notFound.heading')} body={t('decide.flow.notFound.body')} />
      <Pill variant="secondary" label={t('decide.flow.notFound.back')} onPress={leave} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.groupGap, paddingHorizontal: space.screenH },
});
