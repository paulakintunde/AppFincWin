/**
 * 05-14 Step 2, "Price and how you pay" (DCU-02). Presentational over StepProps: the price from the counted adjustment lines,
 * the payment methods side by side from computation.methodPlans, the selected method's panel, the not-a-lender footer (once)
 * and the costs that follow the purchase. No rate is ever supplied here; every credit term is the user's own.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { percent, salesTaxAmount } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { isValidRateText } from '../../snapshot/checkInputs';
import type { AdjustmentLine, CheckInputs, InputLine } from '../../snapshot/types';
import { CheckRow } from '../../ui/CheckRow';
import { LineEditorSheet, type LineEditorValue } from '../LineEditorSheet';
import { MethodPanels } from './step2/MethodPanels';
import type { Step2Props } from './step2/types';
import { PaymentMethods } from './step2/PaymentMethods';
import { Card, Eyebrow, Lock, Meta, moneyFn } from './stepUi';

export type { Step2Props };

const MAX_LINES = 30;

/** The shell's Next button: a price above zero and a payment method chosen. */
export function step2Complete(inputs: CheckInputs): boolean {
  return inputs.advertised !== null && inputs.advertised > 0 && inputs.method !== null;
}

function freshId(lines: readonly { id: string }[], prefix: string): string {
  const taken = new Set(lines.map((l) => l.id));
  let n = lines.length + 1;
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** A tax line follows the advertised price (as the engine does); every other line is its stored amount. */
function lineAmount(line: AdjustmentLine, advertised: number | null): number {
  if (line.taxPercentText !== null && isValidRateText(line.taxPercentText) && advertised !== null) {
    return salesTaxAmount(minorUnits(advertised), percent(line.taxPercentText));
  }
  return line.amount;
}

export function Step2PriceAndPay(props: Step2Props) {
  const { inputs, update, computation, source, whole, exact, goToStep, readOnly } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const [editor, setEditor] = useState<'adjust' | 'running' | null>(null);
  const latest = useRef(inputs);
  useEffect(() => {
    latest.current = inputs; // read by the local undo, which runs after later edits
  }, [inputs]);

  const invest = inputs.kind === 'invest';
  const currency = inputs.currency ?? source.currency;
  const wholeFmt = moneyFn(whole, source.currency);
  const exactFmt = moneyFn(exact, source.currency);
  const resolved = computation.resolvedPrice;
  const running = computation.running;

  const adjustmentName = (l: AdjustmentLine): string =>
    l.name !== '' ? l.name : l.taxPercentText !== null ? t('decide.price.salesTax') : l.note === 'fees' ? t('decide.price.fees') : t('decide.pay.unnamedLine');

  const removeWithUndo = <K extends 'adjustments' | 'runningCosts'>(key: K, line: CheckInputs[K][number], name: string) => {
    const list = inputs[key] as readonly { id: string }[];
    const index = list.findIndex((l) => l.id === line.id);
    update({ [key]: list.filter((l) => l.id !== line.id) } as Partial<CheckInputs>);
    showToast({
      kind: 'destructive',
      text: { key: 'decide.toast.lineRemoved', params: { name } },
      onUndo: () => {
        const now = latest.current[key] as readonly { id: string }[];
        if (now.some((l) => l.id === line.id)) return;
        const next = [...now];
        next.splice(Math.min(Math.max(index, 0), next.length), 0, line);
        update({ [key]: next } as Partial<CheckInputs>);
      },
    });
  };

  const saveAdjustment = (v: LineEditorValue) => {
    setEditor(null);
    const line: AdjustmentLine = {
      id: freshId(inputs.adjustments, 'adj-'), name: v.name, amount: v.amount, note: v.note, counted: true,
      effect: v.effect, onDay: v.onDay, taxPercentText: null,
    };
    update({ adjustments: [...inputs.adjustments, line] });
  };
  const saveRunning = (v: LineEditorValue) => {
    setEditor(null);
    const line: InputLine = {
      id: freshId(inputs.runningCosts, 'rc-'), name: v.name, amount: v.amount, note: v.note, counted: true, seriesId: null, category: null,
    };
    update({ runningCosts: [...inputs.runningCosts, line] });
  };

  const countedReplaces = inputs.replaces.filter((l) => l.counted);
  const linkStyle = { ...textRole(pairing, 'label'), color: colors.accent };

  return (
    <View style={styles.column}>
      <Lock locked={readOnly}>
        <Card>
          <View style={styles.head}>
            <Eyebrow>{invest ? t('decide.price.amount') : t('decide.price.advertised')}</Eyebrow>
            <Pressable accessibilityRole="button" accessibilityLabel={t('decide.price.edit')} onPress={() => goToStep(1)} style={styles.link}>
              <Text style={linkStyle}>{t('decide.price.edit')}</Text>
            </Pressable>
          </View>
          <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{wholeFmt(inputs.advertised ?? 0)}</Text>

          {inputs.adjustments.map((l) => {
            const amount = lineAmount(l, inputs.advertised);
            const tag = [l.onDay ? t('decide.price.onDayTag') : null, l.note !== '' && l.note !== 'fees' ? l.note : null].filter(Boolean).join(' · ');
            return (
              <CheckRow
                key={l.id}
                checked={l.counted}
                onToggle={() => update({ adjustments: inputs.adjustments.map((x) => (x.id === l.id ? { ...x, counted: !x.counted } : x)) })}
                name={adjustmentName(l)}
                source={tag === '' ? undefined : tag}
                amount={`${l.effect === 'takes_off' ? '−' : '+'}${exactFmt(amount)}`}
                onRemove={() => removeWithUndo('adjustments', l, adjustmentName(l))}
                removeA11yLabel={t('decide.lineEditor.removeA11y', { name: adjustmentName(l) })}
              />
            );
          })}
          <Pill label={t('decide.price.addAdjust')} variant="secondary" disabled={inputs.adjustments.length >= MAX_LINES} onPress={() => setEditor('adjust')} />

          <View style={[styles.final, { borderTopColor: colors.ink }]}>
            <View style={styles.finalText}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{invest ? t('decide.price.committed') : t('decide.price.final')}</Text>
              <Meta>{t('decide.price.counted', { counted: resolved?.countedLines ?? 0, total: resolved?.totalLines ?? inputs.adjustments.length })}</Meta>
            </View>
            <Text scale="capped" maxFontSizeMultiplier={1.3} style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
              {wholeFmt(resolved?.price ?? inputs.advertised ?? 0)}
            </Text>
          </View>
        </Card>
      </Lock>

      <Lock locked={readOnly}>
        <View style={styles.section}>
          <Eyebrow>{invest ? t('decide.pay.headInvest') : t('decide.pay.head')}</Eyebrow>
          <Meta tone="muted">{invest ? t('decide.pay.subInvest') : t('decide.pay.sub')}</Meta>
          <PaymentMethods {...props} />
          <MethodPanels {...props} />
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkFaint }}>{t('decide.flow.notLender')}</Text>
        </View>
      </Lock>

      <Lock locked={readOnly}>
        <Card>
          <View style={styles.head}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, flexShrink: 1 }}>{invest ? t('decide.costs.headInvest') : t('decide.costs.head')}</Text>
            <Meta>{t('decide.costs.aMonth')}</Meta>
          </View>
          <Meta>{invest ? t('decide.costs.bodyInvest') : t('decide.costs.body')}</Meta>
          {inputs.runningCosts.map((l) => {
            const name = l.name !== '' ? l.name : t('decide.pay.unnamedLine');
            return (
              <CheckRow
                key={l.id}
                checked={l.counted}
                onToggle={() => update({ runningCosts: inputs.runningCosts.map((x) => (x.id === l.id ? { ...x, counted: !x.counted } : x)) })}
                name={name}
                source={l.note === '' ? undefined : l.note}
                amount={exactFmt(l.amount)}
                onRemove={() => removeWithUndo('runningCosts', l, name)}
                removeA11yLabel={t('decide.lineEditor.removeA11y', { name })}
              />
            );
          })}
          {invest
            ? null
            : countedReplaces.map((l) => (
                <Lock key={`ends-${l.id}`} locked>
                  <CheckRow
                    checked
                    disabled
                    onToggle={() => undefined}
                    name={t('decide.costs.ends', { name: l.name })}
                    source={t('decide.costs.confirmed')}
                    amount={`−${exactFmt(l.amount)}`}
                    removeA11yLabel={t('decide.lineEditor.removeA11y', { name: l.name })}
                  />
                </Lock>
              ))}
          <Pill
            label={invest ? t('decide.costs.addFee') : t('decide.costs.add')}
            variant="secondary"
            disabled={inputs.runningCosts.length >= MAX_LINES}
            onPress={() => setEditor('running')}
          />
          <View style={[styles.final, { borderTopColor: colors.line1 }]}>
            <View style={styles.finalText}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('decide.costs.net')}</Text>
              <Meta>{t('decide.costs.math', { gross: exactFmt(running?.gross ?? 0), replaced: exactFmt(running?.replaced ?? 0) })}</Meta>
            </View>
            <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{exactFmt(running?.net ?? 0)}</Text>
          </View>
        </Card>
      </Lock>

      <LineEditorSheet
        visible={editor === 'adjust'}
        context="adjust"
        currency={currency}
        formatMoney={exactFmt}
        onSave={saveAdjustment}
        onCancel={() => setEditor(null)}
      />
      <LineEditorSheet
        visible={editor === 'running'}
        context={invest ? 'fee' : 'running'}
        currency={currency}
        formatMoney={exactFmt}
        onSave={saveRunning}
        onCancel={() => setEditor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.cardPad },
  section: { gap: space.gapSm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.gapMd },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
  final: { borderTopWidth: 1.5, paddingTop: space.gapMd, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.gapMd },
  finalText: { flexShrink: 1 },
});
