/**
 * 05.3-33 (D-07, UI-SPEC "Question in place"): the unspent-money answer body. The 05.2 worked sum, "That's right" and
 * "Use my own figure" (a MoneyInput then "Save figure"). Both save through the 05.2 unspent anchor write in useUnspent
 * (unspent_anchor + unspent_anchor_at today), one undo step, toast "Unspent money confirmed". The question text and the
 * "and N more" line belong to the card, not here.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pill } from '@/ui/Pill';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { space } from '@/theme/layout';
import { hapticSelection } from '@/ui/haptics';
import { showToast } from '@/state/undoToast';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { UnspentSumCard } from '@/features/decide/setup/UnspentSumCard';
import { useUnspent } from '@/features/decide/setup/useUnspent';
import type { AskBodyProps } from '@/features/decide/v3/model/ask';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const within = (minor: number | null): number | null => (minor !== null && minor >= 0 && minor <= MAX_INPUT_MINOR ? minor : null);

export function UnspentBody({ onSaved }: AskBodyProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const model = useUnspent();
  const [ownOpen, setOwnOpen] = useState(false);
  const [own, setOwn] = useState<number | null>(null);

  const confirm = (figure: number): void => {
    hapticSelection();
    const result = model.confirm(figure);
    if (result !== null) showToast({ kind: 'ordinary', text: undoLabelText('unspentConfirmed', {}), stepId: result.stepId });
    onSaved(result?.stepId ?? null);
  };

  return (
    <View style={styles.column}>
      {model.lines !== null ? <UnspentSumCard lines={model.lines} currency={model.currency} /> : null}
      {ownOpen ? (
        <>
          <MoneyInput
            value={own}
            currency={model.currency}
            onChange={(m) => setOwn(within(m))}
            label={t('decide.unspentSheet.ownCaption')}
            accessibilityLabel={t('decide.unspentSheet.ownCaption')}
          />
          <Pill label={t('decide.v3.ui.ask.saveFigure')} variant="primary" disabled={own === null} onPress={() => own !== null && confirm(own)} />
        </>
      ) : (
        <>
          <Pill
            label={t('decide.v3.ui.ask.unspentRight')}
            variant="primary"
            disabled={model.sum === null}
            onPress={() => model.sum !== null && confirm(model.sum.total)}
          />
          <Pill
            label={t('decide.v3.ui.ask.unspentOwn')}
            variant="secondary"
            onPress={() => {
              hapticSelection();
              setOwnOpen(true);
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm },
});
