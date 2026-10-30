/**
 * 05.3-32 (D-48, D-59, T-05.3-32-01): the low-month cover question. Yes / No is stored as the user's own answer; the note
 * says it is not checked against their records (the engine marks the result as resting on this answer).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { useT } from '@/i18n';
import { useSaveDecideAnswer } from '@/data/mutations/decideAnswers';
import type { AskBodyProps } from '@/features/decide/v3/model/ask';
import { hapticSelection } from '@/ui/haptics';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';

export function VolatileCoverBody({ checkId, userId, householdId, onSaved }: AskBodyProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  const saver = useSaveDecideAnswer(userId, householdId);
  const answer = (covers: boolean): void => {
    hapticSelection();
    const result = saver.save({ kind: 'volatile_cover', checkId, covers });
    onSaved(result === null ? null : result.stepId);
  };
  return (
    <View style={styles.column}>
      <Pill label={t('decide.v3.ui.ask.coverYes')} variant="secondary" onPress={() => answer(true)} />
      <Pill label={t('decide.v3.ui.ask.coverNo')} variant="secondary" onPress={() => answer(false)} />
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('decide.v3.ui.ask.coverNote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm },
});
