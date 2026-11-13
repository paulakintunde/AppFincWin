// 06.1-19 (D12, ARC-25, FIN-27, FIN-21): step 2, price and how you pay. Price and sales tax, "Price already includes tax" (on by
// default in the UK and EU), the region's tax as an estimate (never stored), Cash or Installments, one-off cost rows and the
// "Up front" card. Errors are inline and announced. The installment sheet writes CheckV2.pay; the stepper owns the write.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { percent as parsePercent, type Percent } from '@/engine/decide';
import { INCLUDED_COUNTRIES, lookupTaxDefault, maxCheckPrice, salesTaxOf, type LocalDate, type PayV2 } from '@/engine/decide/v3';
import { currencyCode, minorUnits } from '@/engine/money';
import { useCreateCheck } from '@/data/mutations/decideChecks';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { MoneyInput } from '@/ui/MoneyInput';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { AddYourOwnSheet } from '../sheets/AddYourOwnSheet';
import { DatePickerSheet } from '../sheets/DatePickerSheet';
import { InstallmentPlanSheet } from '../sheets/InstallmentPlanSheet';
import { Field, FieldLabel, Note } from '../sheets/sheetUi';
import { CheckNotFound } from '../ui/CheckNotFound';
import { NeedLine } from '../ui/NeedLine';
import { WaterfallCard, type WaterfallLine } from '../ui/WaterfallCard';
import { useCheckEngine } from '../engine/useCheckEngine';
import { StepFrame } from './StepFrame';
import { isStillSaving, StepStillSaving } from './StepStillSaving';
import { useOwnAdd } from './ownAdds';
import { kindOf, oneOffsOf, type BuiltInKind, stepHref, useStepCheck, useStepData, withPrefill, type StepNumber } from './useStepCheck';

/** A typed rate: up to two digits and four decimals; anything else is not taken. */
const TAX_TEXT = /^\d{0,2}([.,]\d{0,4})?$/;
const TAX_VALUE = /^\d{1,2}(\.\d{1,4})?$/;

/** A stored Percent back to field text ('7.5'): Percent is a scaled bigint, so go through its decimal digits. */
function percentText(p: Percent): string {
  const padded = p.toString().padStart(11, '0');
  const whole = padded.slice(0, padded.length - 10);
  const frac = padded.slice(padded.length - 10).replace(/0+$/, '');
  return frac === '' ? whole : `${whole}.${frac}`;
}

export function PriceStep({ id }: { id: string }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  // 06.1-52 (C-8): a check just created and not yet in the list opens from its queued row, as the answer does.
  const { pendingIds, pendingRows } = useCreateCheck();
  const fallback = React.useMemo(() => pendingRows.find((r) => r.id === id) ?? null, [pendingRows, id]);
  const step = useStepCheck(id, fallback);
  const data = useStepData();
  const fmt = useMoneyFormatter(false, data.currency);
  const engine = useCheckEngine(step.check, { checkId: id });
  const addOwn = useOwnAdd(step);
  const { check, name, status } = step;
  const [taxText, setTaxText] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [oneOffOpen, setOneOffOpen] = useState(false);
  const [datePick, setDatePick] = useState<{ current: LocalDate | null; set: (d: LocalDate) => void } | null>(null);

  React.useEffect(() => {
    if (status === 'ready') step.markVisited(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arrival
  }, [status, id]);

  if (isStillSaving(status, id, pendingIds)) return <StepStillSaving step={2} name={name} onBack={() => router.replace(stepHref(1, id, 'back'))} />;
  if (status === 'not_found') return <CheckNotFound />;
  if (status !== 'ready' || check === null) return null;

  const money = (n: number): string => fmt.formatMoney({ amount: minorUnits(n), currency: currencyCode(data.currency) });
  const country = data.country;
  const includedByDefault = country !== null && INCLUDED_COUNTRIES.includes(country);
  const included = check.taxIncluded ?? includedByDefault;
  const lookup = lookupTaxDefault({ country, subdivision: data.subdivision });
  const estimate = lookup.kind === 'add' ? lookup.percent : null;
  const effective: Percent | null = included ? null : (check.taxPercent ?? estimate);
  const price = check.price;
  const tooLarge = price !== null && price > maxCheckPrice(data.currency);
  const noPrice = price === null && touched;
  // 06.1-52 (C-11): a price of 0 does not move on, and says so.
  const zeroPrice = price === 0 && touched;
  const tax = price === null || effective === null ? 0 : salesTaxOf(price, effective);
  const fees = check.oneOffFees;
  const isPlan = check.pay.mode === 'plan';
  const deposit = check.pay.mode === 'plan' ? check.pay.deposit : 0;
  const upFront = isPlan ? deposit : (price ?? 0) + tax + fees;
  const monthly = engine.evaluation?.purchase?.monthly ?? null;
  const itemPrice = price === null ? name : t('decide.screens.stepper.itemPrice', { item: name, price: money(price) });
  const shownTax = taxText ?? (check.taxPercent === null ? '' : percentText(check.taxPercent));

  const setPrice = (v: number | null): void => step.update((c) => ({ ...c, price: v === null ? null : minorUnits(v) }));
  const setTax = (text: string): void => {
    if (!TAX_TEXT.test(text)) return;
    setTaxText(text);
    const norm = text.replace(',', '.');
    if (norm === '') step.update((c) => ({ ...c, taxPercent: null }));
    else if (TAX_VALUE.test(norm)) step.update((c) => ({ ...c, taxPercent: parsePercent(norm) }));
  };
  const usePlan = (pay: Extract<PayV2, { mode: 'plan' }>): void => {
    setPlanOpen(false);
    step.update((c) => ({ ...c, pay }));
  };

  const lines: WaterfallLine[] = isPlan
    ? [{ label: t('decide.screens.sheetsCosts.waterfall.cashDown'), amount: deposit, sign: '' }]
    : [
        { label: t('decide.screens.sheetsCosts.waterfall.price'), amount: price ?? 0, sign: '' },
        ...(tax > 0 && effective !== null
          ? [{ label: t('decide.screens.sheetsCosts.waterfall.tax', { percent: percentText(effective) }), amount: tax, sign: '+' as const }]
          : []),
        ...(fees > 0 ? [{ label: t('decide.screens.sheetsCosts.waterfall.fees'), amount: fees, sign: '+' as const }] : []),
      ];

  const next = (): void => {
    setTouched(true);
    if (price === null || price === 0 || tooLarge) return;
    router.replace(stepHref(3, id));
  };
  const seeNow = (): void => {
    setTouched(true);
    if (price === null || price === 0 || tooLarge) return;
    step.finish(2, (c) => withPrefill(c, name, data).check);
    // 06.1-49 (A-ST-3, D20): push, so Back from the answer returns to this step.
    router.push(`/decide/answer/${id}` as never);
  };
  const jump = (n: StepNumber): void => router.replace(stepHref(n, id, 'back'));
  const kind = kindOf(check, name);
  const kindLabel = kind === null ? null : kind.startsWith('own:') ? null : t(`decide.screens.stepper.kind.${kind as BuiltInKind}`);
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };

  return (
    <>
      <StepFrame
        step={2}
        title={t('decide.screens.stepper.price.title')}
        why={t('decide.screens.stepper.price.why')}
        meta={itemPrice}
        kindLabel={kindLabel}
        onBack={() => router.replace(stepHref(1, id, 'back'))}
        onJump={jump}
        onNext={next}
        nextDisabled={tooLarge}
        onSeeNow={seeNow}
      >
        <View style={styles.group}>
          <MoneyInput
            label={t('decide.screens.stepper.price.price')}
            accessibilityLabel={t('decide.screens.stepper.price.price')}
            currency={data.currency}
            value={price}
            onChange={setPrice}
            onBlur={() => setTouched(true)}
            large
          />
          {noPrice ? <Note tone="warn">{t('decide.v3.missing.no_price')}</Note> : null}
          {zeroPrice ? <NeedLine testID="price-need" text={t('decide.screens.common.need.priceAboveZero')} /> : null}
          {tooLarge ? <Note tone="warn">{t('decide.v3.missing.price_too_large')}</Note> : null}
        </View>

        <ToggleRow label={t('decide.screens.stepper.price.includesTax')} value={included} onChange={(v) => step.update((c) => ({ ...c, taxIncluded: v }))} />
        <Text style={small}>{t('decide.screens.stepper.price.includesTaxSub')}</Text>

        {included ? null : (
          <View style={styles.group}>
            <FieldLabel>{t('decide.screens.stepper.price.taxPercent')}</FieldLabel>
            <Field
              value={shownTax}
              onChangeText={setTax}
              accessibilityLabel={t('decide.screens.stepper.price.taxPercent')}
              placeholder={estimate === null ? undefined : percentText(estimate)}
              decimal
              maxLength={7}
            />
            {estimate !== null && check.taxPercent === null ? <Note>{t('decide.screens.stepper.price.taxEstimate')}</Note> : null}
            {estimate !== null ? <Note>{t('decide.screens.stepper.price.taxCheck')}</Note> : null}
            {lookup.kind === 'unknown' ? (
              <View testID="tax-not-included" style={[styles.soft, { backgroundColor: colors.fill6 }]}>
                <Text style={small}>{t('decide.v3.notice.tax_not_included')}</Text>
                <Pressable accessibilityRole="link" onPress={() => router.push('/you' as never)} style={styles.link}>
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.stepper.price.setRegion')}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}

        <View style={styles.group}>
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.stepper.price.howPay')}</Text>
          <Text style={small}>{t('decide.screens.stepper.price.howPaySub')}</Text>
          <SegmentedControl
            accessibilityLabel={t('decide.screens.stepper.price.howPay')}
            value={isPlan ? 'plan' : 'cash'}
            onChange={(key) => {
              if (key === 'plan') setPlanOpen(true);
              else step.update((c) => ({ ...c, pay: { mode: 'once' } }));
            }}
            options={[
              { key: 'cash', label: t('decide.screens.common.cash') },
              { key: 'plan', label: t('decide.screens.common.installments') },
            ]}
          />
          <Text testID="pay-summary" style={small}>
            {isPlan
              ? monthly === null
                ? t('decide.screens.stepper.price.cashUpFront', { amount: money(deposit) })
                : t('decide.screens.stepper.price.installmentsSummary', { amount: money(deposit), monthly: money(monthly) })
              : t('decide.screens.stepper.price.cashUpFront', { amount: money((price ?? 0) + tax + fees) })}
          </Text>
          {isPlan ? (
            <Pressable accessibilityRole="link" onPress={() => setPlanOpen(true)} style={styles.link}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.stepper.price.planDetails')}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.group}>
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.stepper.price.oneOffTitle')}</Text>
          {oneOffsOf(check).map((o) => (
            <View key={o.id} style={styles.rowBetween}>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{o.name}</Text>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, fontVariant: ['tabular-nums'] }}>{money(o.amount)}</Text>
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setOneOffOpen(true)} style={styles.link}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.stepper.price.addOneOff')}</Text>
          </Pressable>
        </View>

        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.stepper.price.upFrontTitle')}</Text>
        <WaterfallCard lines={lines} total={{ label: t('decide.screens.sheetsCosts.waterfall.upFront'), amount: upFront }} currency={data.currency} />
        {isPlan ? <Text style={small}>{t('decide.screens.stepper.price.planUpFrontNote')}</Text> : null}
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
  group: { gap: space.gapSm },
  soft: { borderRadius: space.cardPad, padding: space.cardPad, gap: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: space.gapMd },
});
