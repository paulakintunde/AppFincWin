/**
 * 05-14 / 05-84 Step 2: "How you pay" as an accordion of method cards (D-79, R15.1). Each method is resolved on its own
 * (computation.methodPlans, 04 D-37); a method that cannot be scored says what it needs. Opening a card selects that method
 * and folds the one that was open; the open card holds that method's inputs and its outputs. No rate is ever pre-filled, and
 * a figure the engine could not work out reads in words ("Endless", "Not within 50 years"), never as a number or a dash.
 */
import React, { useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import type { PlanReason, PlanResult } from '@/engine/decide';
import { useT } from '@/i18n';
import { hapticSelection } from '@/ui/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { METHOD_LABEL } from '../../../copy/codeMaps';
import type { InfoDynamic, InfoKey } from '../../../copy/infoTerms';
import { joinPreview } from '../../../copy/foldCopy';
import { methodSummary, needsFields } from '../../../copy/methodCardCopy';
import type { CopyRef } from '../../../copy/types';
import { effectiveMethod } from '../../../snapshot/checkInputs';
import { PAY_METHODS } from '../../../snapshot/types';
import type { MethodKey } from '../../../snapshot/types';
import { useInfoSheet } from '../../../ui/useInfoSheet';
import { InfoTitle } from '../../InfoTitle';
import type { Translate } from '../../refText';
import type { Step2Props } from './types';
import { Eyebrow, Meta, moneyFn } from '../stepUi';
import { MethodBody } from './MethodPanels';
import { MethodCard } from './MethodCard';

const INVEST_METHODS = ['lump', 'monthly'] as const satisfies readonly MethodKey[];

const METHOD_INFO = {
  cash: 'paidInFull',
  loan: 'depositAndLoan',
  instalment: 'instalmentPlan',
  card: 'onCard',
  lump: 'lumpSum',
  monthly: 'monthlyContribution',
} as const satisfies Record<MethodKey, InfoKey>;

/** The engine flags that stay as chips: "Not accepted", "Part on the card", "Below the price" (the Needs line replaces the old rate flag). */
function chipsFor(result: PlanResult | undefined, t: ReturnType<typeof useT>): string[] {
  if (result === undefined) return [];
  if (result.status === 'resolved') {
    return result.plan.card !== null && result.plan.card.remainderOnDay > 0 ? [t('decide.pay.flagPartOnCard')] : [];
  }
  const out: string[] = [];
  if (result.reasons.includes('card_not_accepted')) out.push(t('decide.pay.flagNotAccepted'));
  if (result.reasons.includes('instalment_total_below_price')) out.push(t('decide.pay.flagBelowPrice'));
  return out;
}

export function PaymentMethods(props: Step2Props) {
  const { inputs, update, computation, source, whole, exact, goToStep, readOnly } = props;
  const t = useT();
  const { pairing } = useTheme();
  const invest = inputs.kind === 'invest';
  const howInfo = useInfoSheet('howYouPay');
  const wholeFmt = moneyFn(whole, source.currency);
  const exactFmt = moneyFn(exact, source.currency);
  const methods: readonly MethodKey[] = invest ? INVEST_METHODS : PAY_METHODS;
  const selected = effectiveMethod(inputs);
  // R16.10: the On a card explanation names the converted check limit; with no limit (no USD rate) the body drops that sentence
  const cardCap = source.cardMaxPurchase;
  const cardInfo: InfoDynamic | undefined =
    cardCap === undefined || cardCap === null ? undefined : { onCard: { cap: whole.formatMoney({ amount: cardCap, currency: source.currency }) } };

  // Which card is open. It starts as the selected method's and follows the selection when that changes elsewhere
  // (derived during render, no effect); tapping the open header folds it without changing the selection.
  const [ui, setUi] = useState<{ selected: MethodKey | null; open: MethodKey | null }>({ selected, open: selected });
  if (ui.selected !== selected) setUi({ selected, open: selected });
  const open = ui.open;

  const press = (method: MethodKey, name: string) => {
    hapticSelection();
    if (open === method) {
      setUi({ selected: ui.selected, open: null });
      return;
    }
    if (!readOnly && selected !== method) update({ method });
    setUi({ selected: readOnly ? ui.selected : method, open: method });
    AccessibilityInfo.announceForAccessibility(t('decide.pay.card.announce', { method: name }));
  };

  return (
    <View style={{ gap: space.gapMd }}>
      <View style={{ gap: space.gapSm }}>
        <InfoTitle info={howInfo} lineHeight={textRole(pairing, 'label').lineHeight}>
          <Eyebrow>{invest ? t('decide.pay.howYouPay.headInvest') : t('decide.pay.howYouPay.head')}</Eyebrow>
        </InfoTitle>
        <Meta tone="muted">{invest ? t('decide.pay.howYouPay.subInvest') : t('decide.pay.howYouPay.sub')}</Meta>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.pay.howYouPay.head')} style={{ gap: space.gapMd }}>
        {methods.map((method) => {
          const result = computation.methodPlans[method];
          const plan = result?.status === 'resolved' ? result.plan : null;
          const reasons: readonly PlanReason[] = result !== undefined && result.status !== 'resolved' ? result.reasons : [];
          const summary = methodSummary({ method, inputs, plan, cash: source.cash, whole: wholeFmt, exact: exactFmt, cards: source.cards });
          const name = t(METHOD_LABEL[method]);
          return (
            <MethodCard
              key={method}
              testID={`method-${method}`}
              name={name}
              infoKey={METHOD_INFO[method]}
              {...(method === 'card' && cardInfo !== undefined ? { infoDynamic: cardInfo } : {})}
              selected={selected === method}
              open={open === method}
              needs={needsFields(method, reasons, inputs)}
              summary={summary === null ? null : joinPreview(t as Translate, summary as CopyRef | readonly CopyRef[])}
              chips={chipsFor(result, t)}
              onHeaderPress={() => press(method, name)}
              onEdit={() => goToStep(1)}
              readOnly={readOnly}
            >
              <MethodBody {...props} method={method} />
            </MethodCard>
          );
        })}
      </View>
    </View>
  );
}
