// 05.3-100 (UAT gap 21): the screen for a reopen copy that could not be saved. The original check is unchanged.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useT } from '@/i18n';
import { space, useScreenInsets } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { DECIDE_TAB_HREF } from './hrefs';

export function V3CopyNotSaved(): React.JSX.Element {
  const t = useT();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.canvas, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <EmptyState heading={t('decide.v3.ui.answer.copyNotSaved.heading')} body={t('decide.v3.ui.answer.copyNotSaved.body')} />
      <Pill variant="secondary" label={t('decide.v3.ui.answer.copyNotSaved.back')} onPress={() => router.replace(DECIDE_TAB_HREF)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.groupGap, paddingHorizontal: space.screenH },
});
