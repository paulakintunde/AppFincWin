// After the commit (D-18, D-21): "Import finished" and one recurring suggestion per detected
// series, each answered with Make recurring or Not now. The import's own Undo lives on the toast
// the hook raises, and only for a real step id (review item 7); nothing here offers Undo.
// 06.2-23 (D-19, D-20): the finished step opens with the kit header: a 48 tile carrying the import-done icon, which
// plays once per commit (keyed on the commit's step id; a later mount in the session shows the still icon), then
// "Import done" and the count. The one Success haptic fires in the hook, beside the toast. Reduce Motion and a build
// without the Lottie view show the still icon (AnimatedIcon).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, step, tile } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { accentTintOver } from '@/ui/EmptyState';
import { IconTile } from '@/ui/icons/IconTile';
import { MilestoneIcon } from '@/ui/icons/MilestoneIcon';
import { useOncePerSession } from '@/ui/motion/useOncePerSession';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { Actions, SuggestionCard, T, useDynamicT, useFormatAmount } from './importUi';
import type { useStatementImport } from './useStatementImport';

type ImportState = ReturnType<typeof useStatementImport>;

export function SuggestionsStep({ state, onDone }: { state: ImportState; onDone: () => void }) {
  const t = useT();
  const tx = useDynamicT();
  const fmt = useFormatAmount();

  return (
    <View>
      <DoneHeader stepId={state.committedStepId} count={state.committedCount} />
      {state.suggestions.map((s) => (
        <SuggestionCard key={s.key}>
          <T>
            {t('importCsv.suggestion', {
              name: s.name,
              amount: fmt.amount(Math.abs(s.amount), s.currency),
              frequency: tx(`record.recurring.frequency.${s.freq}`),
            })}
          </T>
          <Actions>
            <Pill label={t('importCsv.suggestionAccept')} variant="secondary" onPress={() => state.acceptSuggestion(s.key)} />
            <Pill label={t('importCsv.suggestionDismiss')} variant="secondary" onPress={() => state.dismissSuggestion(s.key)} />
          </Actions>
        </SuggestionCard>
      ))}
      <Actions>
        <Pill label={t('importCsv.done')} variant="secondary" onPress={onDone} />
      </Actions>
    </View>
  );
}

/** The finished-import header: the import-done tile, the heading and the count, centred. */
function DoneHeader({ stepId, count }: { stepId: string | null; count: number }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const tint = accentTintOver(colors.fill1, colors.accent);
  // Plays once per commit: a return to this step in the same session shows the still icon.
  const play = useOncePerSession(`importDone:${stepId ?? 'none'}`) && stepId !== null;
  return (
    <View style={styles.header}>
      {play ? (
        <View
          testID="import-done-tile"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[styles.tile, { backgroundColor: tint }]}
        >
          <MilestoneIcon name="importDone" color={colors.accent} size={48} testID="import-done-icon" />
        </View>
      ) : (
        <IconTile icon="import" size={tile.big} color={colors.accent} tint={tint} testID="import-done-tile" />
      )}
      <Text accessibilityRole="header" style={[textRole(pairing, 'sheetTitle'), styles.centred, { color: colors.ink }]}>
        {t('appLife.importDone.heading')}
      </Text>
      <Text style={[textRole(pairing, 'body'), styles.centred, { color: colors.inkMuted }]}>{t('appLife.importDone.added', { count })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: step.tight, paddingBottom: step.card },
  tile: { width: tile.big, height: tile.big, borderRadius: radii.glyphTile, alignItems: 'center', justifyContent: 'center' },
  centred: { alignSelf: 'stretch', textAlign: 'center' },
});
