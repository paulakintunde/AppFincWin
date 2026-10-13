// D-08: the one-tap "Always use {category} for “{keyword}”?" offer shown under the Category row
// after a suggestion is corrected. Declarative copy; a rule is always Just me (D-29).
import React from 'react';
import { useT } from '@/i18n';
import { Pill } from '@/ui/Pill';
import { Actions, SuggestionCard, T } from '@/features/record/import/importUi';

export interface RuleOfferCardProps {
  categoryName: string;
  keyword: string;
  onAccept: () => void;
  onDismiss: () => void;
}

export function RuleOfferCard({ categoryName, keyword, onAccept, onDismiss }: RuleOfferCardProps) {
  const t = useT();
  const text = t('record.sheet.ruleOffer.text', { category: categoryName, keyword });
  return (
    <SuggestionCard accessibilityLabel={text}>
      <T>{text}</T>
      <Actions>
        <Pill label={t('record.sheet.ruleOffer.accept')} variant="secondary" onPress={onAccept} />
        <Pill label={t('record.sheet.ruleOffer.dismiss')} variant="secondary" onPress={onDismiss} />
      </Actions>
    </SuggestionCard>
  );
}
