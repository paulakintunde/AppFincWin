// The visible state while the server reads a PDF (D-03): a tinted indicator, a polite-announced
// line and, for PDF, the expected-wait helper. Built from existing tokens only.
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { T } from './importUi';
import type { ImportFormat } from './importPipeline';

export function ReadingProgress({ format }: { format: ImportFormat | null }) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View style={styles.box}>
      <ActivityIndicator color={colors.accent} accessibilityLabel={t('importCsv.reading.a11y')} />
      <View accessibilityLiveRegion="polite">
        <T>{t('importCsv.reading.primary')}</T>
      </View>
      {format === 'pdf' ? (
        <T role="label" tone="inkMuted">
          {t('importCsv.reading.helper')}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: space.gapMd, paddingVertical: space.groupGap },
});
