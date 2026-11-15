// 06.1-27 (CO-D-64 (6), T-06.1-27-02): "See the check as it was". The stored Result of one history row, read only: the verdict card, the fact
// lines and the legal block, under "As checked on {date}". No action bar and no pay or date controls, so nothing here can write. A stored
// result this build cannot read shows one plain line, never a code or a half-built card.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { VERDICT_TABLE, type Result } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { FactLines } from '../answer/FactLines';
import { LegalBlock } from '../answer/LegalBlock';
import { VerdictCard } from '../answer/VerdictCard';
import { useSaid } from '../answer/useSaid';

/** The stored JSON as a Result, or null when its code is not one this build knows. */
export function readStoredResult(stored: Record<string, unknown>): Result | null {
  const code = stored['code'];
  if (typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(VERDICT_TABLE, code)) return null;
  const facts = stored['facts'];
  if (!Array.isArray(facts)) return null;
  return stored as unknown as Result;
}

export interface AsCheckedAnswerProps {
  stored: Record<string, unknown>;
  /** The date it was checked, already written. */
  dateText: string;
  currency: string;
  /** The check date the sentences read from. */
  today: string;
  country?: string | null;
  /** The check was paid once (cash). */
  once: boolean;
  onCantSee: () => void;
}

export function AsCheckedAnswer({ stored, dateText, currency, today, country = null, once, onCantSee }: AsCheckedAnswerProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const result = readStoredResult(stored);
  const lines = useSaid(result, { currency, today });
  const banner = (
    <Text testID="past-as-checked-banner" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
      {t('decide.screens.past.detail.asChecked', { date: dateText })}
    </Text>
  );
  if (result === null) {
    return (
      <View testID="past-as-checked" style={styles.stack}>
        {banner}
        <Text testID="past-as-checked-unreadable" style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
          {t('decide.screens.past.detail.asCheckedUnreadable')}
        </Text>
      </View>
    );
  }
  const once1 = once || result.facts.some((f) => f.code === 'short_plan_from_cash');
  return (
    <View testID="past-as-checked" style={styles.stack}>
      {banner}
      <VerdictCard code={result.code} variant={result.variant} once={once1} values={lines.verdictValues} lead={lines.afterBuy.lead?.text ?? null} boughtOn={lines.afterBuy.boughtOn?.text ?? null} />
      <FactLines facts={[...lines.facts, ...lines.missing]} country={country} />
      <LegalBlock basis={lines.basis} caveat={lines.caveat} caveatFigures={lines.caveatFigures} onCantSee={onCantSee} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.groupGap },
});
