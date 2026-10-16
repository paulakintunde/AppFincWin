/**
 * 05-14 Step 2: the payment methods side by side, each resolved on its own (computation.methodPlans, 04 D-37). A method with
 * no plan yet says why in a flag; no rate is ever pre-filled, and a figure the engine could not work out reads in words
 * ("Endless", "Not within 50 years"), never as a number or a dash.
 */
import React from 'react';
import { View } from 'react-native';
import { ZERO_PERCENT, percent } from '@/engine/decide';
import type { Plan, PlanReason, PlanResult } from '@/engine/decide';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { METHOD_LABEL } from '../../../copy/codeMaps';
import { percentText } from '../../../copy/percentText';
import { isValidAprText } from '../../../snapshot/checkInputs';
import { PAY_METHODS } from '../../../snapshot/types';
import type { MethodKey } from '../../../snapshot/types';
import { ChoiceCard } from '../../../ui/ChoiceCard';
import { FigureStrip } from '../../../ui/FigureStrip';
import type { Step2Props } from '../Step2PriceAndPay';
import { moneyFn } from '../stepUi';

const INVEST_METHODS = ['monthly', 'lump'] as const satisfies readonly MethodKey[];

/** The word for a figure the engine returns as null: a card minimum that never clears, or is still open at the 600-month cap. */
export function useOpenWord(): (plan: Plan) => string {
  const t = useT();
  return (plan) => (plan.card?.minimumOutcome === 'exceeds_month_cap' ? t('decide.pay.cardNotWithin') : t('decide.pay.cardEndless'));
}

function flagFor(result: PlanResult | undefined, t: ReturnType<typeof useT>): string | undefined {
  if (result === undefined) return undefined;
  if (result.status === 'resolved') {
    return result.plan.card !== null && result.plan.card.remainderOnDay > 0 ? t('decide.pay.flagPartOnCard') : undefined;
  }
  const has = (r: PlanReason) => result.reasons.includes(r);
  if (has('card_not_accepted')) return t('decide.pay.flagNotAccepted');
  if (has('loan_apr_missing') || has('card_apr_missing')) return t('decide.pay.flagRateNeeded');
  if (has('instalment_total_below_price')) return t('decide.pay.flagBelowPrice');
  return undefined;
}

export function PaymentMethods(props: Step2Props) {
  const { inputs, update, computation, source, whole, exact, readOnly } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const openWord = useOpenWord();
  const invest = inputs.kind === 'invest';
  const wholeFmt = moneyFn(whole, source.currency);
  const exactFmt = moneyFn(exact, source.currency);
  const methods: readonly MethodKey[] = invest ? INVEST_METHODS : PAY_METHODS;
  const selected = invest ? (inputs.method === 'monthly' ? 'monthly' : 'lump') : inputs.method;

  const note = (method: MethodKey, plan: Plan | null): string | null => {
    if (method === 'cash') return plan === null ? null : t('decide.pay.noteCash', { cash: wholeFmt(source.cash - plan.dayOne) });
    if (method === 'loan') {
      const apr = inputs.loan.aprText;
      if (!isValidAprText(apr)) return t('decide.pay.noteLoanNoRate');
      if (plan === null) return null;
      const deposit = wholeFmt(inputs.loan.deposit);
      const count = inputs.loan.termMonths ?? 0;
      if (percent(apr) === ZERO_PERCENT) return t('decide.pay.noteLoanZero', { deposit, count });
      return t('decide.pay.noteLoan', { deposit, count, apr, interest: plan.interest === null ? '' : wholeFmt(plan.interest) });
    }
    if (method === 'instalment') {
      if (plan === null || inputs.instalment.amount === null || inputs.instalment.count === null) return null;
      return t('decide.pay.noteInstalment', {
        count: inputs.instalment.count,
        payment: exactFmt(inputs.instalment.amount),
        extra: wholeFmt(plan.interest ?? 0),
      });
    }
    if (method === 'card') {
      if (inputs.card.payoff === 'full') return t('decide.pay.noteCardFull');
      const choice = source.cards.find((c) => c.accountId === inputs.card.accountId);
      const apr = choice?.record.apr ?? null;
      return apr === null ? t('decide.pay.noteCardNoRate') : t('decide.pay.noteCard', { apr: percentText(apr) });
    }
    return null;
  };

  return (
    <View accessibilityRole="radiogroup" style={{ gap: space.gapMd }}>
      {methods.map((method) => {
        const result = computation.methodPlans[method];
        const plan = result?.status === 'resolved' ? result.plan : null;
        const text = note(method, plan);
        return (
          <ChoiceCard
            key={method}
            selected={selected === method}
            onPress={() => {
              if (!readOnly) update({ method });
            }}
            title={t(METHOD_LABEL[method])}
            flag={flagFor(result, t)}
            accessibilityLabel={t(METHOD_LABEL[method])}
          >
            {plan === null ? null : (
              <FigureStrip
                dark={selected === method}
                items={[
                  { caption: t('decide.pay.onDay'), value: wholeFmt(plan.dayOne) },
                  { caption: t('decide.pay.aMonth'), value: exactFmt(plan.monthly) },
                  { caption: t('decide.pay.total'), value: plan.total === null ? openWord(plan) : wholeFmt(plan.total) },
                ]}
              />
            )}
            {text === null ? null : (
              <Text
                style={{
                  ...textRole(pairing, 'label'),
                  fontSize: fontSize.meta,
                  color: selected === method ? colors.inkSoft1 : colors.inkFaint,
                }}
              >
                {text}
              </Text>
            )}
          </ChoiceCard>
        );
      })}
    </View>
  );
}
