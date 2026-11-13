// 06.1-19 (D13, D-24, FIN-28, UX-41): step 3, running costs and what stops. Lines start from a matching recorded bill, else from the
// dated "quick estimates" table (prefillRunningCosts); each can be switched off, re-timed and edited. A card lists costs that stop
// when you buy and the sale of the old one. The total shows a monthly figure and what a usual month leaves, from the engine.
// 06.1-55 (A-RC-1): the before/after line compares a usual month (the month picture's usual LEFT) with a usual month once the
// costs start (afterBuy.usualMonth), never this month after plans against a usual month.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { LocalDate, RunningCostLine, Sale } from '@/engine/decide/v3';
import { currencyCode, minorUnits } from '@/engine/money';
import { useCreateCheck } from '@/data/mutations/decideChecks';
import { useT } from '@/i18n';
import { showToast } from '@/state/undoToast';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { hapticLight } from '@/ui/haptics';
import { MoneyInput } from '@/ui/MoneyInput';
import { StackedBar, wholePercents, type StackedSegment } from '@/ui/StackedBar';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { AddYourOwnSheet, type OwnVariant } from '../sheets/AddYourOwnSheet';
import { DatePickerSheet } from '../sheets/DatePickerSheet';
import { HowOftenSheet, type HowOftenValue } from '../sheets/HowOftenSheet';
import { SaleSheet } from '../sheets/SaleSheet';
import { useCheckEngine } from '../engine/useCheckEngine';
import { useMonthPicture } from '../engine/useMonthPicture';
import { CheckNotFound } from '../ui/CheckNotFound';
import { NeedLine } from '../ui/NeedLine';
import { StepFrame } from './StepFrame';
import { isStillSaving, StepStillSaving } from './StepStillSaving';
import { useOwnAdd } from './ownAdds';
import { kindOf, lineNamesOf, type BuiltInKind, useStepCheck, useStepData, useStepNav, withPrefill, type StepNumber } from './useStepCheck';

type LabelKey = 'insurance' | 'fuel' | 'maintenance' | 'registration' | 'lossOfValue';
const LABEL_OF_KEY: Readonly<Record<string, LabelKey>> = { insurance: 'insurance', fuel: 'fuel', maintenance: 'maintenance', registration: 'registration', value_loss: 'lossOfValue' };
const SWATCH_OF_KEY: Readonly<Record<string, StackedSegment['swatch']>> = { insurance: 'blue', fuel: 'slate', maintenance: 'teal', registration: 'rust', value_loss: 'ochre' };

const monthlyOf = (amount: number, everyMonths: number): number => Math.round(amount / everyMonths);

/** 06.1-52 (C-16): a line whose amount was cleared. It is held here, out of the stored check, until it has an amount again. */
interface HeldLine {
  line: RunningCostLine;
  index: number;
}

/** The stored lines with the held (cleared) ones back in their places, for drawing. */
export function linesWithHeld(stored: readonly RunningCostLine[], held: Readonly<Record<string, HeldLine>>): { line: RunningCostLine; cleared: boolean }[] {
  const out = stored.map((line) => ({ line, cleared: false }));
  for (const h of Object.values(held).sort((a, b) => a.index - b.index)) out.splice(Math.min(h.index, out.length), 0, { line: h.line, cleared: true });
  return out;
}

export function CostsStep({ id }: { id: string }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  // 06.1-52 (C-8): a check just created and not yet in the list opens from its queued row, as the answer does.
  const { pendingIds, pendingRows } = useCreateCheck();
  const fallback = useMemo(() => pendingRows.find((r) => r.id === id) ?? null, [pendingRows, id]);
  const step = useStepCheck(id, fallback);
  const nav = useStepNav(id, 3, step.flush);
  const data = useStepData();
  const fmt = useMoneyFormatter(false, data.currency);
  const engine = useCheckEngine(step.check, { checkId: id });
  const { picture } = useMonthPicture();
  const addOwn = useOwnAdd(step);
  const { check, name, status } = step;
  const [often, setOften] = useState<string | null>(null);
  const [own, setOwn] = useState<OwnVariant | null>(null);
  const [saleOpen, setSaleOpen] = useState(false);
  const [datePick, setDatePick] = useState<{ current: LocalDate | null; set: (d: LocalDate | null) => void } | null>(null);
  const [held, setHeld] = useState<Record<string, HeldLine>>({});

  // The table or the matching bills start the lines once; after that the user's switches and edits stand.
  const needsPrefill = status === 'ready' && check !== null && data.status !== 'loading' && withPrefill(check, name, data).lines.length > 0;
  useEffect(() => {
    if (status === 'ready') step.markVisited(3);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arrival
  }, [status, id]);
  useEffect(() => {
    if (needsPrefill) step.update((c) => withPrefill(c, name, data).check);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs only while the lines have not started
  }, [needsPrefill]);

  if (isStillSaving(status, id, pendingIds)) return <StepStillSaving step={3} name={name} onBack={nav.back} />;
  if (status === 'not_found') return <CheckNotFound />;
  if (status !== 'ready' || check === null) return null;

  const money = (n: number): string => fmt.formatMoney({ amount: minorUnits(n), currency: currencyCode(data.currency) });
  const speak = (n: number): string => fmt.formatMoneyA11y({ amount: minorUnits(n), currency: currencyCode(data.currency) });
  const lines = check.runningCosts ?? [];
  const names = lineNamesOf(check);
  const nameOf = (l: RunningCostLine): string => {
    const key = l.id.startsWith('rc:') ? l.id.slice(3) : null;
    const label = key === null ? undefined : LABEL_OF_KEY[key];
    return label !== undefined ? t(`decide.screens.stepper.running.${label}`) : (names[l.id] ?? t('decide.screens.stepper.running.addRunning'));
  };
  const quick = (check.quickLines ?? []).filter((q): q is Extract<typeof q, { kind: 'expense' }> => q.kind === 'expense' && q.everyMonths !== 0);
  const everyLabel = (e: number): string => t(e === 12 ? 'decide.screens.stepper.running.yearly' : e === 3 ? 'decide.screens.stepper.running.every3Months' : 'decide.screens.stepper.running.monthly');
  const a11yKey = (e: number) => (e === 12 ? 'amountYearlyA11y' : e === 3 ? 'amountQuarterlyA11y' : null);

  const shown = linesWithHeld(lines, held);
  const patchLine = (lineId: string, patch: Partial<RunningCostLine>): void => {
    const h = held[lineId];
    if (h !== undefined) {
      setHeld((all) => ({ ...all, [lineId]: { ...h, line: { ...h.line, ...patch } } }));
      return;
    }
    step.update((c) => ({ ...c, runningCosts: (c.runningCosts ?? []).map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }));
  };
  // 06.1-52 (C-16, T-06.1-52-02): a cleared amount stays empty and is never stored as 0. The line leaves the stored check (so the
  // total and the answer leave it out) and comes back in its place once an amount is typed.
  const setAmount = (lineId: string, minor: number | null): void => {
    const h = held[lineId];
    if (minor === null) {
      if (h !== undefined) return;
      const index = lines.findIndex((l) => l.id === lineId);
      const line = lines[index];
      if (line === undefined) return;
      setHeld((all) => ({ ...all, [lineId]: { line, index: shown.findIndex((s) => s.line.id === lineId) } }));
      step.update((c) => ({ ...c, runningCosts: (c.runningCosts ?? []).filter((l) => l.id !== lineId) }));
      return;
    }
    if (h === undefined) {
      patchLine(lineId, { amount: minorUnits(minor) });
      return;
    }
    setHeld((all) => {
      const rest = { ...all };
      delete rest[lineId];
      return rest;
    });
    // Back in the place it was drawn in: after the stored lines that were drawn before it.
    const before = shown.slice(0, shown.findIndex((s) => s.line.id === lineId)).filter((s) => !s.cleared).length;
    step.update((c) => {
      const next = [...(c.runningCosts ?? [])];
      next.splice(Math.min(before, next.length), 0, { ...h.line, amount: minorUnits(minor) });
      return { ...c, runningCosts: next };
    });
  };

  const onLines = lines.filter((l) => l.on);
  const parts = [
    ...onLines.map((l) => ({ key: l.id, name: nameOf(l), value: monthlyOf(l.amount, l.everyMonths), swatch: SWATCH_OF_KEY[l.id.slice(3)] ?? ('plum' as const) })),
    ...quick.map((q) => ({ key: q.id, name: q.name, value: monthlyOf(q.amount, q.everyMonths), swatch: 'green' as const })),
  ].filter((p) => p.value > 0);
  const monthly = parts.reduce((a, p) => a + p.value, 0);
  const percents = wholePercents(parts.map((p) => p.value));
  const legend = parts.map((p, i) => t('decide.screens.stepper.running.percentLegend', { name: p.name, percent: percents[i] ?? 0 })).join(' · ');
  // 06.1-55 (A-RC-1): a usual month against a usual month. before is the month picture's usual LEFT (no purchase); after is the
  // engine's usual month once the costs (and any plan payment) start. With either missing there is no line, never a mixed pair.
  const before = picture?.usual?.left ?? null;
  const afterFigure = engine.evaluation?.result.afterBuy.usualMonth ?? null;
  const share = before !== null && before > 0 ? Math.round((monthly * 100) / Number(before)) : null;

  const sale = check.replaces?.sale ?? null;
  const stops = check.replaces?.stops ?? [];
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

  const finishNow = (from: StepNumber): void => {
    step.finish(from, (c) => withPrefill(c, name, data).check);
    nav.seeAnswer();
  };
  const kind = kindOf(check, name);
  const kindLabel = kind === null || kind.startsWith('own:') ? null : t(`decide.screens.stepper.kind.${kind as BuiltInKind}`);
  const price = check.price === null ? '' : money(check.price);
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const oftenLine = often === null ? null : (shown.find((s) => s.line.id === often)?.line ?? null);
  const oftenValue: HowOftenValue | null = oftenLine === null ? null : { everyMonths: oftenLine.everyMonths, start: oftenLine.start === data.today ? null : oftenLine.start, end: oftenLine.end };

  return (
    <>
      <StepFrame
        step={3}
        title={t('decide.screens.stepper.running.title')}
        why={t('decide.screens.stepper.running.why')}
        meta={price === '' ? name : t('decide.screens.stepper.itemPrice', { item: name, price })}
        kindLabel={kindLabel}
        onBack={nav.back}
        onJump={(n) => router.replace(nav.to(n, 'back'))}
        onNext={() => finishNow(3)}
      >
        <Text style={small}>{t('decide.screens.stepper.running.sub')}</Text>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.stepper.running.startTitle')}</Text>

        {shown.map(({ line: l, cleared }) => {
          const label = nameOf(l);
          const unusual = a11yKey(l.everyMonths);
          const a11y: string = cleared
            ? `${label}, ${t('decide.screens.common.amount')}`
            : unusual === null
              ? t('decide.screens.common.a11y.amountMonthly', { name: label, amount: speak(l.amount) })
              : t(`decide.screens.stepper.running.${unusual}`, { name: label, amount: speak(l.amount) });
          return (
            <View key={l.id} testID={`cost-${l.id}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
              <ToggleRow
                label={label}
                value={l.on}
                onChange={(v) => {
                  hapticLight();
                  patchLine(l.id, { on: v });
                }}
              />
              <View style={styles.rowBetween}>
                <Chip label={everyLabel(l.everyMonths)} accessibilityLabel={`${t('decide.screens.common.howOften')}, ${everyLabel(l.everyMonths)}`} onPress={() => setOften(l.id)} />
                <MoneyInput
                  label={label}
                  accessibilityLabel={a11y}
                  currency={data.currency}
                  value={cleared ? null : l.amount}
                  onChange={(v) => setAmount(l.id, v)}
                  amountField={{ width: 96 }}
                />
              </View>
              {cleared ? <NeedLine testID={`cost-need-${l.id}`} text={t('decide.screens.common.need.amount')} /> : null}
            </View>
          );
        })}
        {quick.map((q) => (
          <View key={q.id} style={styles.rowBetween}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{q.name}</Text>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, fontVariant: ['tabular-nums'] }}>{money(q.amount)}</Text>
          </View>
        ))}
        <Pressable accessibilityRole="button" onPress={() => setOwn('running')} style={styles.link}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.stepper.running.addRunning')}</Text>
        </Pressable>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }]}>
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.stepper.running.stopsTitle')}</Text>
          <Pressable
            testID="sale-row"
            accessibilityRole="button"
            accessibilityLabel={`${t('decide.screens.stepper.running.selling')}, ${sale === null ? t('decide.screens.stepper.running.sellingOff') : t('decide.screens.stepper.running.sellingOn')}`}
            onPress={() => setSaleOpen(true)}
            style={[styles.rowBetween, styles.touch]}
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{t('decide.screens.stepper.running.selling')}</Text>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
              {sale === null ? t('decide.screens.stepper.running.sellingOff') : t('decide.screens.stepper.running.sellingAmount', { amount: money(sale.amount) })}
            </Text>
          </Pressable>
          {stops.map((s) => (
            <View key={s.id} style={styles.rowBetween}>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 1 }}>{names[s.id] ?? t('decide.screens.stepper.running.stopFallback')}</Text>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, fontVariant: ['tabular-nums'] }}>{money(monthlyOf(s.amount, s.everyMonths))}</Text>
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setOwn('stop')} style={styles.link}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('decide.screens.stepper.running.addStop')}</Text>
          </Pressable>
        </View>

        <View testID="costs-total" style={[styles.card, { backgroundColor: colors.fill6, borderColor: colors.line1 }]}>
          {parts.length === 0 ? (
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.stepper.running.noneOn')}</Text>
          ) : (
            <>
              <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink, fontVariant: ['tabular-nums'] }}>
                {t('decide.screens.stepper.running.totalTitle', { monthly: money(monthly) })}
              </Text>
              <StackedBar
                segments={parts.map((p) => ({ key: p.key, value: p.value, swatch: p.swatch }))}
                legend={legend}
                accessibilityLabel={t('decide.screens.stepper.running.totalTitle', { monthly: speak(monthly) })}
              />
              <Text style={small}>{legend}</Text>
              {share === null ? null : <Text style={small}>{t('decide.screens.stepper.running.totalShare', { percent: share })}</Text>}
            </>
          )}
          {before === null || afterFigure === null ? null : (
            <Text testID="costs-total-after" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
              {t('decide.screens.stepper.running.totalAfter', { before: money(before), after: money(afterFigure) })}
            </Text>
          )}
          <Text style={small}>{t('decide.screens.stepper.running.totalQuick')}</Text>
          <Text style={small}>{t('decide.screens.stepper.running.yearlyNote')}</Text>
        </View>
      </StepFrame>

      {oftenValue === null || oftenLine === null ? null : (
        <HowOftenSheet
          visible
          value={oftenValue}
          amount={oftenLine.amount}
          formatMoney={money}
          formatDate={(d) => fmt.formatDate(d)}
          onPickDate={(_which, current, set) => setDatePick({ current, set })}
          onSave={(v) => {
            patchLine(oftenLine.id, { everyMonths: v.everyMonths, start: v.start ?? data.today, end: v.end });
            setOften(null);
          }}
          onDismiss={() => setOften(null)}
        />
      )}
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
        visible={own !== null}
        variant={own ?? 'running'}
        currency={data.currency}
        today={data.today}
        bills={data.billChoices}
        categories={data.categories}
        existingKindCount={0}
        onAdd={(add) => {
          setOwn(null);
          addOwn(add);
        }}
        onClose={() => setOwn(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: space.cardPad, borderWidth: 1, padding: space.cardPad, gap: space.gapSm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
  touch: { minHeight: space.touchMin },
  link: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
