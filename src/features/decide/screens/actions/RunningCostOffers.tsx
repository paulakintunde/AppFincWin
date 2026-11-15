/**
 * 06.1-26 (APP-29, T-06.1-26-02): after "Add to records", each running cost is offered as a bill, one card at a time. A bill is
 * made only by that card's own tap (one series, one Undo through the toast); Skip adds nothing. Lines switched off are never offered.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { RunningCostLine } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';

/** useAddRunningCostBill's add, injected from the shell: the decide feature may not import the write path that reaches the fx fetch door. One call makes one series. */
export type AddRunningCostBill = (args: {
  line: RunningCostLine;
  itemName: string;
  categoryId: string | null;
  ownerId: string;
  ctx: { householdId: string; accountId: string; currency: string; timeZone: string; label: string; mint: () => string };
}) => string | null;

export interface RunningCostOffersProps {
  addBill: AddRunningCostBill;
  lines: readonly RunningCostLine[];
  itemName: string;
  categoryId: string | null;
  ownerId: string;
  householdId: string;
  accountId: string;
  currency: string;
  timeZone: string;
  formatMoney: (minor: number) => string;
  onDone: () => void;
}

const CADENCE = { 1: 'monthly', 3: 'quarterly', 12: 'yearly' } as const;

export function RunningCostOffers({ addBill, lines, itemName, categoryId, ownerId, householdId, accountId, currency, timeZone, formatMoney, onDone }: RunningCostOffersProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const offered = useMemo(() => lines.filter((l) => l.on && Number.isSafeInteger(l.amount) && l.amount > 0), [lines]);
  const [index, setIndex] = useState(0);
  if (offered.length === 0) return null;

  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  if (index >= offered.length) {
    return (
      <View testID="running-cost-done" style={styles.stack}>
        <Text style={body}>{t('decide.screens.answerActions.runningCost.done')}</Text>
        <Pill variant="primary" label={t('decide.screens.common.done')} onPress={onDone} />
      </View>
    );
  }

  const line = offered[index] as RunningCostLine;
  const costLabel = t('decide.screens.answerActions.runningCost.label');
  const billName = `${itemName.trim()} ${costLabel}`.trim();
  const cadence = t(`decide.screens.answerActions.runningCost.${CADENCE[line.everyMonths]}`);

  const add = (): void => {
    hapticLight();
    const stepId = addBill({ line, itemName, categoryId, ownerId, ctx: { householdId, accountId, currency, timeZone, label: costLabel, mint: () => Crypto.randomUUID() } });
    if (stepId !== null) showToast({ kind: 'ordinary', text: { key: 'decide.screens.answerActions.runningCost.addedToast', params: { name: billName } }, stepId });
    setIndex(index + 1);
  };

  return (
    <View testID="running-cost-offer" style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text accessibilityLiveRegion="polite" style={body}>
        {t('decide.screens.answerActions.runningCost.offer', { name: billName, amount: formatMoney(line.amount), cadence })}
      </Text>
      <Pill variant="primary" label={t('decide.screens.answerActions.runningCost.add')} onPress={add} />
      <Pill variant="secondary" label={t('decide.screens.answerActions.runningCost.skip')} onPress={() => setIndex(index + 1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.gapSm },
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
});
