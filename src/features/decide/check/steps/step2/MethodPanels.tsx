/**
 * 05-14 Step 2 method panels: a method's terms. 05-84 (D-79): each panel is the body of its own method card, inputs first and then
 * the "What it comes to" outputs tile; the panels no longer render below the cards. Every figure here is arithmetic on the
 * user's own numbers. No rate is ever pre-filled (the loan rate is empty until typed; the card rate is the one on the card
 * record, saved only from what the user typed), and nothing reads as a lending proposal.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CARD_MAX_PURCHASE_USD, MAX_INSTALMENTS, ZERO_PERCENT, cardEligibility, percent, resolvePlan } from '@/engine/decide';
import type { InstalmentFreq, Plan } from '@/engine/decide';
import { currencyCode, minorUnits } from '@/engine/money';
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
import { instalmentNotes } from '../../../copy/instalmentCopy';
import { percentText } from '../../../copy/percentText';
import { engineCtxOf, isValidAprText, isValidProjectionRateText, toEngineCheck } from '../../../snapshot/checkInputs';
import { LUMP_HORIZON_DEFAULT, expectedReturnProjection } from '../../../snapshot/expectedReturn';
import type { CardNoteAnswer, CheckInputs, MethodKey } from '../../../snapshot/types';
import { FigureStrip } from '../../../ui/FigureStrip';
import { CustomValueChips, CustomValueField } from '../../../ui/CustomValueChips';
import { MoneyInput } from '../../../ui/MoneyInput';
import { RateInput } from '../../../ui/RateInput';
import { SegmentedToggle } from '../../../ui/SegmentedToggle';
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
const INSTALMENT_FREQS = ['weekly', 'fortnightly', 'monthly', 'quarterly'] as const satisfies readonly InstalmentFreq[];
const IMPLIED_APR_NOTES: readonly string[] = ['decide.pay.instRateAbout', 'decide.pay.instRateAbove', 'decide.pay.instRateZero'];
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
  const savedInfo = useInfoSheet('interestSaved');
  const wholeFmt = moneyFn(whole, source.currency);
  const exactFmt = moneyFn(exact, source.currency);
  const loan = inputs.loan;
  const price = computation.resolvedPrice?.price ?? 0;
  const plan = resolvedPlan(props, 'loan');
  const term = loan.termMonths;

  // What the same loan would cost with no deposit, so the deposit's saving is a comparison on the user's own terms.
  const noDeposit = useMemo(() => {
    const check = toEngineCheck({ ...inputs, method: 'loan', loan: { ...inputs.loan, deposit: 0 } }, engineCtxOf(source));
    if (!check.ok) return null;
    const result = resolvePlan(check.check);
    return result.status === 'resolved' ? result.plan : null;
  }, [inputs, source]);

  const setLoan = (patch: Partial<CheckInputs['loan']>) => update({ loan: { ...loan, ...patch } });
  const setApr = (text: string) => {
    setLoan({ aprText: text, aprFromQuick: false });
  };
  const typedZero = isValidAprText(loan.aprText) && percent(loan.aprText) === ZERO_PERCENT;
  const deposit = Math.min(loan.deposit, price);
  const paidEarly = plan !== null && term !== null && plan.months > 0 && plan.months < term;
  const saved = plan !== null && noDeposit !== null && plan.interest !== null && noDeposit.interest !== null ? noDeposit.interest - plan.interest : null;

  const showStrip = canUse('payoffComparisons');
  // D-86: the saving shows only with a deposit and a rate, so 0 or a missing figure hides the tile and the line.
  const showSaved = deposit > 0 && saved !== null && saved > 0 && noDeposit !== null && plan !== null && term !== null && isValidAprText(loan.aprText);
  const stripLabel =
    plan === null || saved === null
      ? ''
      : [
          `${t('decide.pay.loanInterestSavedByDeposit')}, ${wholeFmt(saved)}`,
          ...(plan.interest === null ? [] : [`${t('decide.pay.loanInterestPaid')}, ${plan.interest === 0 ? t('decide.verdict.key.none') : wholeFmt(plan.interest)}`]),
          `${t('decide.pay.loanCashLeft')}, ${wholeFmt(source.cash - plan.dayOne)}`,
        ].join('. ');
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
              {...(showSaved ? { group: { label: stripLabel } } : {})}
              items={[
                ...(showSaved
                  ? [{ caption: t('decide.pay.loanInterestSavedByDeposit'), value: wholeFmt(saved), tone: 'positive' as const, captionAccessory: savedInfo.button() }]
                  : []),
                ...(plan.interest === null ? [] : [{ caption: t('decide.pay.loanInterestPaid'), value: plan.interest === 0 ? t('decide.verdict.key.none') : wholeFmt(plan.interest) }]),
                { caption: t('decide.pay.loanCashLeft'), value: wholeFmt(source.cash - plan.dayOne) },
              ]}
            />
          ) : null}
          {showStrip && showSaved ? (
            <Meta tone="muted">
              {t('decide.pay.loanSavedLine', {
                count: term,
                saved: wholeFmt(saved),
                financedNoDeposit: wholeFmt(noDeposit.financed),
                financed: wholeFmt(plan.financed),
                apr: percentText(percent(loan.aprText)),
              })}
            </Meta>
          ) : null}
          {savedInfo.sheet}
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
/** D-80 (R15.2, R15.3): Has a rate? No / Yes, the payment or the quote, how many, the rate, the first payment and the notes. */
function InstalmentPanel(props: Step2Props) {
  const { inputs, update, computation, source, whole, exact, readOnly } = props;
  const t = useT();
  const { pairing } = useTheme();
  const hasRateInfo = useInfoSheet('hasRate');
  const aprInfo = useInfoSheet('apr');
  const firstInfo = useInfoSheet('firstPayment');
  const freqInfo = useInfoSheet('instalmentFrequency');
  const impliedInfo = useInfoSheet('impliedApr');
  const wholeFmt = moneyFn(whole, source.currency);
  const exactFmt = moneyFn(exact, source.currency);
  const inst = inputs.instalment;
  const freq: InstalmentFreq = inst.freq ?? 'monthly';
  const hasRate = inst.hasRate === true;
  const result = computation.methodPlans.instalment;
  const plan = result?.status === 'resolved' ? result.plan : null;
  const reasons = result?.status === 'missing' ? result.reasons : [];
  const currency = inputs.currency ?? source.currency;
  const labelLine = textRole(pairing, 'label').lineHeight;

  const notes = instalmentNotes(inputs, plan, reasons, { whole: wholeFmt, exact: exactFmt }, computation.resolvedPrice, computation.impliedApr);
  const setInst = (patch: Partial<CheckInputs['instalment']>) => update({ instalment: { ...inst, ...patch } });
  const count = (
    <>
      <Label>{t('decide.pay.instalmentCount')}</Label>
      <CustomValueField
        value={inst.count}
        min={MIN_TERM}
        max={MAX_INSTALMENTS}
        rangeText={t('decide.pay.instalmentCountRange')}
        unitWord={t('decide.pay.instalmentCountUnit')}
        groupLabel={t('decide.pay.instalmentCount')}
        onChange={(n) => setInst({ count: n })}
      />
    </>
  );

  return (
    <View style={styles.panel}>
      <InfoTitle info={freqInfo} lineHeight={labelLine}>
        <Label>{t('decide.pay.freq.label')}</Label>
      </InfoTitle>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.pay.freq.label')} style={styles.chips}>
        {INSTALMENT_FREQS.map((f) => (
          <Chip key={f} label={t(`decide.pay.freq.${f}`)} selected={freq === f} onPress={() => setInst({ freq: f })} />
        ))}
      </View>

      <InfoTitle info={hasRateInfo} lineHeight={labelLine}>
        <Label>{t('decide.pay.instalmentHasRate')}</Label>
      </InfoTitle>
      <SegmentedToggle
        options={[
          { key: 'no', label: t('decide.pay.instalmentNo') },
          { key: 'yes', label: t('decide.pay.instalmentYes') },
        ]}
        value={hasRate ? 'yes' : 'no'}
        onChange={(key) => setInst({ hasRate: key === 'yes' })}
        accessibilityLabel={t('decide.pay.instalmentHasRate')}
      />

      {hasRate ? (
        <>
          {count}
          <RateInput
            value={inst.aprText ?? ''}
            onChange={(text) => setInst({ aprText: text })}
            readOnly={readOnly}
            label={t('decide.pay.loanRate')}
            accessibilityLabel={t('decide.quick.aprA11y')}
            max={MAX_APR_TYPED}
            rangeText={t('decide.custom.range.apr')}
            labelAccessory={aprInfo.button()}
          />
          {aprInfo.sheet}
          <MoneyInput
            value={inst.amount}
            currency={currency}
            onChange={(minor) => setInst({ amount: minor !== null && minor > 0 ? minor : null })}
            readOnly={readOnly}
            label={t('decide.pay.instalmentQuoted')}
            accessibilityLabel={t('decide.pay.instalmentQuoted')}
          />
        </>
      ) : (
        <>
          <MoneyInput
            value={inst.amount}
            currency={currency}
            onChange={(minor) => setInst({ amount: minor !== null && minor > 0 ? minor : null })}
            readOnly={readOnly}
            label={t('decide.pay.instalmentPayment')}
            accessibilityLabel={t('decide.pay.instalmentPayment')}
          />
          {count}
        </>
      )}

      <InfoTitle info={firstInfo} lineHeight={labelLine}>
        <Label>{t('decide.pay.instalmentFirst')}</Label>
      </InfoTitle>
      <SegmentedToggle
        options={[
          { key: 'today', label: t('decide.pay.instalmentToday') },
          { key: 'next_period', label: t(`decide.pay.firstPayment.${freq}`) },
        ]}
        value={(inst.firstPayment ?? 'today') === 'today' ? 'today' : 'next_period'}
        onChange={(key) => setInst({ firstPayment: key === 'next_period' ? 'next_period' : 'today' })}
        accessibilityLabel={t('decide.pay.instalmentFirst')}
      />

      <LateFeeField
        value={inst.lateFee}
        currency={currency}
        onChange={(lateFee) => setInst({ lateFee })}
        computation={computation}
        source={source}
        exact={exact}
      />
      <OutputsTile>
        <PlanStrip plan={plan} whole={wholeFmt} exact={exactFmt} t={t} />
        {notes.map((note) => {
          const line = (
            <Meta key={note.key} tone="muted">
              {refText(t as RefTranslate, note)}
            </Meta>
          );
          // D-90: the worked-out rate is not a quoted one, so its clause carries the ⓘ that says so
          return IMPLIED_APR_NOTES.includes(note.key) ? (
            <InfoTitle key={note.key} info={impliedInfo} lineHeight={labelLine}>
              {line}
            </InfoTitle>
          ) : (
            line
          );
        })}
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
  const rule = cardEligibility(inputs.itemType, source.region ?? null); // D-92: tax is blocked only in GB (RD-02 region from the snapshot)
  const limited = plan?.card?.capBy === 'check_limit'; // D-91: the check limit, not the dealer cap, bound the card part
  const eligibility = limited ? 'capped' : rule.eligibility;
  const cardMax = source.cardMaxPurchase ?? null;
  const limitInfo = useInfoSheet('cardCheckLimit', {
    cardCheckLimit: {
      usdLimit: whole.formatMoney({ amount: minorUnits(CARD_MAX_PURCHASE_USD), currency: currencyCode('USD') }),
      ...(cardMax !== null ? { cap: wholeFmt(cardMax) } : {}),
      ...(source.currency === 'USD' ? { usdHome: true } : {}),
    },
  });
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
      : limited && plan?.card != null
        ? t('decide.pay.cardLimitBody', { cap: wholeFmt(plan.card.onCard), rest: wholeFmt(plan.card.remainderOnDay) })
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
        {limited ? (
          <InfoTitle info={limitInfo} lineHeight={textRole(pairing, 'label').lineHeight}>
            <Meta tone="muted">{t('decide.pay.cardLimitNote')}</Meta>
          </InfoTitle>
        ) : null}
        {limitInfo.sheet}
        {eligibility === 'blocked' ? <Pill label={t('decide.pay.cardUseLoan')} variant="secondary" onPress={() => update({ method: 'loan' })} /> : null}
      </View>
      {rule.note === null ? null : <Meta tone="muted">{t(`decide.pay.cardNote.${rule.note}`)}</Meta>}

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

// ── Investment: shared expected-return field and projection note (D-82, R15.5) ──
const RETURN_MAX_TYPED = '100'; // gates keystrokes only; isValidProjectionRateText is the check
const HORIZON_CHIPS = [12, 60, 120, 240] as const;
const HORIZON_MAX = 600;

/** The optional expected return: blank by default, never pre-filled, kept as text and bounded 0-100. */
function ExpectedReturnField({ inputs, update, readOnly }: Pick<Step2Props, 'inputs' | 'update' | 'readOnly'>) {
  const t = useT();
  const returnInfo = useInfoSheet('expectedReturn');
  return (
    <>
      <RateInput
        value={inputs.investReturnText ?? ''}
        onChange={(text) => update({ investReturnText: text === '' ? null : text })}
        label={t('decide.pay.expectedReturn')}
        accessibilityLabel={t('decide.pay.expectedReturn')}
        hint={t('decide.custom.range.aprUpTo')}
        max={RETURN_MAX_TYPED}
        rangeText={t('decide.custom.range.aprUpTo')}
        readOnly={readOnly}
        labelAccessory={returnInfo.button()}
      />
      {returnInfo.sheet}
    </>
  );
}

/** "About {fv} after {n} months at {r}% a year. A projection ..., not a forecast." Display only. */
function ProjectionNote({ props }: { props: Step2Props }) {
  const { inputs, computation, source, whole } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const wholeFmt = moneyFn(whole, source.currency);
  const projection = expectedReturnProjection(inputs, computation.check);
  if (projection === null) return null;
  return (
    <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>
      {projection.fv === null
        ? t('decide.depth.invest.tooLarge')
        : t('decide.pay.projection', { count: projection.months, fv: wholeFmt(projection.fv), rate: projection.rateText })}
    </Text>
  );
}

// ── Investment: lump sum ──
function InvestLumpPanel(props: Step2Props) {
  const { inputs, update, source, whole, exact, readOnly } = props;
  const t = useT();
  const wholeFmt = moneyFn(whole, source.currency);
  const exactFmt = moneyFn(exact, source.currency);
  const plan = resolvedPlan(props, 'lump');
  const hasReturn = inputs.investReturnText !== null && isValidProjectionRateText(inputs.investReturnText);
  return (
    <View style={styles.panel}>
      <ExpectedReturnField inputs={inputs} update={update} readOnly={readOnly} />
      {hasReturn ? (
        <>
          <Label>{t('decide.pay.horizonOver')}</Label>
          <CustomValueChips
            presets={HORIZON_CHIPS}
            value={inputs.lumpHorizonMonths ?? LUMP_HORIZON_DEFAULT}
            onChange={(n) => update({ lumpHorizonMonths: n })}
            groupLabel={t('decide.pay.horizonOver')}
            min={MIN_TERM}
            max={HORIZON_MAX}
            rangeText={t('decide.custom.range.horizon')}
            unitWord={t('decide.custom.unit.months')}
            formatPreset={(n) => (n % 12 === 0 && HORIZON_CHIPS.some((c) => c === n) ? t('decide.pay.horizonYears', { count: n / 12 }) : t('decide.custom.months', { count: n }))}
            readOnly={readOnly}
          />
        </>
      ) : null}
      {plan !== null || hasReturn ? (
        <OutputsTile>
          <PlanStrip plan={plan} whole={wholeFmt} exact={exactFmt} t={t} />
          <ProjectionNote props={props} />
        </OutputsTile>
      ) : null}
    </View>
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
  const plan = resolvedPlan(props, 'monthly');

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
      <ExpectedReturnField inputs={inputs} update={update} readOnly={props.readOnly} />
      {plan !== null || (term !== null && monthly !== null && monthly > 0) ? (
        <OutputsTile>
          <PlanStrip plan={plan} whole={wholeFmt} exact={exactFmt} t={t} />
          {term !== null && monthly !== null && monthly > 0 ? (
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>
              {t('decide.pay.noteInvestMonthly', { amount: exactFmt(monthly), count: term, total: wholeFmt(monthly * term) })}
            </Text>
          ) : null}
          <ProjectionNote props={props} />
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
