// REC-20, UI-SPEC 8: the notes under the entry toggles. Which notes show is the engine's
// entryNotes (at most two); this file only words them. The FX note is computed from the stored
// latest rates and never fetches (T-02.2-25-04); with no rate it is simply omitted.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { entryNotes } from '@/engine/activity';
import { convertMinor, crossRate, formatRate, minorUnits, resolveExponent } from '@/engine/money';
import { useFxLatest } from '@/data/queries/fxLatest';
import { latestPerEur } from '@/data/queries/homeAmount';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { RateAttribution } from '@/ui/RateAttribution';
import type { Direction, FormState } from './transactionForm';

export interface EntryNotesProps {
  direction: Direction;
  refund: boolean;
  status: FormState['status'];
  hasAccount: boolean;
  categoryLabel: string;
  accountName: string;
  /** The typed amount in minor units, or null while it does not parse. */
  amountMinor: number | null;
  currency: string;
  homeCurrency: string;
  /** The caller maps lead_figure === 'home' (plan 03). */
  autoConvert: boolean;
  /** Formats minor units of `code` for display. */
  formatMinor: (minor: number, code: string) => string;
  /** Minor-unit exponent of a code (custom currencies); defaults to the ISO table. */
  exponentFor?: (code: string) => number;
  /** Hidden when the caller already shows the stored rate attribution (editing a saved line). */
  showAttribution?: boolean;
}

export function EntryNotes(props: EntryNotesProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rates = useFxLatest().data ?? [];
  const foreign = props.currency !== '' && props.currency !== props.homeCurrency;
  const notes = entryNotes({
    direction: props.direction,
    refund: props.refund,
    foreign: foreign && props.direction !== 'transfer',
    autoConvert: props.autoConvert,
    hasAccount: props.hasAccount,
    status: props.status,
  });
  const style = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const exponentFor = props.exponentFor ?? resolveExponent;

  const origPerEur = latestPerEur(rates, props.currency);
  const homePerEur = latestPerEur(rates, props.homeCurrency);
  const rateRow = rates.find((r) => r.quote === props.currency) ?? rates.find((r) => r.quote === props.homeCurrency);

  const fxText = (kind: 'fxConverted' | 'fxKept'): string | null => {
    if (origPerEur === null || homePerEur === null) return null;
    const unit = `1 ${props.currency}`;
    const rate = `${formatRate(crossRate(origPerEur, homePerEur))} ${props.homeCurrency}`;
    if (kind === 'fxKept') return t('money.fxNote.kept', { code: props.currency, unit, rate });
    if (props.amountMinor === null) return null;
    try {
      const home = convertMinor(
        minorUnits(props.amountMinor),
        origPerEur,
        exponentFor(props.currency),
        homePerEur,
        exponentFor(props.homeCurrency)
      );
      return t('money.fxNote.converted', {
        home: props.formatMinor(home, props.homeCurrency),
        homeCode: props.homeCurrency,
        unit,
        rate,
        original: props.formatMinor(props.amountMinor, props.currency),
      });
    } catch {
      return null;
    }
  };

  const items: React.ReactNode[] = [];
  for (const note of notes) {
    if (note.kind === 'transfer') {
      items.push(
        <Text key="transfer" style={style}>
          {t('record.sheet.transferNote')}
        </Text>
      );
    } else if (note.kind === 'refund') {
      items.push(
        <Text key="refund" style={style}>
          {t('record.sheet.note.refund', { category: props.categoryLabel })}
        </Text>
      );
    } else if (note.kind === 'marking') {
      const amount = props.amountMinor === null ? null : props.formatMinor(props.amountMinor, props.currency);
      if (amount !== null) {
        items.push(
          <Text key="marking" style={style}>
            {t('record.sheet.note.marking', { account: props.accountName, amount })}
          </Text>
        );
      }
    } else {
      const text = fxText(note.kind);
      if (text !== null) {
        items.push(
          <View key="fx" style={styles.stack}>
            <Text style={style}>{text}</Text>
            {rateRow && props.showAttribution !== false ? (
              <RateAttribution rateDate={rateRow.rate_date} rateSource={rateRow.source} ratePending={false} />
            ) : null}
          </View>
        );
      }
    }
  }
  if (items.length === 0) return null;
  return <View style={styles.stack}>{items}</View>;
}

const styles = StyleSheet.create({
  stack: { gap: space.gapSm },
});
