// 05.3: the screen for an invalid or unknown check id (T-05-30-01). Reuses the shipped decide.flow.notFound.* copy.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useT } from '@/i18n';
import { space, useScreenInsets } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { DECIDE_TAB_HREF } from './hrefs';

export function V3NotFound(): React.JSX.Element {
  const t = useT();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.canvas, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <EmptyState heading={t('decide.flow.notFound.heading')} body={t('decide.flow.notFound.body')} />
      <Pill variant="secondary" label={t('decide.flow.notFound.back')} onPress={() => router.replace(DECIDE_TAB_HREF)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.groupGap, paddingHorizontal: space.screenH },
});
