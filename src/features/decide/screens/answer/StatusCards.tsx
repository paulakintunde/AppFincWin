// 06.1-14 (APP-10, D-52): the offline, error and not-ready cards. One card look. The error card never says "not found" and shows
// no figure; the not-ready card lists what is missing and never reads like a verdict.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors } from '@/theme/tokens';
import { textRole } from '@/theme/typography';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import type { Line } from '../logic/sayResult';

function Card({ testID, children }: { testID: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: colors.surface }]}>
      {children}
    </View>
  );
}

export function OfflineCard({ date, onRetry }: { date: string; onRetry: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Card testID="answer-offline">
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.common.offline.title', { date })}</Text>
      <Pill variant="secondary" label={t('decide.screens.common.offline.retry')} onPress={onRetry} />
    </Card>
  );
}

export function ErrorCard({ item, onRetry }: { item: string; onRetry: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Card testID="answer-error">
      <StateGlyph name="sQuestion" color={stateColors.notYet.color} size={22} />
      <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.screens.common.error.title')}</Text>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.screens.common.error.message')}</Text>
      <Pill
        variant="primary"
        label={t('decide.screens.common.error.retry')}
        accessibilityLabel={t('decide.screens.common.error.retryA11y', { item })}
        onPress={onRetry}
      />
    </Card>
  );
}

export interface NotReadyCardProps {
  readiness: readonly Line[];
  onFinishSetup: () => void;
  onFromEstimates: () => void;
}

export function NotReadyCard({ readiness, onFinishSetup, onFromEstimates }: NotReadyCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Card testID="answer-not-ready">
      <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.screens.answer.notReady.title')}</Text>
      {readiness.map((line, i) => (
        <Text key={`${line.code}-${i}`} style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
          {line.text}
        </Text>
      ))}
      <Pill variant="primary" label={t('decide.screens.answer.notReady.finishSetup')} onPress={onFinishSetup} />
      <Pressable accessibilityRole="button" onPress={onFromEstimates} style={styles.link}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.answer.notReady.fromEstimates')}</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd, alignItems: 'flex-start' },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
