// 06.1-14 (APP-10, D-52): the offline, error and not-ready cards. One card look. The error card never says "not found" and shows
// no figure; the not-ready card lists what is missing and never reads like a verdict. 06.1-44: the not-ready card names each item.
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
import type { ReadinessFixRow } from '../logic/readinessFixes';
import { ReadinessFixList, type ReadinessFixListProps } from './ReadinessFixList';

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

export interface NotReadyCardProps extends Omit<ReadinessFixListProps, 'rows'> {
  /** 06.1-44 (C-2): the named readiness items with their fixes and answers (readinessFixRows). */
  rows: readonly ReadinessFixRow[];
  /** D-57 (C-1): quick estimates count only while the records hold no earlier month (estimatesCanAnswer). */
  canUseEstimates: boolean;
  onFinishSetup: () => void;
  onFromEstimates: () => void;
}

/**
 * 06.1-44 (G-1, C-1, C-2, A-ANS-3): one short lead line, then each named item with its fix and answers. Quick estimates are the
 * primary only when they can count (a person with no earlier month); otherwise "Finish setup" is the primary and the card carries no
 * quick-estimates control at all, so a person with records is never sent round the loop again (F-1).
 */
export function NotReadyCard({ rows, canUseEstimates, onFinishSetup, onFromEstimates, ...list }: NotReadyCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const title = rows.length === 0 ? t('decide.screens.answer.notReady.title') : t('decide.screens.answer.notReady.title', { count: rows.length });
  return (
    <Card testID="answer-not-ready">
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {title}
      </Text>
      {rows.length > 0 ? <ReadinessFixList rows={rows} {...list} /> : null}
      {canUseEstimates ? (
        <>
          <Pill variant="primary" label={t('decide.screens.answer.notReady.fromEstimates')} onPress={onFromEstimates} />
          <Pressable testID="answer-not-ready-finish" accessibilityRole="link" onPress={onFinishSetup} style={styles.link}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.answer.notReady.finishSetup')}</Text>
          </Pressable>
        </>
      ) : (
        <Pill variant="primary" label={t('decide.screens.answer.notReady.finishSetup')} onPress={onFinishSetup} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd, alignItems: 'flex-start' },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
});
