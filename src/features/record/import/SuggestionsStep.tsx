// After the commit (D-18, D-21): "Import finished" and one recurring suggestion per detected
// series, each answered with Make recurring or Not now. The import's own Undo lives on the toast
// the hook raises, and only for a real step id (review item 7); nothing here offers Undo.
import React from 'react';
import { View } from 'react-native';
import { useT } from '@/i18n';
import { Pill } from '@/ui/Pill';
import { Actions, Heading, SuggestionCard, T, useDynamicT, useFormatAmount } from './importUi';
import type { useStatementImport } from './useStatementImport';

type ImportState = ReturnType<typeof useStatementImport>;

export function SuggestionsStep({ state, onDone }: { state: ImportState; onDone: () => void }) {
  const t = useT();
  const tx = useDynamicT();
  const fmt = useFormatAmount();

  return (
    <View>
      <Heading>{t('importCsv.doneHeading')}</Heading>
      {state.suggestions.map((s) => (
        <SuggestionCard key={s.key}>
          <T>
            {t('importCsv.suggestion', {
              name: s.name,
              amount: fmt.amount(Math.abs(s.amount), s.currency),
              frequency: tx(`record.recurring.frequency.${s.freq}`),
            })}
          </T>
          <Actions>
            <Pill label={t('importCsv.suggestionAccept')} variant="secondary" onPress={() => state.acceptSuggestion(s.key)} />
            <Pill label={t('importCsv.suggestionDismiss')} variant="secondary" onPress={() => state.dismissSuggestion(s.key)} />
          </Actions>
        </SuggestionCard>
      ))}
      <Actions>
        <Pill label={t('importCsv.done')} variant="secondary" onPress={onDone} />
      </Actions>
    </View>
  );
}
