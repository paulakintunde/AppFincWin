/**
 * Plan 05.2-28 (DSU-10): "Your unspent money", the last step of Your money now and a needed one. The worked sum comes
 * from the engine (UnspentSumCard). The user either says "That's right" (the sum becomes the anchor) or types their own
 * figure (signed figures are allowed); neither is chosen at the start. Saving writes unspent_anchor and
 * unspent_anchor_at (today) through plan 13's useSaveSetupStep. The shell draws the title.
 */
import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { View } from 'react-native';
import { space } from '@/theme/layout';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { SegmentedToggle } from '@/features/decide/ui/SegmentedToggle';
import { Intro, Meta, NEEDED_REASON_KEY, useCopy, useReportReady } from '@/features/income/steps/shared';
import { UnspentSumCard } from '../UnspentSumCard';
import { useUnspent } from '../useUnspent';
import { setupSheetActions } from './setupSheetHost';
import type { SetupStepBodyProps, SetupStepHandle } from './types';

type Choice = 'right' | 'own';

const within = (minor: number | null): number | null => (minor !== null && Math.abs(minor) <= MAX_INPUT_MINOR ? minor : null);

export const UnspentStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function UnspentStep({ onReadyChange }, ref) {
  const t = useCopy();
  const model = useUnspent();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [own, setOwn] = useState<number | null>(null);

  const figure = !model.ready ? null : choice === 'right' ? (model.sum?.total ?? null) : choice === 'own' ? own : null;
  const canContinue = figure !== null;
  useReportReady(onReadyChange, canContinue, canContinue ? null : NEEDED_REASON_KEY, canContinue);

  useImperativeHandle(ref, () => ({
    save() {
      if (figure === null) return { stepId: null };
      const result = model.confirm(figure);
      return { stepId: result?.stepId ?? null };
    },
  }));

  return (
    <View style={{ gap: space.groupGap }}>
      <Intro textKey="decide.setup.unspent.intro" />
      {model.lines !== null ? (
        <UnspentSumCard lines={model.lines} currency={model.currency} onSetThem={() => setupSheetActions().editAccountUse()} />
      ) : null}
      <SegmentedToggle
        options={[
          { key: 'right', label: t('decide.setup.unspent.thatsRight') },
          { key: 'own', label: t('decide.setup.unspent.ownFigure') },
        ]}
        value={choice ?? ''}
        onChange={(k) => setChoice(k === 'own' ? 'own' : 'right')}
        accessibilityLabel={t('decide.setup.unspent.intro')}
      />
      {choice === 'own' ? (
        <MoneyInput
          value={own}
          currency={model.currency}
          onChange={(m) => setOwn(within(m))}
          label={t('decide.setup.unspent.ownCaption')}
          accessibilityLabel={t('decide.setup.unspent.ownCaption')}
        />
      ) : null}
      <Meta text={t('decide.setup.unspent.recheck')} />
    </View>
  );
});
