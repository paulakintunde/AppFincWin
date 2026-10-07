// Format confirmation (D-41, D-42, D-53, REC-13): before any preview the reading is stated in
// plain words with one example row, with a flip. An ambiguous file shows the candidate readings,
// pre-selects none, and cannot move on until one is chosen (E-CR-04). The reading is never
// colour-coded: the sentence carries the meaning.
import React from 'react';
import { View } from 'react-native';
import type { FormatProfile } from '@/engine/statement';
import { useT } from '@/i18n';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { space } from '@/theme/layout';
import { formatSentenceKeys, renderSentence } from './formatSentence';
import { Actions, Heading, T, useDynamicT, useFormatAmount } from './importUi';
import type { useStatementImport } from './useStatementImport';

type ImportState = ReturnType<typeof useStatementImport>;

function sameReading(a: FormatProfile, b: FormatProfile): boolean {
  return a.positiveMeans === b.positiveMeans && a.balanceMeans === b.balanceMeans;
}

export function FormatStep({ state }: { state: ImportState }) {
  const t = useT();
  const fmt = useFormatAmount();
  const { profile, candidates, exampleRow, formatFigures } = state;
  const choosing = candidates.length > 0;
  const tx = useDynamicT();

  const candidateLabel = (c: FormatProfile): string => {
    const sign = c.positiveMeans === 'money-in' ? tx('importCsv.format.candidateIn') : tx('importCsv.format.candidateOut');
    const balance =
      c.balanceMeans === 'owed'
        ? tx('importCsv.format.candidateBalanceOwed')
        : c.balanceMeans === 'held'
          ? tx('importCsv.format.candidateBalanceHeld')
          : c.balanceMeans === 'available'
            ? tx('importCsv.format.balanceAvailable')
            : null;
    return balance === null ? sign : `${sign} · ${balance}`;
  };

  let sentence: string | null = null;
  if (!choosing && profile !== null) {
    const closing =
      formatFigures === null || formatFigures.closing === null
        ? null
        : fmt.amount(profile.balanceMeans === 'owed' ? Math.abs(formatFigures.closing) : formatFigures.closing, formatFigures.currency);
    const limit = formatFigures === null || formatFigures.limit === null ? null : fmt.amount(formatFigures.limit, formatFigures.currency);
    sentence = renderSentence(formatSentenceKeys(profile, { closing, limit, overLimit: formatFigures?.overLimit ?? false }), tx);
  }

  const flipMeaning = profile?.positiveMeans === 'money-in' ? tx('importCsv.format.meaningOut') : tx('importCsv.format.meaningIn');

  return (
    <View>
      <Heading>{t('importCsv.format.heading')}</Heading>

      {choosing ? (
        <View>
          <T>{t('importCsv.format.ambiguous')}</T>
          {candidates.map((c, i) => {
            const label = candidateLabel(c);
            const selected = profile !== null && sameReading(c, profile);
            return (
              <Row
                key={`${c.positiveMeans}-${c.balanceMeans}`}
                label={label}
                value={selected ? '✓' : undefined}
                accessibilityLabel={label}
                onPress={() => state.chooseCandidate(i)}
              />
            );
          })}
        </View>
      ) : sentence !== null ? (
        <View style={{ gap: space.gapMd }}>
          <T>{sentence}</T>
          {exampleRow !== null ? (
            <View>
              <T role="label" tone="inkMuted">
                {t('importCsv.format.exampleRow')}
              </T>
              <T numberOfLines={1}>{exampleRow.description}</T>
              <T role="label" tone="inkMuted">
                {[
                  exampleRow.localDate === null ? null : fmt.date(exampleRow.localDate),
                  exampleRow.amount === null ? null : fmt.amount(exampleRow.amount, exampleRow.currency),
                ]
                  .filter((p): p is string => p !== null)
                  .join(' · ')}
              </T>
            </View>
          ) : null}
          <Row
            label={t('importCsv.format.flip')}
            accessibilityLabel={t('importCsv.format.flipA11y', { meaning: flipMeaning })}
            onPress={state.flip}
          />
        </View>
      ) : null}

      <Actions>
        <Pill label={t('importCsv.format.confirm')} variant="secondary" disabled={profile === null} onPress={state.confirmFormat} />
        <Pill label={t('importCsv.cancel')} variant="secondary" onPress={state.cancel} />
      </Actions>
    </View>
  );
}
