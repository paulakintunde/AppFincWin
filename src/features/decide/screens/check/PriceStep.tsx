// 06.1-19 (D12, ARC-25, FIN-27, FIN-21): step 2, price and how you pay. Price and sales tax, "Price already includes tax" (on by
// default in the UK and EU), the region's tax as an estimate (never stored), Cash or Installments, one-off cost rows and the
// "Up front" card. Errors are inline and announced. The installment sheet writes CheckV2.pay; the stepper owns the write.
// 06.1-57 (A-ST-1, A-ST-4, DS-18, X-4): the prototype's white cards (the boxed fields show on them; the page tone is the field tone).
// Price with the currency sign and tax with '%'. The pay choice is two cards with their figures ("$10,020 up front", "$1,000 down ·
// $408 a month"). One-off costs start with two preset rows: dealer fees (a switch; on opens an empty amount, only a typed amount
// counts) and the trade-in (the sale sheet). The Up front card shows the price once when nothing is added to it; with tax or fees
// it lists the price, each addition and the total. A plan's name from the plan sheet is written with the pay change, in one write.
// 06.1-60 (G-10, owner decision 4): the title "Price and how you pay" is the step's one line. The reason, the tax sub-lines (under the
// tax switch), "The answer shows both…" and the plan's up-front note each open under a Why?; NeedLines and warnings stay in view.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { percent as parsePercent, type Percent } from '@/engine/decide';
import { maxCheckPrice, type LocalDate, type PayV2, type Sale } from '@/engine/decide/v3';
import { currencyCode, minorUnits } from '@/engine/money';
import { useCreateCheck } from '@/data/mutations/decideChecks';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { ChoiceCard } from '@/ui/ChoiceCard';
import { hapticLight } from '@/ui/haptics';
import { MoneyInput } from '@/ui/MoneyInput';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { AddYourOwnSheet } from '../sheets/AddYourOwnSheet';
import { DatePickerSheet } from '../sheets/DatePickerSheet';
import { InstallmentPlanSheet } from '../sheets/InstallmentPlanSheet';
import { SaleSheet } from '../sheets/SaleSheet';
import { Field, FieldLabel, Note } from '../sheets/sheetUi';
import { CheckNotFound } from '../ui/CheckNotFound';
import { NeedLine } from '../ui/NeedLine';
import { WhyLine } from '../ui/WhyLine';
import { WaterfallCard, type WaterfallLine } from '../ui/WaterfallCard';
import { useCheckEngine } from '../engine/useCheckEngine';
import { StepFrame } from './StepFrame';
import { isStillSaving, StepStillSaving } from './StepStillSaving';
import { dealerFeesOf, withDealerFees } from './oneOffPresets';
import { useOwnAdd } from './ownAdds';
import { withPlanName } from './planName';
import { upFrontOf } from './upFront';
import { planPaymentOf } from '../logic/shownAnswer';
import { kindOf, oneOffsOf, ownKindsOf, type BuiltInKind, useStepCheck, useStepData, useStepNav, withPrefill, type StepNumber } from './useStepCheck';

/** You, scrolled to its Region row. */
const YOU_REGION = { pathname: '/you', params: { focus: 'region' } } as never;

/** A typed rate: up to two digits and four decimals; anything else is not taken. */
const TAX_TEXT = /^\d{0,2}([.,]\d{0,4})?$/;
const TAX_VALUE = /^\d{1,2}(\.\d{1,4})?$/;
/** The preset fee's amount field, wide enough for the currency sign and a four-figure amount. */
const PRESET_AMOUNT_WIDTH = 120;

/** A stored Percent back to field text ('7.5'): Percent is a scaled bigint, so go through its decimal digits. */
function percentText(p: Percent): string {
  const padded = p.toString().padStart(11, '0');
  const whole = padded.slice(0, padded.length - 10);
  const frac = padded.slice(padded.length - 10).replace(/0+$/, '');
  return frac === '' ? whole : `${whole}.${frac}`;
}

/** A white card, as the prototype groups each part of the step (cardP). */
function Card({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
      {children}
    </View>
  );
}

export function PriceStep({ id }: { id: string }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  // 06.1-52 (C-8): a check just created and not yet in the list opens from its queued row, as the answer does.
  const { pendingIds, pendingRows } = useCreateCheck();
  const fallback = React.useMemo(() => pendingRows.find((r) => r.id === id) ?? null, [pendingRows, id]);
  const step = useStepCheck(id, fallback);
  const nav = useStepNav(id, 2, step.flush);
  const data = useStepData();
  const fmt = useMoneyFormatter(false, data.currency);
  const engine = useCheckEngine(step.check, { checkId: id });
  const addOwn = useOwnAdd(step);
  const { check, name, status } = step;
  const [taxText, setTaxText] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [oneOffOpen, setOneOffOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [datePick, setDatePick] = useState<{ current: LocalDate | null; set: (d: LocalDate) => void } | null>(null);

  React.useEffect(() => {
    if (status === 'ready') step.markVisited(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arrival
  }, [status, id]);

  if (isStillSaving(status, id, pendingIds)) return <StepStillSaving step={2} name={name} onBack={nav.back} />;
  if (status === 'not_found') return <CheckNotFound />;
  if (status !== 'ready' || check === null) return null;

  const money = (n: number): string => fmt.formatMoney({ amount: minorUnits(n), currency: currencyCode(data.currency) });
  const up = upFrontOf(check, { country: data.country, subdivision: data.subdivision });
  const { included, estimate, effective, tax, fees } = up;
  const price = check.price;
  const tooLarge = price !== null && price > maxCheckPrice(data.currency);
  const noPrice = price === null && touched;
  // 06.1-52 (C-11): a price of 0 does not move on, and says so.
  const zeroPrice = price === 0 && touched;
  const isPlan = check.pay.mode === 'plan';
  const deposit = check.pay.mode === 'plan' ? check.pay.deposit : 0;
  const upFront = isPlan ? deposit : up.cash;
  // 06.1-82 (G-61-11): the plan payment alone; running costs are step 3's, never added into this step's figure.
  const monthly = planPaymentOf(engine.evaluation?.purchase);
  const itemPrice = price === null ? name : t('decide.screens.stepper.itemPrice', { item: name, price: money(price) });
  const shownTax = taxText ?? (check.taxPercent === null ? '' : percentText(check.taxPercent));
  const dealer = dealerFeesOf(check);
  const sale = check.replaces?.sale ?? null;

  const setPrice = (v: number | null): void => step.update((c) => ({ ...c, price: v === null ? null : minorUnits(v) }));
  const setTax = (text: string): void => {
    if (!TAX_TEXT.test(text)) return;
    setTaxText(text);
    const norm = text.replace(',', '.');
    if (norm === '') step.update((c) => ({ ...c, taxPercent: null }));
    else if (TAX_VALUE.test(norm)) step.update((c) => ({ ...c, taxPercent: parsePercent(norm) }));
  };
  // 06.1-57 (A-ST-7): the plan and its name land in one update, so one draft write carries both.
  const usePlan = (pay: Extract<PayV2, { mode: 'plan' }>, planName: string | null = null): void => {
    setPlanOpen(false);
    step.update((c) => withPlanName({ ...c, pay }, planName));
  };
  const setSale = (next: Sale | null): void => {
    const before = sale;
    step.update((c) => ({ ...c, replaces: { stops: c.replaces?.stops ?? [], sale: next } }));
    if (next !== null) {
      showToast({
        kind: 'destructive',
        text: { key: 'decide.screens.sheetsCosts.sale.toast', params: { amount: money(next.amount) } },
        onUndo: () => step.update((c) => ({ ...c, replaces: { stops: c.replaces?.stops ?? [], sale: before } })),
      });
    }
    setSaleOpen(false);
  };

  // DS-18: with nothing added the card shows the up-front figure once; with tax or fees it lists the price and each addition.
  const lines: WaterfallLine[] =
    isPlan || (tax === 0 && fees === 0)
      ? []
      : [
          { label: t('decide.screens.sheetsCosts.waterfall.price'), amount: price ?? 0, sign: '' },
          ...(tax > 0 && effective !== null
            ? [{ label: t('decide.screens.sheetsCosts.waterfall.tax', { percent: percentText(effective) }), amount: tax, sign: '+' as const }]
            : []),
          ...(fees > 0 ? [{ label: t('decide.screens.sheetsCosts.waterfall.fees'), amount: fees, sign: '+' as const }] : []),
        ];
  const taxNotAdded = !isPlan && !included && effective === null && up.unknownRegion;

  const next = (): void => {
    setTouched(true);
    if (price === null || price === 0 || tooLarge) return;
    router.replace(nav.to(3));
  };
  const seeNow = (): void => {
    setTouched(true);
    if (price === null || price === 0 || tooLarge) return;
    step.finish(2, (c) => withPrefill(c, name, data).check);
    nav.seeAnswer();
  };
  const jump = (n: StepNumber): void => router.replace(nav.to(n, 'back'));
  const kind = kindOf(check, name);
  const kindLabel =
    kind === null ? null : kind.startsWith('own:') ? (ownKindsOf(check).find((o) => `own:${o.id}` === kind)?.name ?? null) : t(`decide.screens.stepper.kind.${kind as BuiltInKind}`);
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const strong = { ...textRole(pairing, 'bodyStrong'), color: colors.ink };

  const cashLabel = t('decide.screens.common.cash');
  const planLabel = t('decide.screens.common.installments');
  const cashSub = price === null ? null : t('decide.screens.stepper.price.cashUpFront', { amount: money(up.cash) });
  const planSub = !isPlan
    ? null
    : monthly === null
      ? t('decide.screens.stepper.price.cashUpFront', { amount: money(deposit) })
      : t('decide.screens.stepper.price.installmentsSummary', { amount: money(deposit), monthly: money(monthly) });
  const subColor = (selected: boolean): string => (selected ? colors.inkSoft1 : colors.inkMuted);
  const dealerLabel = t('decide.screens.stepper.price.dealerFees');
  const tradeInLabel = t('decide.screens.stepper.price.tradeIn');
  const tradeInValue = sale === null ? t('decide.screens.stepper.running.sellingOff') : t('decide.screens.stepper.running.sellingAmount', { amount: money(sale.amount) });

  return (
    <>
      <StepFrame
        step={2}
        title={t('decide.screens.stepper.price.title')}
        why={t('decide.screens.stepper.price.why')}
        meta={itemPrice}
        kindLabel={kindLabel}
        onBack={nav.back}
        onJump={jump}
        onNext={next}
        nextDisabled={tooLarge}
        onSeeNow={seeNow}
      >
        <Card testID="price-card">
          <MoneyInput
            label={t('decide.screens.stepper.price.price')}
            accessibilityLabel={t('decide.screens.stepper.price.price')}
            currency={data.currency}
            value={price}
            onChange={setPrice}
            onBlur={() => setTouched(true)}
            prefix="symbol"
            large
          />
          {noPrice ? <Note tone="warn">{t('decide.v3.missing.no_price')}</Note> : null}
          {zeroPrice ? <NeedLine testID="price-need" text={t('decide.screens.common.need.priceAboveZero')} /> : null}
          {tooLarge ? <Note tone="warn">{t('decide.v3.missing.price_too_large')}</Note> : null}

          {included ? null : (
            <View style={styles.group}>
              <FieldLabel>{t('decide.screens.stepper.price.taxPercent')}</FieldLabel>
              <Field
                value={shownTax}
                onChangeText={setTax}
                accessibilityLabel={t('decide.screens.stepper.price.taxPercent')}
                placeholder={estimate === null ? undefined : percentText(estimate)}
                suffix="%"
                decimal
                maxLength={7}
              />
              {estimate !== null && check.taxPercent === null ? <Note>{t('decide.screens.stepper.price.taxEstimate')}</Note> : null}
            </View>
          )}

          <ToggleRow label={t('decide.screens.stepper.price.includesTax')} value={included} onChange={(v) => step.update((c) => ({ ...c, taxIncluded: v }))} />
          {/* 06.1-60 (G-10): the tax sub-lines sit under the switch's Why?; "Tax not added" stays in view on the Up front card. */}
          <WhyLine testID="tax-why">
            <Text style={small}>{t('decide.screens.stepper.price.includesTaxSub')}</Text>
            {!included && estimate !== null ? <Text style={small}>{t('decide.screens.stepper.price.taxCheck')}</Text> : null}
            {!included && up.unknownRegion ? (
              <View testID="tax-not-included" style={[styles.soft, { backgroundColor: colors.fill6 }]}>
                <Text style={small}>{t('decide.v3.notice.tax_not_included')}</Text>
                {/* 06.1-71 (CN-10, OQ-71-1 B): You, scrolled to the Region row, where the state or province is set. */}
                <Pressable testID="set-region" accessibilityRole="link" onPress={() => router.push(YOU_REGION)} style={styles.link}>
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.stepper.price.setRegion')}</Text>
                </Pressable>
              </View>
            ) : null}
          </WhyLine>
        </Card>

        <Card testID="pay-card">
          <Text style={strong}>{t('decide.screens.stepper.price.howPay')}</Text>
          <WhyLine testID="pay-why">{t('decide.screens.stepper.price.howPaySub')}</WhyLine>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.stepper.price.howPay')} style={styles.payRow}>
            <View style={styles.payCell}>
              <ChoiceCard
                selected={!isPlan}
                title={cashLabel}
                accessibilityLabel={cashSub === null ? cashLabel : `${cashLabel}, ${cashSub}`}
                onPress={() => step.update((c) => ({ ...c, pay: { mode: 'once' } }))}
              >
                {cashSub === null ? null : (
                  <Text testID="pay-cash-sub" style={{ ...small, color: subColor(!isPlan) }}>
                    {cashSub}
                  </Text>
                )}
              </ChoiceCard>
            </View>
            <View style={styles.payCell}>
              <ChoiceCard selected={isPlan} title={planLabel} accessibilityLabel={planSub === null ? planLabel : `${planLabel}, ${planSub}`} onPress={() => setPlanOpen(true)}>
                {planSub === null ? null : (
                  <Text testID="pay-plan-sub" style={{ ...small, color: subColor(isPlan) }}>
                    {planSub}
                  </Text>
                )}
              </ChoiceCard>
            </View>
          </View>
          {isPlan ? (
            <Pressable accessibilityRole="link" onPress={() => setPlanOpen(true)} style={styles.link}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.stepper.price.planDetails')}</Text>
            </Pressable>
          ) : null}
        </Card>

        <Card testID="one-off-card">
          <Text style={strong}>{t('decide.screens.stepper.price.oneOffTitle')}</Text>
          {/* T-06.1-57-01: the preset starts off with no amount; nothing counts until the user types one. */}
          <ToggleRow
            label={dealerLabel}
            value={dealer.on}
            onChange={(v) => {
              hapticLight();
              step.update((c) => withDealerFees(c, { on: v, amount: dealerFeesOf(c).amount }));
            }}
          />
          {dealer.on ? (
            <View style={styles.presetAmount}>
              <MoneyInput
                label={dealerLabel}
                accessibilityLabel={`${dealerLabel}, ${t('decide.screens.common.amount')}`}
                currency={data.currency}
                value={dealer.amount}
                onChange={(v) => step.update((c) => withDealerFees(c, { on: true, amount: v }))}
                prefix="symbol"
                amountField={{ width: PRESET_AMOUNT_WIDTH }}
              />
              {dealer.amount === null ? <NeedLine testID="dealer-fees-need" text={t('decide.screens.common.need.amount')} /> : null}
            </View>
          ) : null}
          <Pressable
            testID="trade-in-row"
            accessibilityRole="button"
            accessibilityLabel={`${tradeInLabel}, ${tradeInValue}`}
            onPress={() => setSaleOpen(true)}
            style={[styles.rowBetween, styles.touch, styles.rule, { borderTopColor: colors.line1 }]}
          >
            <View style={styles.shrink}>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{tradeInLabel}</Text>
              <Text style={small}>{t('decide.screens.stepper.price.tradeInSub')}</Text>
            </View>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{tradeInValue}</Text>
          </Pressable>
          {oneOffsOf(check).map((o) => (
            <View key={o.id} style={[styles.rowBetween, styles.rule, { borderTopColor: colors.line1 }]}>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{o.name}</Text>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, fontVariant: ['tabular-nums'] }}>{money(o.amount)}</Text>
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setOneOffOpen(true)} style={styles.link}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.stepper.price.addOneOff')}</Text>
          </Pressable>
        </Card>

        <Card testID="up-front-card">
          <Text style={strong}>{t('decide.screens.stepper.price.upFrontTitle')}</Text>
          <WaterfallCard lines={lines} total={{ label: t('decide.screens.sheetsCosts.waterfall.upFront'), amount: upFront }} currency={data.currency} />
          {taxNotAdded ? (
            <Text testID="tax-not-added" style={small}>
              {t('decide.screens.stepper.price.taxNotAdded')}
            </Text>
          ) : null}
          {isPlan ? <WhyLine testID="up-front-why">{t('decide.screens.stepper.price.planUpFrontNote')}</WhyLine> : null}
        </Card>
      </StepFrame>

      <InstallmentPlanSheet
        visible={planOpen}
        check={check}
        currency={data.currency}
        today={data.today}
        itemKind={kind === 'car' ? 'car' : kind === 'tech' ? 'laptop' : 'other'}
        editing={isPlan}
        formatMoney={money}
        formatDate={(d) => fmt.formatDate(d)}
        onPickDate={(current, set) => setDatePick({ current, set })}
        onUse={usePlan}
        onDismiss={() => setPlanOpen(false)}
      />
      <DatePickerSheet
        visible={datePick !== null}
        check={{ ...check, purchaseDate: datePick?.current ?? check.purchaseDate ?? null }}
        today={data.today}
        paydays={[]}
        locale={fmt.locale}
        formatDate={(d) => fmt.formatDate(d)}
        onUse={(d) => {
          datePick?.set(d);
          setDatePick(null);
        }}
        onDismiss={() => setDatePick(null)}
      />
      <SaleSheet visible={saleOpen} currency={data.currency} today={data.today} sale={sale} debts={data.debts} onSave={setSale} onClose={() => setSaleOpen(false)} />
      <AddYourOwnSheet
        visible={oneOffOpen}
        variant="oneOff"
        currency={data.currency}
        today={data.today}
        bills={data.billChoices}
        categories={data.categories}
        existingKindCount={0}
        onAdd={(add) => {
          setOneOffOpen(false);
          addOwn(add);
        }}
        onClose={() => setOneOffOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPad, gap: space.gapSm },
  group: { gap: space.gapSm },
  soft: { borderRadius: space.cardPad, padding: space.cardPad, gap: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.gapSm },
  touch: { minHeight: space.touchMin },
  shrink: { flexShrink: 1 },
  // Two equal cards that wrap under each other when the text is large, never squeezed.
  payRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  payCell: { flexGrow: 1, flexBasis: 140 },
  presetAmount: { alignItems: 'flex-end', gap: space.gapSm },
});
