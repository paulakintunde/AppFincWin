// 06.1-14 (UX-01, UX-04): back, the item and price, "New check", the pay mode and the When chips. Callbacks only; no data is written here.
// 06.1-66 (CS-11, CB-8, CB-7): pay mode and When only with a verdict; the payday chip is a real short date or absent.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import type { DecideStage } from '@/engine/decide/v3';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { LINK_HIT_SLOP, usePressFeedback } from '@/ui/pressFeedback';
import { Text } from '@/ui/Text';

export type PayMode = 'cash' | 'plan';
export type WhenChoice = 'today' | 'payday' | 'date';

interface WhenOption {
  id: 'today' | 'payday' | 'picked' | 'pick';
  key: WhenChoice;
  label: string;
  a11y?: string;
  selected: boolean;
}

export interface AnswerTopBarProps {
  name: string;
  /** The price as written for the screen. */
  priceText: string;
  pay: PayMode;
  when: WhenChoice;
  /** The picked date as written (short date), shown as its own selected chip once chosen. */
  dateText?: string | null;
  /** 06.1-66 (CB-7, A-ANS-4): the next payday as a short date ("Nov 15"); null hides the payday chip. */
  paydayText?: string | null;
  /** 06.1-66 (CS-11, CB-8): How you pay and When show only with a verdict; Not ready, loading and error leave them out. */
  showControls?: boolean;
  /** 08.1-10 (DCU-10): the stage of this answer. 'first_read' and 'full' put the stage word before the scope; 'deeper' or null show the scope alone. */
  stage?: DecideStage | null;
  /** 08.1-10 (APP-22): "Just you" or "Household . Flat 4B"; null hides the sub-line (no scope known). */
  scopeLabel?: string | null;
  onBack: () => void;
  onNewCheck: () => void;
  onPay: (mode: PayMode) => void;
  onWhen: (when: WhenChoice) => void;
}

export function AnswerTopBar({ name, priceText, pay, when, dateText = null, paydayText = null, showControls = true, stage = null, scopeLabel = null, onBack, onNewCheck, onPay, onWhen }: AnswerTopBarProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  // 06.1-62 (CB-5 / CB-6): Back, New check and the When chips show a press at once; the two links reach 52 dp tall.
  const press = usePressFeedback('row');
  // 06.1-66 (CB-7, A-ANS-4): the payday chip is the real date or absent; a picked date is its own selected chip beside "Pick a date".
  const whenOptions: WhenOption[] = [
    { id: 'today', key: 'today', label: t('decide.screens.answer.frame.whenToday'), selected: when === 'today' },
    ...(paydayText === null
      ? []
      : [{ id: 'payday', key: 'payday', label: paydayText, a11y: t('decide.screens.answer.frame.whenPaydayA11y', { date: paydayText }), selected: when === 'payday' } satisfies WhenOption]),
    ...(when === 'date' && dateText !== null ? [{ id: 'picked', key: 'date', label: dateText, selected: true } satisfies WhenOption] : []),
    { id: 'pick', key: 'date', label: t('decide.screens.common.pickDate'), selected: false },
  ];
  // 08.1-10: "{stage} . {scope}" below three full months, the scope alone from three (owner answer 2). It wraps; no line limit.
  const stageWord = stage === 'first_read' || stage === 'full' ? t(`decide.screens.stage.word.${stage}` as never) : null;
  const subLine =
    scopeLabel === null ? stageWord : stageWord === null ? scopeLabel : t('decide.screens.answer.scope.withStage', { stage: stageWord, scope: scopeLabel });
  const itemLabel =
    subLine === null ? t('decide.screens.answer.frame.itemA11y', { name, price: priceText }) : t('decide.screens.answer.frame.itemA11yScope', { name, price: priceText, sub: subLine });
  return (
    <View testID="answer-topbar" style={styles.wrap}>
      <View style={styles.row}>
        <Pressable testID="answer-back" accessibilityRole="button" accessibilityLabel={t('decide.screens.common.a11y.back')} onPress={onBack} hitSlop={LINK_HIT_SLOP} android_ripple={press.android_ripple} style={({ pressed }) => [styles.target, press.pressedStyle(pressed)]}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.common.back')}</Text>
        </Pressable>
        <Pressable testID="answer-new-check" accessibilityRole="link" onPress={onNewCheck} hitSlop={LINK_HIT_SLOP} android_ripple={press.android_ripple} style={({ pressed }) => [styles.target, press.pressedStyle(pressed)]}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.common.newCheck')}</Text>
        </Pressable>
      </View>
      <View accessible accessibilityLabel={itemLabel}>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{name}</Text>
        {subLine === null ? null : (
          <Text testID="answer-subline" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
            {subLine}
          </Text>
        )}
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim, fontVariant: ['tabular-nums'] }}>{priceText}</Text>
      </View>
      {showControls ? (
        <>
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
            {whenOptions.map((o) => (
              <Pressable
                key={o.id}
                testID={`answer-when-${o.id}`}
                accessibilityRole="radio"
                accessibilityLabel={o.a11y}
                accessibilityState={{ checked: o.selected }}
                onPress={() => onWhen(o.key)}
                android_ripple={press.android_ripple}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: o.selected ? colors.surface : colors.fill1, borderColor: o.selected ? colors.accent : 'transparent' },
                  press.pressedStyle(pressed),
                ]}
              >
                <Text scale="capped" style={{ ...textRole(pairing, 'label'), color: o.selected ? colors.accent : colors.inkDim }}>
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.gapMd },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  target: { minHeight: space.touchMin, minWidth: space.touchMin, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  chip: { minHeight: space.touchMin, paddingHorizontal: space.cardPad, borderRadius: 999, borderWidth: 2, justifyContent: 'center', overflow: 'hidden' },
});
