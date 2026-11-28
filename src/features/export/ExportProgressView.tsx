/**
 * 10-review-2 (D-4, owner 2026-11-28): the export's progress, shared by the Export screen and "Save a copy" on the
 * delete-account screen. A bar plus the words: "Gathering your records · 5 of 14", then "Writing files". The bar speaks
 * the step count (accessibilityRole progressbar, value min/max/now); the words are never colour alone.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { ProgressBar } from '@/ui/ProgressBar';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { ExportProgress } from './csvExport';

export function ExportProgressView({ progress }: { progress: ExportProgress }): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  const writing = progress.phase === 'writing';
  const max = writing ? 1 : Math.max(1, progress.total);
  const now = writing ? 1 : progress.done;
  const line = writing
    ? t('system.ownData.exportProgress.writing')
    : t('system.ownData.exportProgress.gathering', { done: progress.done, total: progress.total });
  const spoken = writing
    ? t('system.ownData.exportProgress.writing')
    : t('system.ownData.exportProgress.gatheringA11y', { done: progress.done, total: progress.total });
  return (
    <View style={styles.column} testID="export-progress">
      <ProgressBar
        testID="export-progress-bar"
        percent={(now / max) * 100}
        animate={false}
        accessibilityLabel={spoken}
        accessibilityValue={{ min: 0, max, now }}
      />
      <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), color: colors.inkDim }} testID="export-progress-line">
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm },
});
