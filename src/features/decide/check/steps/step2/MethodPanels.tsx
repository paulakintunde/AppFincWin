/**
 * 05-14 Step 2 method panels: the selected method's terms, one panel at a time. Every figure here is arithmetic on the
 * user's own numbers. No rate is ever pre-filled (the loan rate is empty until typed; the card rate is the one on the card
 * record, saved only from what the user typed), and nothing reads as a lending proposal.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ZERO_PERCENT, cardEligibility, percent, resolvePlan } from '@/engine/decide';
import type { Plan } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { futureValue } from '@/engine/payoff';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { categoryTint } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { canUse } from '../../../entitlements';
import { cardCostsCopy } from '../../../copy/cardTermsCopy';
import { percentText } from '../../../copy/percentText';
import { isValidAprText, toEngineCheck, typedRateAbove } from '../../../snapshot/checkInputs';
import type { CardNoteAnswer, CheckInputs } from '../../../snapshot/types';
import { FigureStrip } from '../../../ui/FigureStrip';
import { MoneyInput } from '../../../ui/MoneyInput';
import { RateInput } from '../../../ui/RateInput';
import { StepSlider } from '../../../ui/StepSlider';
import type { Step2Props } from './types';
import { Box, Card, Label, Meta, moneyFn } from '../stepUi';
import { CardMinimumRow, CardMinimumSheet } from './CardMinimumSheet';
import { LateFeeField, PromoRow, VariableRateCard } from './CreditTermsPanel';
import { refText, type Translate as RefTranslate } from '../../refText';

const TERM_CHIPS = [12, 24, 36, 48, 60, 84] as const;
const MAX_TERM = 600;
const CARD_RATE_SAVE_MS = 800;
const DEPOSIT_STEP = 10_000; // 100 whole units, in minor units
const MAX_APR_TYPED = '999.99'; // gates keystrokes only; the stored value stays text (isValidAprText is the check)
const NOTE_KEYS = [
  { field: 'incomeStops', question: 'decide.pay.cardQ1' },
  { field: 'noNewSpending', question: 'decide.pay.cardQ2' },
  { field: 'jobLossCover', question: 'decide.pay.cardQ3' },
] as const;

type Money = ReturnType<typeof moneyFn>;
type Translate = ReturnType<typeof useT>;

/** Digits only, clamped to 1..MAX_TERM; anything else is "not set". */
function termFrom(text: string): number | null {
  const n = parseInt(text.replace(/\D/g, ''), 10);
  return Number.isSafeInteger(n) && n >= 1 ? Math.min(n, MAX_TERM) : null;
}

export function MethodPanels(props: Step2Props) {
  const { inputs } = props;
  if (inputs.kind === 'invest') return inputs.method === 'monthly' ? <InvestMonthlyPanel {...props} /> : null;
  switch (inputs.method) {
    case 'loan':
      return <LoanPanel {...props} />;
    case 'instalment':
      return <InstalmentPanel {...props} />;
    case 'card':
      return <CardPanel {...props} />;
    default:
      return null;
  }
}

function resolvedPlan(props: Step2Props, method: 'loan' | 'instalment' | 'card'): Plan | null {
  const result = props.computation.methodPlans[method];
  return result?.status === 'resolved' ? result.plan : null;
}

// ── Loan ──
function LoanPanel(props: Step2Props) {
  const { inputs, update, computation, source, whole, exact } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const wholeFmt = moneyFn(whole, source.currency);
  const exactFmt = moneyFn(exact, source.currency);
  const loan = inputs.loan;
  const price = computation.resolvedPrice?.price ?? 0;
  const plan = resolvedPlan(props, 'loan');
  const term = loan.termMonths;

  // What the same loan would cost with no deposit, so the deposit's saving is a comparison on the user's own terms.
  const noDeposit = useMemo(() => {
    const check = toEngineCheck({ ...inputs, method: 'loan', loan: { ...inputs.loan, deposit: 0 } }, { currency: source.currency, cards: source.cards, dealerCap: source.dealerCap });
    if (!check.ok) return null;
    const result = resolvePlan(check.check);
    return result.status === 'resolved' ? result.plan : null;
  }, [inputs, source.currency, source.cards, source.dealerCap]);

  const setLoan = (patch: Partial<CheckInputs['loan']>) => update({ loan: { ...loan, ...patch } });
  const setApr = (text: string) => {
    if (typedRateAbove(text, MAX_APR_TYPED)) return;
    setLoan({ aprText: text, aprFromQuick: false });
  };
  const typedZero = isValidAprText(loan.aprText) && percent(loan.aprText) === ZERO_PERCENT;
  const deposit = Math.min(loan.deposit, price);
  const paidEarly = plan !== null && term !== null && plan.months > 0 && plan.months < term;
  const saved = plan !== null && noDeposit !== null && plan.interest !== null && noDeposit.interest !== null ? noDeposit.interest - plan.interest : null;

  return (
    <Card>
      <MoneyInput
        value={deposit > 0 ? deposit : null}
        currency={inputs.currency ?? source.currency}
        onChange={(minor) => setLoan({ deposit: Math.min(minor ?? 0, price) })}
        label={t('decide.pay.loanDeposit')}
        accessibilityLabel={t('decide.pay.loanDeposit')}
      />
      <StepSlider
        value={deposit}
        min={0}
        max={price}
        step={DEPOSIT_STEP}
        onChange={(v) => setLoan({ deposit: v })}
        accessibilityLabel={t('decide.pay.loanDeposit')}
        valueText={wholeFmt(deposit)}
      />
      {canUse('payoffComparisons') ? (
        <FigureStrip
          items={[
            ...(saved === null ? [] : [{ caption: t('decide.pay.loanInterestSaved'), value: wholeFmt(saved), tone: 'positive' as const }]),
            { caption: t('decide.pay.loanCashLeft'), value: wholeFmt(source.cash - (plan?.dayOne ?? deposit)) },
          ]}
        />
      ) : null}

      <Label>{t('decide.pay.loanTerm')}</Label>
      <View style={styles.termRow}>
        <View style={styles.termBox}>
          <Box numeric value={term === null ? '' : String(term)} onChangeText={(x) => setLoan({ termMonths: termFrom(x) })} accessibilityLabel={t('decide.pay.loanTerm')} maxLength={3} />
        </View>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.pay.loanTermUnit')}</Text>
      </View>
      <View accessibilityRole="radiogroup" style={styles.chips}>
        {TERM_CHIPS.map((n) => (
          <Chip key={n} label={String(n)} selected={term === n} accessibilityLabel={t('decide.quick.termChipA11y', { count: n })} onPress={() => setLoan({ termMonths: n })} />
        ))}
      </View>
      {plan !== null && term !== null && plan.interest !== null ? (
        <Meta tone="muted">{t('decide.pay.loanTermNote', { count: term, payment: exactFmt(plan.monthly), interest: wholeFmt(plan.interest) })}</Meta>
      ) : null}
      {paidEarly ? <Meta tone="muted">{t('decide.pay.loanPaidOff', { count: plan.months, final: exactFmt(plan.finalMonthly ?? plan.monthly) })}</Meta> : null}

      <RateInput
        value={loan.aprText}
        onChange={setApr}
        label={t('decide.pay.loanRate')}
        accessibilityLabel={t('decide.quick.aprA11y')}
        hint={typedZero ? t('decide.quick.beforeInterest') : loan.aprText === '' ? t('decide.pay.loanRateHint') : undefined}
      />

      <PromoRow
        method="loan"
        promo={loan.promo}
        onChange={(promo) => setLoan({ promo })}
        thenRateText={loan.aprText}
        onThenRateChange={setApr}
        computation={computation}
        source={source}
        whole={whole}
        exact={exact}
      />
      <VariableRateCard value={loan.variable} onChange={(variable) => setLoan({ variable })} computation={computation} source={source} exact={exact} />

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: loan.secured }}
        accessibilityLabel={t('decide.pay.loanSecured')}
        onPress={() => update({ loan: { ...loan, secured: !loan.secured, securedTouched: true } })}
        style={({ pressed }) => [styles.toggle, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{t('decide.pay.loanSecured')}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: loan.secured ? colors.accent : colors.inkMuted }}>{loan.secured ? t('decide.pay.yes') : t('decide.pay.no')}</Text>
      </Pressable>
    </Card>
  );
}

// ── Instalment ──
function InstalmentPanel(props: Step2Props) {
  const { inputs, update, computation, source, whole, exact } = props;
  const t = useT();
  const wholeFmt = moneyFn(whole, source.currency);
  const exactFmt = moneyFn(exact, source.currency);
  const inst = inputs.instalment;
  const result = computation.methodPlans.instalment;
  const plan = result?.status === 'resolved' ? result.plan : null;
  const belowPrice = result?.status === 'missing' && result.reasons.includes('instalment_total_below_price');
  const resolved = computation.resolvedPrice;

  let note: string;
  if (plan !== null && inst.amount !== null && inst.count !== null) {
    // the instalments alone: amount x count, which is plan.total less any on-the-day fees
    const total = wholeFmt((plan.total ?? 0) - plan.dayFees);
    const pct = plan.impliedAnnualRate === null ? '' : percentText(plan.impliedAnnualRate);
    note =
      plan.dayFees > 0
        ? t('decide.pay.instalmentNoteFees', { count: inst.count, payment: exactFmt(inst.amount), total, financed: wholeFmt(plan.financed), pct })
        : t('decide.pay.instalmentNote', { count: inst.count, payment: exactFmt(inst.amount), total, price: wholeFmt(plan.price), pct });
  } else if (belowPrice && inst.amount !== null && inst.count !== null && resolved !== null) {
    note = t('decide.pay.instalmentBelowPrice', {
      count: inst.count,
      payment: exactFmt(inst.amount),
      total: wholeFmt(inst.amount * inst.count),
      financed: wholeFmt(resolved.price - resolved.dayFees),
    });
  } else {
    note = t('decide.pay.instalmentMissing');
  }

  return (
    <Card>
      <MoneyInput
        value={inst.amount}
        currency={inputs.currency ?? source.currency}
        onChange={(minor) => update({ instalment: { ...inst, amount: minor !== null && minor > 0 ? minor : null } })}
        label={t('decide.pay.instalmentPayment')}
        accessibilityLabel={t('decide.pay.instalmentPayment')}
      />
      <Label>{t('decide.pay.instalmentCount')}</Label>
      <Box numeric value={inst.count === null ? '' : String(inst.count)} onChangeText={(x) => update({ instalment: { ...inst, count: termFrom(x) } })} accessibilityLabel={t('decide.pay.instalmentCount')} maxLength={3} />
      <Meta tone="muted">{note}</Meta>
      <LateFeeField
        value={inst.lateFee}
        currency={inputs.currency ?? source.currency}
        onChange={(lateFee) => update({ instalment: { ...inst, lateFee } })}
        computation={computation}
        source={source}
        exact={exact}
      />
    </Card>
  );
}

// ── Card ──
/** The word for a figure the engine returns as null: still open at the 600-month cap, or a minimum that never clears. */
function openWord(plan: Plan, cleared: boolean, t: Translate): string {
  if (plan.card?.minimumOutcome === 'exceeds_month_cap') return t('decide.pay.cardNotWithin');
  return cleared ? t('decide.pay.cardNever') : t('decide.pay.cardEndless');
}

/** Cleared reads the months actually paid; Interest and Card costs are the engine's figures, or words when it has none. */
function cardTiles(plan: Plan, fmt: Money, t: Translate) {
  const detail = plan.card!;
  return [
    {
      caption: t('decide.pay.cardCleared'),
      value: detail.payoffMonths === null ? openWord(plan, true, t) : t('decide.pay.cardMonthsValue', { count: detail.payoffMonths }),
    },
    { caption: t('decide.pay.cardInterest'), value: plan.interest === null ? openWord(plan, false, t) : fmt(plan.interest) },
    { caption: t('decide.pay.cardCosts'), value: detail.cardCosts === null ? openWord(plan, false, t) : fmt(detail.cardCosts) },
  ];
}

function CardPanel(props: Step2Props) {
  const { inputs, update, source, whole, exact, computation, onSaveCardRate, onSaveCardTerms, readOnly } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const wholeFmt = moneyFn(whole, source.currency);
  const card = inputs.card;
  const plan = resolvedPlan(props, 'card');
  const eligibility = cardEligibility(inputs.itemType);
  const price = props.computation.resolvedPrice?.price ?? 0;
  const chosen = source.cards.find((c) => c.accountId === card.accountId);
  const recorded = chosen?.record.apr ? percentText(chosen.record.apr) : '';
  const [rate, setRate] = useState<{ id: string | null; text: string }>({ id: card.accountId, text: recorded });
  const [termsOpen, setTermsOpen] = useState(false);
  if (rate.id !== card.accountId) setRate({ id: card.accountId, text: recorded });
  const setCard = (patch: Partial<CheckInputs['card']>) => update({ card: { ...card, ...patch } });

  const titleKey = eligibility === 'permitted' ? 'decide.pay.cardOkTitle' : eligibility === 'capped' ? 'decide.pay.cardCappedTitle' : 'decide.pay.cardBlockedTitle';
  const body =
    eligibility === 'permitted'
      ? t('decide.pay.cardOkBody')
      : eligibility === 'capped'
        ? source.dealerCap === null
          ? null
          : t('decide.pay.cardCappedBody', { cap: wholeFmt(source.dealerCap), rest: wholeFmt(Math.max(price - source.dealerCap, 0)) })
        : t('decide.pay.cardBlockedBody');
  const background = eligibility === 'blocked' ? colors.dangerTint3 : eligibility === 'capped' ? categoryTint.Business : colors.fill1;
  const titleColor = eligibility === 'blocked' ? colors.danger : eligibility === 'capped' ? colors.warn1 : colors.ink;

  const costsLine = plan !== null && plan.card !== null ? cardCostsCopy(plan.card, plan.interest, wholeFmt) : null;

  // WR-C04: a typed card rate is saved on blur, on submit and CARD_RATE_SAVE_MS after typing stops (and when the step is
  // left), so tapping Next or a chip, which does not blur under keyboardShouldPersistTaps, never leaves the figures on a
  // rate other than the one shown. A decided check saves nothing, and the same rate is not saved twice.
  const lastSaved = useRef<string | null>(null);
  const saveRate = (): void => {
    if (readOnly || card.accountId === null || !isValidAprText(rate.text) || rate.text === recorded) return;
    const key = `${card.accountId}|${rate.text}`;
    if (lastSaved.current === key) return;
    lastSaved.current = key;
    onSaveCardRate(card.accountId, rate.text);
  };
  const saveLatest = useRef(saveRate);
  useEffect(() => {
    saveLatest.current = saveRate;
  });
  useEffect(() => {
    const timer = setTimeout(() => saveLatest.current(), CARD_RATE_SAVE_MS);
    return () => clearTimeout(timer);
  }, [rate.text]);
  useEffect(() => () => saveLatest.current(), []);
  const answered = NOTE_KEYS.filter((k) => inputs.cardNotes[k.field] !== null).length;
  const setNote = (field: (typeof NOTE_KEYS)[number]['field'], answer: Exclude<CardNoteAnswer, null>) =>
    update({ cardNotes: { ...inputs.cardNotes, [field]: inputs.cardNotes[field] === answer ? null : answer } });

  return (
    <Card>
      <View style={[styles.eligibility, { backgroundColor: background }]}>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: titleColor }}>{t(titleKey)}</Text>
        {body === null ? null : <Meta tone="muted">{body}</Meta>}
        {eligibility === 'blocked' ? <Pill label={t('decide.pay.cardUseLoan')} variant="secondary" onPress={() => update({ method: 'loan' })} /> : null}
      </View>

      {eligibility === 'blocked' ? null : (
        <>
          <Label>{t('decide.pay.cardAccount')}</Label>
          {source.cards.length === 0 ? (
            <Meta tone="muted">{t('decide.pay.cardNone')}</Meta>
          ) : (
            <View accessibilityRole="radiogroup" style={styles.chips}>
              {source.cards.map((c) => (
                <Chip key={c.accountId} label={c.name} selected={card.accountId === c.accountId} onPress={() => setCard({ accountId: c.accountId })} />
              ))}
            </View>
          )}

          <RateInput
            value={rate.text}
            onChange={(text) => setRate({ id: card.accountId, text })}
            onBlur={saveRate}
            readOnly={readOnly}
            label={t('decide.pay.cardRate')}
            accessibilityLabel={t('decide.pay.cardRateA11y')}
          />

          {chosen === undefined ? null : (
            <>
              <CardMinimumRow terms={chosen.terms} readOnly={readOnly} onPress={() => setTermsOpen(true)} whole={whole} />
              {readOnly ? null : (
                <CardMinimumSheet
                  visible={termsOpen}
                  terms={chosen.terms}
                  onSave={(terms) => onSaveCardTerms(chosen.accountId, terms)}
                  onClose={() => setTermsOpen(false)}
                />
              )}
            </>
          )}

          <MoneyInput
            value={card.fees}
            currency={inputs.currency ?? source.currency}
            onChange={(minor) => setCard({ fees: minor !== null && minor > 0 ? minor : null })}
            label={t('decide.depth.cardCosts.feesLabel')}
            accessibilityLabel={t('decide.depth.cardCosts.feesA11y')}
            readOnly={readOnly}
          />
          <Meta tone="muted">{t('decide.depth.cardCosts.feesSub')}</Meta>

          <Label>{t('decide.pay.cardClearedHow')}</Label>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            <Chip label={t('decide.pay.cardFull')} selected={card.payoff === 'full'} onPress={() => setCard({ payoff: 'full' })} />
            <Chip label={t('decide.pay.cardMonths')} selected={card.payoff === 'months'} onPress={() => setCard({ payoff: 'months' })} />
            <Chip label={t('decide.pay.cardMinimum')} selected={card.payoff === 'minimum'} onPress={() => setCard({ payoff: 'minimum' })} />
          </View>
          {card.payoff === 'months' ? (
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('decide.pay.cardFewer')}
                disabled={card.months <= 1}
                onPress={() => setCard({ months: Math.max(1, card.months - 1) })}
                style={[styles.stepButton, { backgroundColor: colors.fill1, opacity: card.months <= 1 ? 0.5 : 1 }]}
              >
                <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>−</Text>
              </Pressable>
              <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.pay.cardMonthsValue', { count: card.months })}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('decide.pay.cardMore')}
                disabled={card.months >= MAX_TERM}
                onPress={() => setCard({ months: Math.min(MAX_TERM, card.months + 1) })}
                style={[styles.stepButton, { backgroundColor: colors.fill1, opacity: card.months >= MAX_TERM ? 0.5 : 1 }]}
              >
                <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>+</Text>
              </Pressable>
            </View>
          ) : null}

          {plan !== null && plan.card !== null && canUse('payoffComparisons') ? (
            <>
              <FigureStrip items={cardTiles(plan, wholeFmt, t)} />
              {costsLine === null ? null : <Meta tone="muted">{refText(t as RefTranslate, costsLine)}</Meta>}
              {plan.card.minimumOutcome === 'exceeds_month_cap' && plan.card.remainingAtCap !== null ? (
                <Meta tone="muted">{t('decide.pay.cardCapRemaining', { amount: wholeFmt(plan.card.remainingAtCap) })}</Meta>
              ) : null}
            </>
          ) : null}

          <PromoRow
            method="card"
            promo={card.promo}
            onChange={(promo) => setCard({ promo })}
            thenRateText={rate.text}
            computation={computation}
            source={source}
            whole={whole}
            exact={exact}
          />
          <VariableRateCard value={card.variable} onChange={(variable) => setCard({ variable })} computation={computation} source={source} exact={exact} />

          <Label>{t('decide.pay.cardNotesHeading')}</Label>
          <Meta>{t('decide.pay.cardNotesCount', { count: answered })}</Meta>
          {NOTE_KEYS.map((k) => (
            <View key={k.field} style={styles.question}>
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>{t(k.question)}</Text>
              <View accessibilityRole="radiogroup" accessibilityLabel={t(k.question)} style={styles.chips}>
                {(['yes', 'no', 'unsure'] as const).map((a) => (
                  <Chip key={a} label={t(`decide.pay.${a}`)} selected={inputs.cardNotes[k.field] === a} onPress={() => setNote(k.field, a)} />
                ))}
              </View>
            </View>
          ))}
        </>
      )}
    </Card>
  );
}

// ── Investment: monthly contribution ──
function InvestMonthlyPanel(props: Step2Props) {
  const { inputs, update, source, whole, exact } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const wholeFmt = moneyFn(whole, source.currency);
  const exactFmt = moneyFn(exact, source.currency);
  const term = inputs.investTermMonths;
  const monthly = inputs.advertised;
  const rateText = inputs.projectionRates[0];

  let worth: string | null = null;
  if (term !== null && monthly !== null && monthly > 0 && rateText !== undefined) {
    try {
      worth = wholeFmt(futureValue(minorUnits(monthly), percent(rateText), term, minorUnits(0)));
    } catch {
      worth = null; // a figure past the safe range is not shown, never guessed
    }
  }

  return (
    <Card>
      <Label>{t('decide.pay.loanTerm')}</Label>
      <View accessibilityRole="radiogroup" style={styles.chips}>
        {TERM_CHIPS.map((n) => (
          <Chip key={n} label={String(n)} selected={term === n} accessibilityLabel={t('decide.quick.termChipA11y', { count: n })} onPress={() => update({ investTermMonths: n })} />
        ))}
      </View>
      {term !== null && monthly !== null && monthly > 0 ? (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>
          {t('decide.pay.noteInvestMonthly', { amount: exactFmt(monthly), count: term, total: wholeFmt(monthly * term) })}
        </Text>
      ) : null}
      {worth !== null && rateText !== undefined ? (
        <>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>{t('decide.pay.noteInvestWorth', { rate: rateText, fv: worth })}</Text>
          <Meta>{t('decide.pay.noteInvestCaption')}</Meta>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  termRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  termBox: { flex: 1 },
  toggle: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
  eligibility: { borderRadius: space.cardPad, padding: space.cardPad, gap: space.gapSm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  stepButton: { width: space.touchMin, height: space.touchMin, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  question: { gap: space.gapSm },
});
