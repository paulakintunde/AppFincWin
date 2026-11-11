// 06.1-14 (UX-01, UX-04): back, the item and price, "New check", the pay mode and the When chips. Callbacks only; no data is written here.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Text } from '@/ui/Text';

export type PayMode = 'cash' | 'plan';
export type WhenChoice = 'today' | 'payday' | 'date';

export interface AnswerTopBarProps {
  name: string;
  /** The price as written for the screen. */
  priceText: string;
  pay: PayMode;
  when: WhenChoice;
  /** The picked date as written, shown on the "Pick a date" chip once chosen. */
  dateText?: string | null;
  onBack: () => void;
  onNewCheck: () => void;
  onPay: (mode: PayMode) => void;
  onWhen: (when: WhenChoice) => void;
}

export function AnswerTopBar({ name, priceText, pay, when, dateText = null, onBack, onNewCheck, onPay, onWhen }: AnswerTopBarProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const whenOptions: { key: WhenChoice; label: string }[] = [
    { key: 'today', label: t('decide.screens.answer.frame.whenToday') },
    { key: 'payday', label: t('decide.screens.answer.frame.whenPayday') },
    { key: 'date', label: dateText ?? t('decide.screens.common.pickDate') },
  ];
  return (
    <View testID="answer-topbar" style={styles.wrap}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('decide.screens.common.a11y.back')} onPress={onBack} style={styles.target}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.common.back')}</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={onNewCheck} style={styles.target}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.common.newCheck')}</Text>
        </Pressable>
      </View>
      <View accessible accessibilityLabel={t('decide.screens.answer.frame.itemA11y', { name, price: priceText })}>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{name}</Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim, fontVariant: ['tabular-nums'] }}>{priceText}</Text>
      </View>
      <SegmentedControl
        accessibilityLabel={t('decide.screens.answer.frame.payTabs')}
        value={pay}
        onChange={(key) => onPay(key as PayMode)}
        options={[
          { key: 'cash', label: t('decide.screens.common.cash') },
          { key: 'plan', label: t('decide.screens.common.installments') },
        ]}
      />
      <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.answer.frame.whenGroup')} style={styles.chips}>
        {whenOptions.map((o) => {
          const selected = o.key === when;
          return (
            <Pressable
              key={o.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onWhen(o.key)}
              style={[styles.chip, { backgroundColor: selected ? colors.surface : colors.fill1, borderColor: selected ? colors.accent : 'transparent' }]}
            >
              <Text scale="capped" style={{ ...textRole(pairing, 'label'), color: selected ? colors.accent : colors.inkDim }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.gapMd },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  target: { minHeight: space.touchMin, minWidth: space.touchMin, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  chip: { minHeight: space.touchMin, paddingHorizontal: space.cardPad, borderRadius: 999, borderWidth: 2, justifyContent: 'center' },
});
