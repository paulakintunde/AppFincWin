/**
 * 06.1-21 (D01, D02, D01c, D01s, D30, D30d; APP-09, UX-02, UX-30, UX-29): Decide home. Header with Past decisions, the setup banner
 * while setup is open, the offline or error card, the Check it card (always on screen), example chips, Your month, Open checks, Your
 * money rules, Something changed? and the footer. Check it builds a draft check and routes it (useNewCheck): a big buy to the
 * stepper, everything else to the answer, a home nowhere (D-02). The examples fill the fields only (D-15).
 * 06.1-56 (G-8, H-9): laid out as the prototype (D01/D02): no FAB on this tab, keyboard taps pass through to Check it, short dates on
 * the When? chips, an example scrolls the card into view, the card starts fresh once a check's route opens, and Check it waits for
 * the engine inputs so the stepper-or-answer route never depends on load state.
 */
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useIsFocused, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCategories } from '@/data/queries/categories';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import type { LocalDate, PayV2, QuickLine } from '@/engine/decide/v3';
import { currencyCode, currencyExponent, minorUnits } from '@/engine/money';
import { perfMark } from '@/features/decide/perf/perfMarks';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useHideFab } from '@/shell/fab/FabProvider';
import { TabRootScreen } from '@/shell/screen/TabRootScreen';
import type { TabRootScrollHandle } from '@/shell/screen/useTabRootChrome';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { hapticSelection } from '@/ui/haptics';
import { useAmountParser } from '@/ui/money/useAmountParser';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Text } from '@/ui/Text';
import type { TextInput as TextInputInstance } from '@/ui/TextInput';
import { showToast } from '@/state/undoToast';
import { parseQuick } from '../../quickParse';
import { ErrorCard, OfflineCard } from '../answer/StatusCards';
import { useMonthPicture } from '../engine/useMonthPicture';
import { isHomeWords, readKind, readsAsPlan, type ItemKind } from '../logic/kindWords';
import { DatePickerSheet } from '../sheets/DatePickerSheet';
import { InstallmentPlanSheet, type PlanItemKind } from '../sheets/InstallmentPlanSheet';
import { QuickEstimateSheet } from '../sheets/QuickEstimateSheet';
import type { QuickLineKind } from '../sheets/quickLineKinds';
import { SetupBanner } from '../setup/SetupBanner';
import { SETUP_ROUTES } from '../setup/SetupChecklist';
import { useSetupProgress } from '../setup/useSetupProgress';
import { useSetupText } from '../setup/useSetupText';
import { AddRuleSheet } from './AddRuleSheet';
import { CheckCard, type ReadsAs } from './CheckCard';
import { MoneyRulesCard, type RuleTarget } from './MoneyRulesCard';
import { MoreDetails, type PayChoice, type PurposeChoice } from './MoreDetails';
import { OpenCheckSheet } from './OpenCheckSheet';
import { OpenChecksCard } from './OpenChecksCard';
import { RuleEditSheet } from './RuleEditSheet';
import { SomethingChanged } from './SomethingChanged';
import { taxNoteFor } from './taxNote';
import { buildCheck, useNewCheck, type NewCheckFields, type WhenChoice } from './useNewCheck';
import { useMoneyRules, useOpenCheckRows, useRuleCrossings } from './useHomeCards';
import { footerFactsOf, rulesFactsOf, usePastCount, useSetupDoneSeen } from './useHomeFacts';
import { monthNameOf, YourMonthCard } from './YourMonthCard';

const MAX_QUICK_LINES = 8;
/** Design examples, in whole units of the home currency (D-15): they fill the fields and nothing else. */
const EXAMPLES: readonly { key: 'headphones' | 'laptop' | 'usedCar'; whole: number }[] = [
  { key: 'headphones', whole: 180 },
  { key: 'laptop', whole: 3500 },
  { key: 'usedCar', whole: 9000 },
];

/** 06.1-56 (A-HOME-4): short dates for the When? chips and the open-check rows ("Thu, Nov 12", "Nov 15"), built once per locale. */
function shortDateFormatters(locale: string): { weekday: (d: string) => string; dayMonth: (d: string) => string } {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dayMonth = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const at = (d: string): number => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return { weekday: (d) => weekday.format(at(d)), dayMonth: (d) => dayMonth.format(at(d)) };
}

/** Space left above the check card when an example scrolls it into view. */
const SCROLL_MARGIN = 8;

const planItemKind = (kind: ItemKind | null): PlanItemKind => (kind === 'car' ? 'car' : kind === 'tech' ? 'laptop' : 'other');

function PastPill({ count, onPress }: { count: number; onPress: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      testID="past-pill"
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? t('decide.screens.home.pastDecisionsA11y', { count }) : t('decide.screens.home.pastDecisions')}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={[styles.pill, { borderColor: colors.line4 }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t('decide.screens.home.pastDecisions')}</Text>
      {count > 0 ? (
        <View testID="past-badge" style={[styles.badge, { backgroundColor: colors.fill1 }]}>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.ink }}>{String(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function DecideHome() {
  const t = useT();
  const router = useRouter();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const v3 = useDecideV3();
  const sync = useSyncStatus();
  const { picture, bars } = useMonthPicture();
  const inputs = v3.inputs;
  const currency = inputs?.currency ?? rc.homeCurrency;
  const fmt = useMoneyFormatter(false, currency);
  const parser = useAmountParser();
  const newCheck = useNewCheck();
  // 06.1-56 (A-HOME-3): the prototype has no + Add button on Decide; it is hidden while this tab is focused.
  const isFocused = useIsFocused();
  useHideFab('decide', isFocused);

  const money = useCallback((n: number): string => fmt.formatMoney({ amount: minorUnits(n), currency: currencyCode(currency) }), [fmt, currency]);
  const moneySpoken = useCallback((n: number): string => fmt.formatMoneyA11y({ amount: minorUnits(n), currency: currencyCode(currency) }), [fmt, currency]);
  const dateText = useCallback((d: string): string => fmt.formatDate(d), [fmt]);
  const short = useMemo(() => shortDateFormatters(fmt.locale), [fmt.locale]);

  // ── the check being typed ─────────────────────────────────────────────────────────────────────────────────────────
  const textRef = useRef<TextInputInstance | null>(null);
  const registerWhat = useCallback((el: TextInputInstance | null): void => {
    textRef.current = el;
  }, []);
  const [text, setText] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  // 06.1-52 (C-18): the price field's raw text, so the hint can tell "no price yet" from "that did not read as an amount".
  const [priceText, setPriceText] = useState('');
  // 06.1-52 (C-18): Check it was tapped before the user and household loaded.
  const [loadingTap, setLoadingTap] = useState(false);
  const [when, setWhen] = useState<WhenChoice>('today');
  const [payMode, setPayMode] = useState<PayChoice>('once');
  const [plan, setPlan] = useState<Extract<PayV2, { mode: 'plan' }> | null>(null);
  const [purpose, setPurpose] = useState<PurposeChoice>(null);
  const [quickLines, setQuickLines] = useState<readonly QuickLine[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [quick, setQuick] = useState<{ kind: QuickLineKind; line?: QuickLine } | null>(null);
  const [datePick, setDatePick] = useState<{ current: LocalDate | null; set: (d: LocalDate) => void } | null>(null);

  const nextPayday = picture?.payday ?? null;
  const fields: NewCheckFields = useMemo(() => ({ text, price, when, payMode, plan, purpose, quickLines }), [text, price, when, payMode, plan, purpose, quickLines]);
  const country = inputs?.region ?? rc.region;
  // 06.1-47 (B-6, ANR): the previews (the "Reads as" line, the tax note and the draft the sheets judge) follow deferred copies
  // of the typed words and price, so a keystroke paints the field first and the parse runs in a background render React can
  // drop. The fields themselves and Check it always use the live values.
  const deferredText = useDeferredValue(text);
  const deferredPrice = useDeferredValue(price);
  const previewFields: NewCheckFields = useMemo(
    () => ({ text: deferredText, price: deferredPrice, when, payMode, plan, purpose, quickLines }),
    [deferredText, deferredPrice, when, payMode, plan, purpose, quickLines],
  );
  const draft = useMemo(() => buildCheck(previewFields, { country, nextPayday }), [previewFields, country, nextPayday]);

  const home = isHomeWords(text);
  const kind = readKind(text);
  const kindWord = kind === null || kind === 'home' ? null : t(`decide.screens.stepper.kind.${kind}`);
  const ready = text.trim() !== '' && price !== null && price > 0 && !home;
  // 06.1-56 (H-9, CN-6): Check it waits for the engine inputs, so the route uses the loaded thresholds and region only.
  const inputsLoading = inputs === null;
  // 06.1-52 (C-18, G-5): the NeedLine under Check it names the one missing part; home words have their own note.
  const needHint: string | null =
    newCheck.pending || home
      ? null
      : text.trim() === ''
        ? t('decide.screens.home.need.what')
        : price === 0
          ? t('decide.screens.common.need.priceAboveZero')
          : price !== null
            ? null
            : priceText.trim() === ''
              ? t('decide.screens.home.need.price')
              : t('decide.screens.home.need.priceUnread');
  const recordsLoaded = rc.userId !== null && rc.householdId !== null;
  const hint = needHint ?? ((loadingTap && !recordsLoaded) || (ready && inputsLoading) ? t('decide.screens.common.need.loading') : null);

  const parsed = useMemo(
    () =>
      parseQuick(deferredText, (s) => {
        const r = parser.parse(s, currency);
        return r.ok ? r.value : null;
      }),
    [deferredText, parser, currency],
  );
  const methodWord = payMode === 'plan' || (parsed !== null && readsAsPlan(deferredText)) ? t('decide.screens.common.installments') : t('decide.screens.common.cash');
  const reads: ReadsAs | null =
    parsed !== null && deferredPrice === null && !isHomeWords(deferredText)
      ? { name: parsed.name, priceText: money(parsed.price), whenText: when === 'today' ? t('decide.screens.home.check.today') : when === 'payday' && nextPayday !== null ? dateText(nextPayday) : typeof when === 'object' ? dateText(when.date) : t('decide.screens.home.check.today'), payText: methodWord }
      : null;

  const tax = taxNoteFor({ price: deferredPrice ?? parsed?.price ?? null, country, subdivision: inputs?.regionSubdivision ?? null });
  const taxNote =
    tax === null
      ? null
      : tax.kind === 'unknown'
        ? t('decide.screens.home.check.taxNotIncluded')
        : tax.kind === 'added'
          ? t('decide.screens.home.check.taxAdded')
          : t('decide.screens.home.check.taxEstimate', { amount: money(tax.amount) });

  const todayText = short.weekday(rc.today);
  const paydayText = nextPayday !== null && nextPayday >= rc.today ? short.dayMonth(nextPayday) : null;

  // 06.1-56 (H-9, FQ3, CC-1): once a new check's route opens, the card starts fresh and keeps none of the last check's choices,
  // so coming back and tapping Check it makes no duplicate.
  const startFresh = (): void => {
    setText('');
    setPrice(null);
    setPriceText('');
    setWhen('today');
    setPayMode('once');
    setPlan(null);
    setPurpose(null);
    setQuickLines([]);
    setMoreOpen(false);
  };

  const check = (): void => {
    if (!ready || inputsLoading) return;
    perfMark('decide.answer:start'); // 06.1-47: Check it -> answer timing; the end is marked in useCheckEngine
    const result = newCheck.start(fields);
    setLoadingTap(result === 'loading');
    if (typeof result === 'string' && result.startsWith('/decide/')) startFresh();
  };

  // 06.1-56 (DB-10): an example fills the form and brings the check card into view, so the tap never looks dead.
  const scrollHandle = useRef<TabRootScrollHandle | null>(null);
  const layout = useRef({ body: 0, card: 0 });
  const onBodyLayout = useCallback((e: LayoutChangeEvent): void => {
    layout.current.body = e.nativeEvent.layout.y;
  }, []);
  const onCardLayout = useCallback((e: LayoutChangeEvent): void => {
    layout.current.card = e.nativeEvent.layout.y;
  }, []);
  const fillExample = (name: string, amount: number): void => {
    setText(name);
    setPrice(amount);
    scrollHandle.current?.scrollTo(layout.current.body + layout.current.card - SCROLL_MARGIN);
  };

  const focusWhat = (): void => textRef.current?.focus();
  // 06.1-28 (D-05, D-23): the quick menu, You tab and onboarding open Decide with ?focus=check; the field takes focus once, then the param is cleared.
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  useEffect(() => {
    if (focus !== 'check') return;
    const id = setTimeout(() => textRef.current?.focus(), 0);
    router.setParams({ focus: undefined });
    return () => clearTimeout(id);
  }, [focus, router]);
  const addQuick = (line: QuickLine): void => {
    setQuickLines((prev) => (prev.some((l) => l.id === line.id) ? prev.map((l) => (l.id === line.id ? line : l)) : [...prev, line].slice(0, MAX_QUICK_LINES)));
    setQuick(null);
    if (!quickLines.some((l) => l.id === line.id)) {
      showToast({ kind: 'ordinary', text: { key: 'decide.screens.common.toast.added', params: { item: line.name } }, onUndo: () => setQuickLines((prev) => prev.filter((l) => l.id !== line.id)) });
    }
  };
  const removeQuick = (line: QuickLine): void => {
    setQuickLines((prev) => prev.filter((l) => l.id !== line.id));
    setQuick(null);
    showToast({ kind: 'ordinary', text: { key: 'decide.screens.common.toast.removed', params: { item: line.name } }, onUndo: () => setQuickLines((prev) => (prev.some((l) => l.id === line.id) ? prev : [...prev, line])) });
  };
  const choosePay = (mode: PayChoice): void => {
    if (mode === 'plan') {
      setPlanOpen(true);
      return;
    }
    setPayMode('once');
    setPlan(null);
  };

  // ── the cards below the check ─────────────────────────────────────────────────────────────────────────────────────
  const setupProgress = useSetupProgress();
  const setupText = useSetupText(currency);
  const setupDoneSeen = useSetupDoneSeen(rc.userId);
  const pastCount = usePastCount();
  const { rows: openRows, checks: openChecks } = useOpenCheckRows();
  const [openId, setOpenId] = useState<string | null>(null);
  const rules = useMoneyRules();
  const crossings = useRuleCrossings();
  const categories = useCategories(rc.userId ?? undefined).data;
  const categoryList = useMemo(() => (categories ?? []).map((c) => ({ id: c.id, name: c.name ?? '' })), [categories]);
  const categoryName = useCallback((id: string): string => categoryList.find((c) => c.id === id)?.name ?? '', [categoryList]);
  const [ruleTarget, setRuleTarget] = useState<RuleTarget | null>(null);
  const [addRuleOpen, setAddRuleOpen] = useState(false);
  const rulesFacts = useMemo(() => rulesFactsOf(inputs), [inputs]);
  const footer = useMemo(() => footerFactsOf(inputs), [inputs]);

  const go = (href: string): void => router.push(href as Href);
  const offlineDate = !sync.isOnline ? dateText(inputs?.recordsAsOf ?? rc.today) : null;
  const openModel = openId === null ? null : (openRows.find((r) => r.id === openId) ?? null);
  const openRow = openId === null ? null : (openChecks.find((r) => r.id === openId) ?? null);
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };

  return (
    <TabRootScreen
      eyebrow={t('decide.screens.home.kicker')}
      title={t('decide.screens.home.title')}
      titleRole="display"
      trailing={<PastPill count={pastCount} onPress={() => go('/decide/past')} />}
      hideSyncLine
      // 06.1-56 (UX-11, CB-1): a tap on Check it with the keyboard open starts the check on the first tap.
      keyboardShouldPersistTaps="handled"
      // 06.1-56 (DS-21): the compact header sits in the layout under its own status-bar backdrop, so it stays put and nothing is
      // drawn under the status bar when an example fills the form.
      compactInFlow
      scrollHandle={scrollHandle}
      overlay={
        <>
          <DatePickerSheet
            visible={datePick !== null}
            check={{ ...draft, purchaseDate: datePick?.current ?? draft.purchaseDate ?? null }}
            today={rc.today}
            paydays={nextPayday === null ? [] : [nextPayday]}
            locale={fmt.locale}
            formatDate={dateText}
            onUse={(d) => {
              datePick?.set(d);
              setDatePick(null);
            }}
            onDismiss={() => setDatePick(null)}
          />
          <InstallmentPlanSheet
            visible={planOpen}
            check={draft}
            currency={currency}
            today={rc.today}
            nextPayday={nextPayday}
            itemKind={planItemKind(kind)}
            editing={plan !== null}
            formatMoney={money}
            formatDate={dateText}
            onPickDate={(current, set) => setDatePick({ current, set })}
            onUse={(pay) => {
              setPlan(pay);
              setPayMode('plan');
              setPlanOpen(false);
            }}
            onDismiss={() => setPlanOpen(false)}
          />
          {quick === null ? null : (
            <QuickEstimateSheet
              visible
              kind={quick.kind}
              line={quick.line}
              currency={currency}
              today={rc.today}
              formatDate={dateText}
              onPickDate={(current, set) => setDatePick({ current, set })}
              onAdd={addQuick}
              onRemove={quick.line === undefined ? undefined : removeQuick}
              onDismiss={() => setQuick(null)}
            />
          )}
          <OpenCheckSheet
            visible={openRow !== null && openModel !== null}
            check={openRow}
            model={openModel}
            currency={currency}
            today={rc.today}
            locale={fmt.locale}
            formatMoney={money}
            formatDate={dateText}
            onDismiss={() => setOpenId(null)}
          />
          <RuleEditSheet
            visible={ruleTarget !== null}
            target={ruleTarget}
            doc={rules.doc}
            dsrLine={rules.dsrLine}
            currency={currency}
            formatMoney={money}
            categoryName={categoryName}
            debtToday={null}
            usualLeft={picture?.usual != null ? Number(picture.usual.left) : null}
            crossings={crossings}
            save={rules.save}
            onOpenGrow={() => go('/grow')}
            onDismiss={() => setRuleTarget(null)}
          />
          <AddRuleSheet visible={addRuleOpen} doc={rules.doc} currency={currency} categories={categoryList} crossings={crossings} save={rules.save} onDismiss={() => setAddRuleOpen(false)} />
        </>
      }
    >
      <View style={styles.body} onLayout={onBodyLayout}>
        <Text style={small}>{t('decide.screens.home.subtitle')}</Text>

        <SetupBanner
          progress={setupProgress}
          onStart={(next) => go(String(SETUP_ROUTES[next ?? 'pay']))}
          onCheckFirst={focusWhat}
          onSeeUses={() => go('/decide/setup')}
          setupDoneSeen={setupDoneSeen}
          userId={rc.userId}
          itemName={setupText.itemName}
        />

        {offlineDate !== null ? <OfflineCard date={offlineDate} onRetry={v3.refetch} /> : null}
        {v3.status === 'error' && offlineDate === null ? <ErrorCard item={text.trim()} onRetry={v3.refetch} /> : null}

        <View testID="check-card-slot" onLayout={onCardLayout}>
        <CheckCard
          text={text}
          onText={setText}
          onWhatRef={registerWhat}
          kindWord={kindWord}
          homeNote={home}
          price={price}
          onPrice={setPrice}
          onPriceText={setPriceText}
          currency={currency}
          taxNote={taxNote}
          when={when}
          onWhen={setWhen}
          onPickDate={() => setDatePick({ current: typeof when === 'object' ? when.date : null, set: (d) => setWhen({ date: d }) })}
          todayText={todayText}
          paydayText={paydayText}
          pickedText={typeof when === 'object' ? short.dayMonth(when.date) : null}
          reads={reads}
          onApplyReads={() => {
            if (parsed === null) return;
            setText(parsed.name);
            setPrice(parsed.price);
          }}
          onReadsWhen={() => setWhen('today')}
          onReadsPay={() => choosePay(payMode === 'plan' ? 'once' : 'plan')}
          moreDetails={
            <MoreDetails
              open={moreOpen}
              onToggle={() => setMoreOpen((o) => !o)}
              payMode={payMode}
              onPay={choosePay}
              purpose={purpose}
              onPurpose={setPurpose}
              quickLines={quickLines}
              onAddQuick={(k) => setQuick({ kind: k })}
              onEditQuick={(line) => setQuick({ kind: line.kind, line })}
              onRemoveQuick={removeQuick}
              quickFull={quickLines.length >= MAX_QUICK_LINES}
              formatMoney={money}
            />
          }
          disabled={!ready || newCheck.pending || inputsLoading}
          onCheck={check}
          hint={hint}
        />
        </View>

        <View style={styles.examples}>
          <Text style={small}>{t('decide.screens.home.examples.title')}</Text>
          <View style={styles.chips}>
            {EXAMPLES.map((e) => {
              const amount = e.whole * 10 ** currencyExponent(currency);
              const name = t(`decide.screens.home.examples.${e.key}`);
              return (
                <Chip key={e.key} label={`${name} ${money(amount)}`} onPress={() => fillExample(name, amount)} />
              );
            })}
          </View>
        </View>

        <YourMonthCard
          picture={picture}
          bars={bars}
          thisMonth={rc.today.slice(0, 7)}
          monthName={(ym) => monthNameOf(ym, fmt.locale)}
          formatMoney={money}
          recordsUpTo={inputs?.recordsAsOf == null ? null : dateText(inputs.recordsAsOf)}
          recordMonths={footer.months}
          onRecords={() => go('/decide/setup/records')}
        />

        <OpenChecksCard rows={openRows} formatMoney={money} formatMoneySpoken={moneySpoken} formatDate={short.dayMonth} today={rc.today} onOpen={setOpenId} onAddPurchase={focusWhat} />

        <MoneyRulesCard
          netLocked={rulesFacts.netLocked}
          dsrLine={rules.dsrLine}
          rules={rules.doc.rules}
          saving={rulesFacts.saving}
          investing={rulesFacts.investing}
          formatMoney={money}
          categoryName={categoryName}
          onOpenNet={() => go('/decide/safety-net')}
          onEdit={setRuleTarget}
          onAdd={() => setAddRuleOpen(true)}
        />

        <SomethingChanged />

        <View style={styles.footer}>
          <Text testID="home-footer-records" style={small}>
            {t('decide.screens.home.footerRecords', { months: footer.months, count: footer.entries })} {t('decide.screens.home.footerUpdates')}
          </Text>
          <Text testID="home-footer-legal" style={small}>
            {t('legal.decideAnswer.footer')}
          </Text>
        </View>
      </View>
    </TabRootScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.screenH, gap: space.groupGap },
  examples: { gap: space.gapSm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  footer: { gap: space.gapSm },
  pill: { minHeight: space.touchMin, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: space.gapMd, flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  badge: { minWidth: 22, minHeight: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
});
