/**
 * 06.1-85 (G-PD-2, ask, don't block): "What is the $X for: spare, an envelope or goal, set aside for a bill, or someone else's
 * money?" had no answer anywhere (the old in-check answer body went with the old Decide screens), so its Fix led nowhere. This sheet
 * answers it where it is asked: it names the amount and offers the four answers; one tap answers. The owner saves it through the
 * existing useSaveUnexplainedAnswer write (decide_settings unexplained_amount/use/at) with Undo; the engine reads it on the next run.
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

export type UnexplainedUse = 'spare' | 'envelope_or_goal' | 'set_aside_for_bill' | 'someone_elses';

const OPTIONS = [
  { use: 'spare', key: 'decide.screens.answer.unexplained.spare' },
  { use: 'envelope_or_goal', key: 'decide.screens.answer.unexplained.envelope' },
  { use: 'set_aside_for_bill', key: 'decide.screens.answer.unexplained.bill' },
  { use: 'someone_elses', key: 'decide.screens.answer.unexplained.someone' },
] as const satisfies readonly { readonly use: UnexplainedUse; readonly key: string }[];

export interface UnexplainedMoneySheetProps {
  /** The money asked about, already formatted; null keeps the sheet closed. */
  amount: string | null;
  onAnswer: (use: UnexplainedUse) => void;
  onDismiss: () => void;
}

export function UnexplainedMoneySheet({ amount, onAnswer, onDismiss }: UnexplainedMoneySheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  if (amount === null) return null;
  const title = t('decide.screens.answer.unexplained.title');
  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title}>
      <View testID="unexplained-sheet">
        <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      </View>
      <SheetScroll contentContainerStyle={styles.body}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.answer.unexplained.body', { amount })}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.screens.answer.unexplained.note')}</Text>
        <View style={styles.options} accessibilityRole="radiogroup">
          {OPTIONS.map((o) => (
            <Pill key={o.use} variant="secondary" label={t(o.key)} onPress={() => onAnswer(o.use)} />
          ))}
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap, paddingBottom: space.groupGap },
  options: { gap: space.gapMd, alignItems: 'flex-start' },
});
