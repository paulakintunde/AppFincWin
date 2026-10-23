/**
 * 05-14 Step 2 method panels: a method's terms. 05-84 (D-79): each panel is the body of its own method card, inputs first and then
 * the "What it comes to" outputs tile; the panels no longer render below the cards. Every figure here is arithmetic on the
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
import { warnTint } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { canUse } from '../../../entitlements';
import { cardCostsCopy } from '../../../copy/cardTermsCopy';
import { percentText } from '../../../copy/percentText';
import { isValidAprText, toEngineCheck } from '../../../snapshot/checkInputs';
import type { CardNoteAnswer, CheckInputs, MethodKey } from '../../../snapshot/types';
import { FigureStrip } from '../../../ui/FigureStrip';
import { CustomValueChips, CustomValueField } from '../../../ui/CustomValueChips';
import { MoneyInput } from '../../../ui/MoneyInput';
import { RateInput } from '../../../ui/RateInput';
import { SliderWithField } from '../../../ui/SliderWithField';
import { useInfoSheet } from '../../../ui/useInfoSheet';
import type { Step2Props } from './types';
import { Eyebrow, Label, Meta, moneyFn } from '../stepUi';
import { InfoTitle } from '../../InfoTitle';
import { CardMinimumRow, CardMinimumSheet } from './CardMinimumSheet';
import { LateFeeField, PromoRow, VariableRateCard } from './CreditTermsPanel';
import { refText, type Translate as RefTranslate } from '../../refText';

const TERM_CHIPS = [12, 24, 36, 48, 60, 84] as const;
const MAX_TERM = 120; // D-71: the UI bound; the snapshot parser keeps 600 so a stored longer term still reads
const MIN_TERM = 1;
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

/** The selected method's body (kept for callers that render one panel). */
export function MethodPanels(props: Step2Props) {
  return props.inputs.method === null ? null : <MethodBody {...props} method={props.inputs.method} />;
}

/** D-79: the body of one method card, whichever method is selected. */
export function MethodBody(props: Step2Props & { method: MethodKey }) {
  switch (props.method) {
    case 'cash':
      return <CashPanel {...props} />;
    case 'loan':
      return <LoanPanel {...props} />;
    case 'instalment':
      return <InstalmentPanel {...props} />;
    case 'card':
      return <CardPanel {...props} />;
    case 'lump':
      return <InvestLumpPanel {...props} />;
    case 'monthly':
      return <InvestMonthlyPanel {...props} />;
  }
}

function resolvedPlan(props: Step2Props, method: MethodKey): Plan | null {
  const result = props.computation.methodPlans[method];
  return result?.status === 'resolved' ? result.plan : null;
}

/** R15.1: the outputs of a method, in a fill6 tile under its inputs. */
function OutputsTile({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.fill6 }]}>
      <Eyebrow>{t('decide.pay.card.comesTo')}</Eyebrow>
      {children}
    </View>
  );
}

/** On the day / A month / Total paid for one resolved plan. */
function PlanStrip({ plan, whole, exact, t }: { plan: Plan | null; whole: Money; exact: Money; t: Translate }) {
  if (plan === null) return null;
  return (
    <FigureStrip
      items={[
        { caption: t('decide.pay.onDay'), value: whole(plan.dayOne) },
        { caption: t('decide.pay.aMonth'), value: exact(plan.monthly) },
        { caption: t('decide.pay.total'), value: plan.total === null ? openWord(plan, false, t) : whole(plan.total) },
      ]}
    />
  );
}

// ── Paid in full ──
function CashPanel(props: Step2Props) {
  const { source, whole, exact } = props;
  const t = useT();
  const wholeFmt = moneyFn(whole, source.currency);
  const exactFmt = moneyFn(exact, source.currency);
  const plan = resolvedPlan(props, 'cash');
  if (plan === null) return null;
  return (
    <OutputsTile>
      <PlanStrip plan={plan} whole={wholeFmt} exact={exactFmt} t={t} />
      <Meta tone="muted">{t('decide.pay.noteCash', { cash: wholeFmt(source.cash - plan.dayOne) })}</Meta>
    </OutputsTile>
  );
}

// ── Loan ──
function LoanPanel(props: Step2Props) {
  const { inputs, update, computation, source, whole, exact, readOnly } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const aprInfo = useInfoSheet('apr');
  const depositInfo = useInfoSheet('deposit');
  const termInfo = useInfoSheet('loanTerm');
  const securedInfo = useInfoSheet('secured');
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
    setLoan({ aprText: text, aprFromQuick: false });
  };
  const typedZero = isValidAprText(loan.aprText) && percent(loan.aprText) === ZERO_PERCENT;
  const deposit = Math.min(loan.deposit, price);
  const paidEarly = plan !== null && term !== null && plan.months > 0 && plan.months < term;
  const saved = plan !== null && noDeposit !== null && plan.interest !== null && noDeposit.interest !== null ? noDeposit.interest - plan.interest : null;

  const showStrip = canUse('payoffComparisons');
  return (
    <View style={styles.panel}>
      <SliderWithField
        label={t('decide.pay.loanDeposit')}
        value={deposit}
        sliderMin={0}
        sliderMax={price}
        step={DEPOSIT_STEP}
        typedMin={0}
        typedMax={price}
        rangeText={t('decide.custom.range.upToPrice', { price: wholeFmt(price) })}
        currency={inputs.currency ?? source.currency}
        wholeUnits
        onChange={(minor) => setLoan({ deposit: minor })}
        sliderA11y={t('decide.pay.loanDeposit')}
        fieldA11y={t('decide.pay.loanDeposit')}
        labelAccessory={depositInfo.button()}
      />
      {depositInfo.sheet}

      <InfoTitle info={termInfo} lineHeight={textRole(pairing, 'label').lineHeight}>
        <Label>{t('decide.pay.loanTerm')}</Label>
      </InfoTitle>
      <CustomValueChips
        presets={TERM_CHIPS}
        value={term}
        onChange={(n) => setLoan({ termMonths: n })}
        groupLabel={t('decide.pay.loanTerm')}
        min={MIN_TERM}
        max={MAX_TERM}
        rangeText={t('decide.custom.range.months')}
        unitWord={t('decide.custom.unit.months')}
        readOnly={readOnly}
      />

      <RateInput
        value={loan.aprText}
        onChange={setApr}
        label={t('decide.pay.loanRate')}
        accessibilityLabel={t('decide.quick.aprA11y')}
        hint={typedZero ? t('decide.quick.beforeInterest') : loan.aprText === '' ? t('decide.pay.loanRateHint') : undefined}
        max={MAX_APR_TYPED}
        rangeText={t('decide.custom.range.apr')}
        labelAccessory={aprInfo.button()}
      />
      {aprInfo.sheet}

      <PromoRow
        method="loan"
        promo={loan.promo}
        onChange={(promo) => setLoan({ promo })}
        thenRateText={loan.aprText}
        onThenRateChange={setApr}
        termMonths={term}
        computation={computation}
        source={source}
        whole={whole}
        exact={exact}
      />
      <VariableRateCard value={loan.variable} onChange={(variable) => setLoan({ variable })} computation={computation} source={source} exact={exact} />

      <View style={styles.toggleWithInfo}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={readOnly ? { checked: loan.secured, disabled: true } : { checked: loan.secured }}
          accessibilityLabel={t('decide.pay.loanSecured')}
          disabled={readOnly}
          onPress={() => update({ loan: { ...loan, secured: !loan.secured, securedTouched: true } })}
          style={({ pressed }) => [styles.toggle, styles.toggleMain, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{t('decide.pay.loanSecured')}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: loan.secured ? colors.accent : colors.inkMuted }}>{loan.secured ? t('decide.pay.yes') : t('decide.pay.no')}</Text>
        </Pressable>
        {securedInfo.button()}
      </View>
      {securedInfo.sheet}

      {plan !== null ? (
        <OutputsTile>
          <PlanStrip plan={plan} whole={wholeFmt} exact={exactFmt} t={t} />
          {showStrip ? (
            <FigureStrip
              items={[
                ...(saved === null ? [] : [{ caption: t('decide.pay.loanInterestSaved'), value: wholeFmt(saved), tone: 'positive' as const }]),
                { caption: t('decide.pay.loanCashLeft'), value: wholeFmt(source.cash - plan.dayOne) },
              ]}
            />
          ) : null}
          {term !== null && plan.interest !== null ? (
            <Meta tone="muted">{t('decide.pay.loanTermNote', { count: term, payment: exactFmt(plan.monthly), interest: wholeFmt(plan.interest) })}</Meta>
          ) : null}
          {paidEarly ? <Meta tone="muted">{t('decide.pay.loanPaidOff', { count: plan.months, final: exactFmt(plan.finalMonthly ?? plan.monthly) })}</Meta> : null}
        </OutputsTile>
      ) : null}
    </View>
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
    <View style={styles.panel}>
      <MoneyInput
        value={inst.amount}
        currency={inputs.currency ?? source.currency}
        onChange={(minor) => update({ instalment: { ...inst, amount: minor !== null && minor > 0 ? minor : null } })}
        label={t('decide.pay.instalmentPayment')}
        accessibilityLabel={t('decide.pay.instalmentPayment')}
      />
      <Label>{t('decide.pay.instalmentCount')}</Label>
      <CustomValueField
        value={inst.count}
        min={MIN_TERM}
        max={MAX_TERM}
        rangeText={t('decide.custom.range.count')}
        unitWord={t('decide.pay.instalmentCountUnit')}
        groupLabel={t('decide.pay.instalmentCount')}
        onChange={(n) => update({ instalment: { ...inst, count: n } })}
      />
      <LateFeeField
        value={inst.lateFee}
        currency={inputs.currency ?? source.currency}
        onChange={(lateFee) => update({ instalment: { ...inst, lateFee } })}
        computation={computation}
        source={source}
        exact={exact}
      />
      <OutputsTile>
        <PlanStrip plan={plan} whole={wholeFmt} exact={exactFmt} t={t} />
        <Meta tone="muted">{note}</Meta>
      </OutputsTile>
    </View>
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
  // R6 rule N: a word an open figure reads as wraps (kind 'words'); a figure stays on one line.
  const tile = (caption: string, figure: string | null, word: string) => ({
    caption,
    value: figure ?? word,
    kind: figure === null ? ('words' as const) : ('figure' as const),
  });
  return [
    tile(t('decide.pay.cardCleared'), detail.payoffMonths === null ? null : t('decide.pay.cardMonthsValue', { count: detail.payoffMonths }), openWord(plan, true, t)),
    tile(t('decide.pay.cardInterest'), plan.interest === null ? null : fmt(plan.interest), openWord(plan, false, t)),
    tile(t('decide.pay.cardCosts'), detail.cardCosts === null ? null : fmt(detail.cardCosts), openWord(plan, false, t)),
  ];
}

function CardPanel(props: Step2Props) {
  const { inputs, update, source, whole, exact, computation, onSaveCardRate, onSaveCardTerms, readOnly } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const aprInfo = useInfoSheet('apr');
  const clearingInfo = useInfoSheet('cardClearing');
  const wholeFmt = moneyFn(whole, source.currency);
  const exactFmt = moneyFn(exact, source.currency);
  const card = inputs.card;
  const plan = resolvedPlan(props, 'card');
  const eligibility = cardEligibility(inputs.itemType);
  const price = props.computation.resolvedPrice?.price ?? 0;
  const chosen = source.cards.find((c) => c.accountId === card.accountId);
  const recorded = chosen?.record.apr ? percentText(chosen.record.apr) : '';
  const [rate, setRate] = useState<{ id: string | null; text: string }>({ id: card.accountId, text: recorded });
  const [termsOpen, setTermsOpen] = useState(false);
  const [monthsOpen, setMonthsOpen] = useState(false);
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
  const background = eligibility === 'blocked' ? colors.dangerTint3 : eligibility === 'capped' ? warnTint : colors.fill1;
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

  const cardStrip = plan !== null && plan.card !== null && canUse('payoffComparisons');
  return (
    <View style={styles.panel}>
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
            max={MAX_APR_TYPED}
            rangeText={t('decide.custom.range.apr')}
            labelAccessory={aprInfo.button()}
          />
          {aprInfo.sheet}

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

          <InfoTitle info={clearingInfo} lineHeight={textRole(pairing, 'label').lineHeight}>
            <Label>{t('decide.pay.cardClearedHow')}</Label>
          </InfoTitle>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            <Chip label={t('decide.pay.cardFull')} selected={card.payoff === 'full'} onPress={() => setCard({ payoff: 'full' })} />
            <Chip label={t('decide.pay.cardMonths')} selected={card.payoff === 'months'} onPress={() => setCard({ payoff: 'months' })} />
            <Chip label={t('decide.pay.cardMinimum')} selected={card.payoff === 'minimum'} onPress={() => setCard({ payoff: 'minimum' })} />
          </View>
          {card.payoff === 'months' ? (
            <>
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('decide.pay.cardFewer')}
                accessibilityState={{ disabled: readOnly || card.months <= 1 }}
                disabled={readOnly || card.months <= 1}
                onPress={() => setCard({ months: Math.max(1, card.months - 1) })}
                style={[styles.stepButton, { backgroundColor: colors.fill1, opacity: card.months <= 1 ? 0.5 : 1 }]}
              >
                <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>−</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('decide.pay.cardMonthsEdit')}, ${t('decide.pay.cardMonthsValue', { count: card.months })}`}
                accessibilityState={{ disabled: readOnly }}
                disabled={readOnly}
                onPress={() => setMonthsOpen(true)}
                style={styles.monthsFigure}
              >
                <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{t('decide.pay.cardMonthsValue', { count: card.months })}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('decide.pay.cardMore')}
                accessibilityState={{ disabled: readOnly || card.months >= MAX_TERM }}
                disabled={readOnly || card.months >= MAX_TERM}
                onPress={() => setCard({ months: Math.min(MAX_TERM, card.months + 1) })}
                style={[styles.stepButton, { backgroundColor: colors.fill1, opacity: card.months >= MAX_TERM ? 0.5 : 1 }]}
              >
                <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>+</Text>
              </Pressable>
            </View>
            {monthsOpen && !readOnly ? (
              <CustomValueField
                value={card.months}
                min={MIN_TERM}
                max={MAX_TERM}
                rangeText={t('decide.custom.range.months')}
                unitWord={t('decide.custom.unit.months')}
                groupLabel={t('decide.pay.cardMonths')}
                onChange={(n) => setCard({ months: n })}
                onClose={() => setMonthsOpen(false)}
                autoFocus
              />
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
      {cardStrip && plan !== null && plan.card !== null ? (
        <OutputsTile>
          <PlanStrip plan={plan} whole={wholeFmt} exact={exactFmt} t={t} />
          <FigureStrip items={cardTiles(plan, wholeFmt, t)} />
          {costsLine === null ? null : <Meta tone="muted">{refText(t as RefTranslate, costsLine)}</Meta>}
          {plan.card.minimumOutcome === 'exceeds_month_cap' && plan.card.remainingAtCap !== null ? (
            <Meta tone="muted">{t('decide.pay.cardCapRemaining', { amount: wholeFmt(plan.card.remainingAtCap) })}</Meta>
          ) : null}
        </OutputsTile>
      ) : null}
    </View>
  );
}

// ── Investment: lump sum ──
function InvestLumpPanel(props: Step2Props) {
  const { source, whole, exact } = props;
  const t = useT();
  const wholeFmt = moneyFn(whole, source.currency);
  const exactFmt = moneyFn(exact, source.currency);
  const plan = resolvedPlan(props, 'lump');
  if (plan === null) return null;
  return (
    <OutputsTile>
      <PlanStrip plan={plan} whole={wholeFmt} exact={exactFmt} t={t} />
    </OutputsTile>
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
  const plan = resolvedPlan(props, 'monthly');

  let worth: string | null = null;
  if (term !== null && monthly !== null && monthly > 0 && rateText !== undefined) {
    try {
      worth = wholeFmt(futureValue(minorUnits(monthly), percent(rateText), term, minorUnits(0)));
    } catch {
      worth = null; // a figure past the safe range is not shown, never guessed
    }
  }

  return (
    <View style={styles.panel}>
      <Label>{t('decide.pay.loanTerm')}</Label>
      <CustomValueChips
        presets={TERM_CHIPS}
        value={term}
        onChange={(n) => update({ investTermMonths: n })}
        groupLabel={t('decide.pay.loanTerm')}
        min={MIN_TERM}
        max={MAX_TERM}
        rangeText={t('decide.custom.range.months')}
        unitWord={t('decide.custom.unit.months')}
        readOnly={props.readOnly}
      />
      {plan !== null || (term !== null && monthly !== null && monthly > 0) ? (
        <OutputsTile>
          <PlanStrip plan={plan} whole={wholeFmt} exact={exactFmt} t={t} />
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
        </OutputsTile>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.gapMd },
  tile: { borderRadius: space.cardPad, padding: space.cardPad, gap: space.gapMd },
  toggleWithInfo: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  toggleMain: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  monthsFigure: { minHeight: space.touchMin, minWidth: space.touchMin, justifyContent: 'center', alignItems: 'center' },
  toggle: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
  eligibility: { borderRadius: space.cardPad, padding: space.cardPad, gap: space.gapSm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  stepButton: { width: space.touchMin, height: space.touchMin, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  question: { gap: space.gapSm },
});
