/**
 * 05-14 Step 1, "The item" (DCU-02, DCU-08). Presentational over StepProps: every edit is one `update(patch)` of JSON values
 * and the flow shell (05-30) owns state, autosave and navigation. The item type is pre-filled from the name as a suggestion
 * only, and a need-by date can never be before today.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ITEM_TYPES, suggestItemType } from '@/engine/decide';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Dropdown } from '@/ui/Dropdown';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { DateField } from '@/features/record/entry/pickers/DateField';
import { ITEM_TYPE_LABEL } from '../../copy/codeMaps';
import { OFFSETS, awayFrom, isPastDate, offsetDate } from '../../offsets';
import { MAX_INPUT_MINOR, withItemType } from '../../snapshot/checkInputs';
import type { CheckInputs, InputLine } from '../../snapshot/types';
import { MoneyInput } from '../../ui/MoneyInput';
import { CheckRow } from '../../ui/CheckRow';
import { useShouldStack } from '../../ui/textFit';
import { useInfoSheet } from '../../ui/useInfoSheet';
import { InfoTitle } from '../InfoTitle';
import { LineEditorSheet, type LineEditorValue, type RecurringBillOption } from '../LineEditorSheet';
import type { StepProps } from '../stepTypes';
import { Box, Card, Label, Lock, Meta, moneyFn } from './stepUi';
import { IncomeChangeCard } from './step1/IncomeChangeCard';

export interface Step1Props extends StepProps {
  /** Live outflow series, monthly-equivalent home amounts, for "From your recurring bills". */
  recurringBills: readonly { id: string; name: string; monthly: number }[];
}

const NAME_MAX = 80;
const WHY_MAX = 500;
const MAX_LINES = 30;

/** The shell's Next button: a price above zero and a need-by date that is empty or not yet passed. */
export function step1Complete(inputs: CheckInputs, today: string): boolean {
  return inputs.advertised !== null && inputs.advertised > 0 && (inputs.needBy === null || !isPastDate(inputs.needBy, today));
}

function freshId(lines: readonly InputLine[], prefix: string): string {
  const taken = new Set(lines.map((l) => l.id));
  let n = lines.length + 1;
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/**
 * D-76 / R6 rule C: a row of flex chips that stack full width under rule S. Each chip sits in a column wrapper so it
 * stretches; names wrap at words and nothing is clipped.
 */
function ChipRow({ children }: { children: React.ReactNode }) {
  const stacked = useShouldStack();
  return (
    <View accessibilityRole="radiogroup" style={styles.chips}>
      {React.Children.map(children, (child) => (
        <View style={stacked ? styles.chipFull : styles.chipFlex}>{child}</View>
      ))}
    </View>
  );
}

export function Step1Item(props: Step1Props) {
  const { inputs, update, source, exact, today, readOnly, recurringBills } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const [adding, setAdding] = useState(false);
  const replacesInfo = useInfoSheet('replaces');
  const latest = useRef(inputs);
  useEffect(() => {
    latest.current = inputs; // read by the local undo, which runs after later edits
  }, [inputs]);

  const invest = inputs.kind === 'invest';
  const currency = inputs.currency ?? source.currency;
  const exactFmt = moneyFn(exact, source.currency);
  const stale = inputs.needBy !== null && isPastDate(inputs.needBy, today);

  const setName = (name: string) => {
    const suggested = suggestItemType(name);
    const follow = !invest && !inputs.itemTypeTouched && suggested !== inputs.itemType;
    update({ name, ...(follow ? withItemType(inputs, suggested, false) : {}) });
  };
  const setPrice = (minor: number | null) => update({ advertised: minor !== null && minor > MAX_INPUT_MINOR ? null : minor });
  const setKind = (kind: 'buy' | 'invest') => {
    if (kind !== inputs.kind) update({ kind, method: null });
  };

  const away = inputs.needBy === null ? null : awayFrom(today, inputs.needBy);
  const awayText =
    away === null
      ? null
      : away.key === 'today'
        ? t('decide.item.awayToday')
        : away.key === 'tomorrow'
          ? t('decide.item.awayTomorrow')
          : away.key === 'days'
            ? t('decide.item.awayDays', { count: away.count })
            : t('decide.item.awayMonths', { count: away.count });

  const replacedSum = inputs.replaces.filter((l) => l.counted).reduce((sum, l) => sum + l.amount, 0);

  const toggleReplace = (id: string) =>
    update({ replaces: inputs.replaces.map((l) => (l.id === id ? { ...l, counted: !l.counted } : l)) });

  const removeReplace = (line: InputLine) => {
    if (readOnly) return; // WR-C06: no "Line removed" toast for a removal a decided check never makes
    const index = inputs.replaces.findIndex((l) => l.id === line.id);
    update({ replaces: inputs.replaces.filter((l) => l.id !== line.id) });
    showToast({
      kind: 'destructive',
      text: { key: 'decide.toast.lineRemoved', params: { name: line.name || t('decide.pay.unnamedLine') } },
      onUndo: () => {
        const now = latest.current.replaces;
        if (now.some((l) => l.id === line.id)) return;
        const next = [...now];
        next.splice(Math.min(Math.max(index, 0), next.length), 0, line);
        update({ replaces: next });
      },
    });
  };

  const addReplace = (v: LineEditorValue) => {
    setAdding(false);
    // CR-C02: a recurring bill is replaced once; a second line naming the same series is refused.
    if (v.seriesId !== null && inputs.replaces.some((l) => l.seriesId === v.seriesId)) return;
    const line: InputLine = {
      id: freshId(inputs.replaces, 'rp-'), name: v.name, amount: v.amount, note: v.note, counted: true, seriesId: v.seriesId, category: null,
    };
    update({ replaces: [...inputs.replaces, line] });
  };

  // CR-C02: a bill already in the list is not offered again.
  const bills: RecurringBillOption[] = recurringBills
    .filter((b) => !inputs.replaces.some((l) => l.seriesId === b.id))
    .map((b) => ({ id: b.id, name: b.name, monthly: b.monthly }));

  return (
    <View style={styles.column}>
      <Lock locked={readOnly}>
        <Card>
          <ChipRow>
            <Chip label={t('decide.item.purchase')} selected={!invest} onPress={() => setKind('buy')} />
            <Chip label={t('decide.item.investment')} selected={invest} onPress={() => setKind('invest')} />
          </ChipRow>

          <Label>{invest ? t('decide.item.whatInvest') : t('decide.item.what')}</Label>
          <Box
            role="sheetTitle"
            value={inputs.name}
            onChangeText={setName}
            accessibilityLabel={invest ? t('decide.item.whatInvest') : t('decide.item.what')}
            maxLength={NAME_MAX}
            readOnly={readOnly}
          />

          <MoneyInput
            large
            value={inputs.advertised}
            currency={currency}
            onChange={setPrice}
            label={invest ? t('decide.item.amountMonthly') : t('decide.item.price')}
            accessibilityLabel={invest ? t('decide.item.amountMonthly') : t('decide.item.price')}
          />

          <Box
            value={inputs.source}
            onChangeText={(source_) => update({ source: source_ })}
            accessibilityLabel={invest ? t('decide.item.sourceInvest') : t('decide.item.source')}
            placeholder={invest ? t('decide.item.sourceInvest') : t('decide.item.source')}
            maxLength={NAME_MAX}
            readOnly={readOnly}
          />

          {invest ? null : (
            <View>
              <Dropdown
                variant="row"
                rowLabel={t('decide.item.type')}
                title={t('decide.item.type')}
                triggerA11yLabel={`${t('decide.item.type')}, ${t(ITEM_TYPE_LABEL[inputs.itemType])}`}
                value={inputs.itemType}
                disabled={readOnly}
                options={ITEM_TYPES.map((key) => ({ key, label: t(ITEM_TYPE_LABEL[key]) }))}
                onSelect={(key) => update(withItemType(inputs, key, true))}
              />
              {inputs.itemTypeTouched ? null : <Meta>{t('decide.item.suggested')}</Meta>}
            </View>
          )}
        </Card>
      </Lock>

      <Lock locked={readOnly}>
        <Card>
          <Label>{invest ? t('decide.item.whenInvest') : t('decide.item.when')}</Label>
          <ChipRow>
            {OFFSETS.map((o) => (
              <Chip
                key={o.key}
                label={t(`decide.item.${o.key}`)}
                selected={inputs.needBy === offsetDate(today, o.key)}
                onPress={() => update({ needBy: offsetDate(today, o.key) })}
              />
            ))}
          </ChipRow>
          <DateField
            label={invest ? t('decide.item.whenInvest') : t('decide.item.when')}
            value={inputs.needBy ?? today}
            display={inputs.needBy === null ? '' : exact.formatDate(inputs.needBy, 'long')}
            minDate={today}
            onChange={(needBy) => update({ needBy })}
          />
          {stale ? (
            <Text style={{ ...textRole(pairing, 'label'), color: colors.danger }}>{t('decide.item.passed')}</Text>
          ) : awayText !== null ? (
            <Meta>{awayText}</Meta>
          ) : null}

          <Label>{t('decide.item.why')}</Label>
          <Box
            multiline
            value={inputs.why}
            onChangeText={(why) => update({ why })}
            accessibilityLabel={t('decide.item.why')}
            placeholder={t('decide.item.whyPlaceholder')}
            maxLength={WHY_MAX}
            readOnly={readOnly}
          />
          <Meta>{t('decide.item.whyNote')}</Meta>
        </Card>
      </Lock>

      {invest ? null : <IncomeChangeCard inputs={inputs} update={update} today={today} readOnly={readOnly} source={source} exact={exact} />}

      {invest ? null : (
        <Lock locked={readOnly}>
          <Card>
            <View style={styles.head}>
              <InfoTitle info={replacesInfo} lineHeight={textRole(pairing, 'label').lineHeight}>
                <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.item.replacesHeading')}</Text>
              </InfoTitle>
              <Meta tone="accent">{replacedSum > 0 ? t('decide.item.replacesSum', { amount: exactFmt(replacedSum) }) : t('decide.item.replacesNone')}</Meta>
            </View>
            <Meta>{t('decide.item.replacesBody')}</Meta>
            {inputs.replaces.map((line) => (
              <CheckRow
                key={line.id}
                checked={line.counted}
                onToggle={() => toggleReplace(line.id)}
                name={line.name || t('decide.pay.unnamedLine')}
                source={line.note || undefined}
                amount={exactFmt(line.amount)}
                onRemove={() => removeReplace(line)}
                removeA11yLabel={t('decide.lineEditor.removeA11y', { name: line.name })}
              />
            ))}
            <Pill
              label={t('decide.item.replacesAdd')}
              variant="secondary"
              disabled={inputs.replaces.length >= MAX_LINES}
              onPress={() => setAdding(true)}
            />
          </Card>
        </Lock>
      )}

      <LineEditorSheet
        visible={adding}
        context="replaces"
        currency={currency}
        recurringBills={bills}
        formatMoney={exactFmt}
        onSave={addReplace}
        onCancel={() => setAdding(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.cardPad },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  chipFlex: { flex: 1 },
  chipFull: { width: '100%' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.gapMd },
});
