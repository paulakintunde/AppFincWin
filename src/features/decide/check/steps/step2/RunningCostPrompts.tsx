/**
 * 05-44 (D-33, D-44): the running-cost categories the engine returns for the item type, pre-listed under 'Costs that follow it'.
 * Every row starts unchecked with a blank amount; a row counts only once the user types an amount (04 D-55, 04 D-07), and no
 * prompt ships with a figure. Loss of value (04 D-63) is the user's own entry in `inputs.lossOfValue` (never an InputLine): a
 * segmented 'A month' | '% a year' and one blank field, always 'Not a monthly cash cost', shown but never in the month.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { RunningCostCategory } from '@/engine/decide';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { lossOfValueCopy, runningPromptCopy } from '../../../copy/depthInputsCopy';
import { MAX_INPUT_MINOR, isValidRateText } from '../../../snapshot/checkInputs';
import type { CheckInputs, InputLine, LossOfValueEntry } from '../../../snapshot/types';
import { CheckRow } from '../../../ui/CheckRow';
import { MoneyInput } from '../../../ui/MoneyInput';
import { RateInput } from '../../../ui/RateInput';
import { SegmentedToggle } from '../../../ui/SegmentedToggle';
import { refText } from '../../refText';
import { Meta, moneyFn } from '../stepUi';
import type { Step2Props } from './types';

type Translate = Parameters<typeof refText>[0];
type Props = Pick<Step2Props, 'inputs' | 'update' | 'computation' | 'source' | 'whole' | 'exact' | 'readOnly'>;

const LOSS: RunningCostCategory = 'loss_of_value';

/** The cash categories shown as prompt rows (loss of value has its own row). */
function cashPrompts(prompts: readonly RunningCostCategory[]): RunningCostCategory[] {
  return prompts.filter((c) => runningPromptCopy(c).entry === 'cash');
}

/** Ids of the lines a prompt row owns (the first line of each prompted category), so the plain list does not repeat them. */
export function promptedLineIds(inputs: CheckInputs, prompts: readonly RunningCostCategory[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const category of cashPrompts(prompts)) {
    const line = inputs.runningCosts.find((l) => l.category === category);
    if (line) ids.add(line.id);
  }
  return ids;
}

export function RunningCostPrompts(props: Props) {
  const { computation } = props;
  const prompts = computation.runningCostPrompts;
  if (prompts.length === 0) return null;
  return (
    <View style={styles.column}>
      {cashPrompts(prompts).map((category) => (
        <PromptRow key={category} category={category} {...props} />
      ))}
      {prompts.includes(LOSS) ? <LossOfValueRow {...props} /> : null}
    </View>
  );
}

function PromptRow({ category, inputs, update, source, exact, readOnly }: Props & { category: RunningCostCategory }) {
  const t = useT() as Translate;
  const exactFmt = moneyFn(exact, source.currency);
  const currency = inputs.currency ?? source.currency;
  const name = refText(t, runningPromptCopy(category).label);
  const line = inputs.runningCosts.find((l) => l.category === category) ?? null;
  const hasAmount = line !== null && line.amount > 0;

  const setAmount = (minor: number | null) => {
    const typed = minor !== null && minor > 0 && minor <= MAX_INPUT_MINOR ? minor : null;
    if (line === null) {
      if (typed === null) return;
      const taken = new Set(inputs.runningCosts.map((l) => l.id));
      let id = `prompt-${category}`;
      for (let n = 2; taken.has(id); n += 1) id = `prompt-${category}-${n}`;
      const added: InputLine = { id, name: '', amount: typed, note: '', counted: true, seriesId: null, category };
      update({ runningCosts: [...inputs.runningCosts, added] });
      return;
    }
    const next: InputLine = typed === null ? { ...line, amount: 0, counted: false } : { ...line, amount: typed, counted: true };
    update({ runningCosts: inputs.runningCosts.map((l) => (l.id === line.id ? next : l)) });
  };

  return (
    <View>
      <CheckRow
        checked={hasAmount && line.counted}
        disabled={!hasAmount || readOnly}
        onToggle={() => {
          if (line !== null) update({ runningCosts: inputs.runningCosts.map((l) => (l.id === line.id ? { ...l, counted: !l.counted } : l)) });
        }}
        name={name}
        source={hasAmount ? undefined : t('decide.depth.running.typeToCount')}
        amount={hasAmount ? exactFmt(line.amount) : ''}
        removeA11yLabel={t('decide.lineEditor.removeA11y', { name })}
      />
      <MoneyInput
        value={hasAmount ? line.amount : null}
        currency={currency}
        onChange={setAmount}
        label={t('decide.costs.aMonth')}
        accessibilityLabel={t('decide.depth.running.amountA11y', { name })}
        placeholder={t('decide.depth.running.addAmount')}
        readOnly={readOnly}
      />
    </View>
  );
}

function LossOfValueRow({ inputs, update, computation, source, whole, readOnly }: Props) {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const wholeFmt = moneyFn(whole, source.currency);
  const currency = inputs.currency ?? source.currency;
  const entry: LossOfValueEntry | null = inputs.lossOfValue;
  const [chosen, setChosen] = useState<'amount' | 'percent_per_year'>('amount');
  const mode = entry?.kind ?? chosen;
  const [percentText, setPercentText] = useState(entry?.kind === 'percent_per_year' ? entry.percentText : '');
  const copy = lossOfValueCopy(entry, computation.running?.nonCash ?? null, wholeFmt);
  const name = refText(t, runningPromptCopy(LOSS).label);

  const switchMode = (key: string) => {
    const next = key === 'percent_per_year' ? 'percent_per_year' : 'amount';
    if (next === mode) return;
    setChosen(next);
    setPercentText('');
    if (entry !== null) update({ lossOfValue: null }); // a mode change starts the field blank
  };

  const typePercent = (text: string) => {
    if (text !== '' && isValidRateText(text) && Number(text) > 100) return; // above 100% a year: ignored
    setPercentText(text);
    if (text === '') update({ lossOfValue: null });
    else if (isValidRateText(text)) update({ lossOfValue: { kind: 'percent_per_year', percentText: text } });
  };

  return (
    <View style={styles.loss}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>{name}</Text>
      <Meta>{refText(t, copy.note)}</Meta>
      <SegmentedToggle
        options={copy.modes.map((m, i) => ({ key: i === 0 ? 'amount' : 'percent_per_year', label: refText(t, m) }))}
        value={mode}
        onChange={readOnly ? () => undefined : switchMode}
        accessibilityLabel={t('decide.depth.running.lossModeA11y')}
      />
      {mode === 'amount' ? (
        <MoneyInput
          value={entry?.kind === 'amount' ? entry.monthly : null}
          currency={currency}
          onChange={(minor) =>
            update({ lossOfValue: minor !== null && minor > 0 && minor <= MAX_INPUT_MINOR ? { kind: 'amount', monthly: minor } : null })
          }
          label={t('decide.costs.aMonth')}
          accessibilityLabel={t('decide.depth.running.lossAmountA11y')}
          placeholder={refText(t, copy.placeholder)}
          readOnly={readOnly}
        />
      ) : (
        <RateInput
          value={percentText}
          onChange={typePercent}
          label={t('decide.depth.running.lossPercent')}
          accessibilityLabel={t('decide.depth.running.lossPercentA11y')}
          placeholder={refText(t, copy.placeholder)}
          readOnly={readOnly}
        />
      )}
      {copy.about ? <Meta tone="muted">{refText(t, copy.about)}</Meta> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd },
  loss: { gap: space.gapSm },
});
