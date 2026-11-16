/**
 * 05.5-29 (owner decision 1, 2026-11-16): "Can you cover $X a month for N months, even in your low months?" had no screen that
 * could answer it, so its Fix led to the setup checklist. This sheet asks it where it is asked, with Yes and No; one tap answers.
 * The Answer saves it through useSaveDecideAnswer (kind volatile_cover) with Undo, and the engine judges again. Shaped like
 * UnexplainedMoneySheet (06.1-85).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';

export interface CoverQuestionSheetProps {
  /** The question line (the signed missing line's own text); null keeps the sheet closed. */
  question: string | null;
  onAnswer: (covers: boolean) => void;
  onDismiss: () => void;
}

export function CoverQuestionSheet({ question, onAnswer, onDismiss }: CoverQuestionSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  if (question === null) return null;
  const title = t('decide.screens.answer.cover.title');
  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title}>
      <View testID="cover-sheet">
        <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      </View>
      <SheetScroll contentContainerStyle={styles.body}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{question}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.screens.answer.cover.note')}</Text>
        <View style={styles.options} accessibilityRole="radiogroup">
          <View testID="cover-yes">
            <Pill variant="secondary" label={t('decide.screens.answer.cover.yes')} accessibilityLabel={t('decide.screens.answer.cover.yesA11y')} onPress={() => onAnswer(true)} />
          </View>
          <View testID="cover-no">
            <Pill variant="secondary" label={t('decide.screens.answer.cover.no')} accessibilityLabel={t('decide.screens.answer.cover.noA11y')} onPress={() => onAnswer(false)} />
          </View>
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap, paddingBottom: space.groupGap },
  options: { gap: space.gapMd, alignItems: 'flex-start' },
});
