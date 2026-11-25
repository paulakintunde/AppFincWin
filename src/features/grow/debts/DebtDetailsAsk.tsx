// 261123 (DD-05): the quiet ask on a debt row and the debt detail. It names exactly what is missing, offers "Add" (the edit
// sheet) and "Not now" (hidden for this debt on this device). It never blocks editing or saving ("Ask, don't block").
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { DebtRow } from '@/db/debts';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, space, step } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticTick } from '@/ui/haptics';
import { Text } from '@/ui/Text';
import { debtAskOf, dismissDebtAsk, useDismissedDebtAsks } from './debtAskStore';

export interface DebtDetailsAskProps {
  debt: DebtRow;
  userId: string | null;
  /** Opens the edit sheet; absent while writes are locked, so only "Not now" shows. */
  onAdd?: () => void;
}

export function DebtDetailsAsk({ debt, userId, onAdd }: DebtDetailsAskProps) {
  const t = useT() as unknown as (key: string, options?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const dismissed = useDismissedDebtAsks(userId);
  const ask = debtAskOf(debt);
  if (ask === null || userId === null || dismissed.has(debt.id)) return null;
  const label = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  return (
    <View testID={`debt-ask-${debt.id}`} style={styles.wrap}>
      <Text style={label}>{t(`grow.debts.ask.${ask}`)}</Text>
      <View style={styles.actions}>
        {onAdd === undefined ? null : (
          <Pressable
            testID={`debt-ask-add-${debt.id}`}
            accessibilityRole="button"
            accessibilityLabel={t('grow.debts.ask.addA11y', { name: debt.name })}
            onPress={() => {
              hapticTick();
              onAdd();
            }}
            style={({ pressed }) => [styles.action, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
          >
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('grow.debts.ask.add')}</Text>
          </Pressable>
        )}
        <Pressable
          testID={`debt-ask-not-now-${debt.id}`}
          accessibilityRole="button"
          accessibilityLabel={t('grow.debts.ask.notNowA11y', { name: debt.name })}
          onPress={() => {
            hapticTick();
            void dismissDebtAsk(userId, debt.id);
          }}
          style={({ pressed }) => [styles.action, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={label}>{t('grow.debts.ask.notNow')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: step.hair, paddingBottom: space.gapSm },
  actions: { flexDirection: 'row', gap: space.gapMd },
  action: { minHeight: space.touchMin, justifyContent: 'center' },
});
