/**
 * 06.1-26 (D-27, D64): "How much a month?" A radio group of monthly amounts, each with the month it is reached. The amount applies
 * only on the primary button; the sheet writes nothing.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';

export interface SaveAmountOption {
  /** Minor units a month. */
  monthly: number;
  /** The month it is reached, already written for the screen; null when no date is known. */
  readyText: string | null;
}

export interface SaveAmountSheetProps {
  visible: boolean;
  options: readonly SaveAmountOption[];
  current: number;
  formatMoney: (minor: number) => string;
  onUse: (monthly: number) => void;
  onDismiss: () => void;
}

export function SaveAmountSheet(props: SaveAmountSheetProps) {
  return props.visible ? <SaveAmountForm {...props} /> : null;
}

function SaveAmountForm({ options, current, formatMoney, onUse, onDismiss }: SaveAmountSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [picked, setPicked] = useState(current);
  const title = t('decide.screens.answerActions.amount.title');
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  return (
    <Sheet visible onDismiss={onDismiss} accessibilityLabel={title} dirty={picked !== current}>
      <SheetHeader title={title} cancelLabel={t('decide.screens.common.cancel')} onCancel={onDismiss} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={small}>{t('decide.screens.answerActions.amount.sub')}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={title} style={styles.column}>
          {options.map((o) => {
            const money = formatMoney(o.monthly);
            const a11y =
              o.readyText === null
                ? t('decide.screens.answerActions.goal.monthly', { monthly: money })
                : t('decide.screens.answerActions.amount.optionA11y', { amount: money, readyMonth: o.readyText });
            const selected = picked === o.monthly;
            return (
              <Pressable key={o.monthly} accessibilityRole="radio" accessibilityLabel={a11y} accessibilityState={{ selected }} onPress={() => setPicked(o.monthly)} style={styles.radio}>
                <RadioDot selected={selected} />
                <View style={styles.grow}>
                  <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.answerActions.goal.monthly', { monthly: money })}</Text>
                  {o.readyText === null ? null : <Text style={small}>{t('decide.screens.answerActions.amount.reached', { readyMonth: o.readyText })}</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Pill label={t('decide.screens.answerActions.amount.useAmount', { amount: formatMoney(picked) })} variant="primary" onPress={() => onUse(picked)} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  radio: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  grow: { flex: 1 },
});
