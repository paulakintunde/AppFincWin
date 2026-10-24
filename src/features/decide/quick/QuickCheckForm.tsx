/**
 * 05-13 (DCU-01, D-01, D-02, D-22, D-23, D-24, D-37): the quick check card, shared by Decide home and the onboarding first
 * check. Layout, top to bottom: the amount field, Cash | Credit, the result (above the Credit controls so editing never
 * hides the answer), the Credit block, "+ Tax, fees", then the actions. All behaviour lives in useQuickCheck; the snapshot
 * arrives as a prop so this component imports no data layer.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { Pill } from '@/ui/Pill';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, size, space } from '@/theme/layout';
import { shadows } from '@/theme/tokens';
import { DURATION, useReduceMotion } from '@/theme/motion';
import { SURFACE_ON_INK_OPACITY } from '@/ui/Chip';
import { fontSize, textRole } from '@/theme/typography';
import { currencyCode } from '@/engine/money';
import { moneyA11yFn, moneyFn } from '../check/steps/stepUi';
import { MoneyInput } from '../ui/MoneyInput';
import { RateInput } from '../ui/RateInput';
import { CustomValueChips } from '../ui/CustomValueChips';
import { useInfoSheet } from '../ui/useInfoSheet';
import { SegmentedToggle } from '../ui/SegmentedToggle';
import { DarkPill } from '../ui/DarkPill';
import { CREDIT_TERMS, type CheckInputs, type QuickComputation, type SnapshotResult } from '../snapshot/types';
import { DURATION_MAX, DURATION_MIN } from '../snapshot/customValues';
import { MAX_INPUT_MINOR, isValidAprText } from '../snapshot/checkInputs';
import { QuickResult } from './QuickResult';
import { quickStateOf, useQuickCheck, type QuickState } from './useQuickCheck';

export interface QuickCheckFormProps {
  surface: 'home' | 'firstRead';
  source: SnapshotResult | null;
  sourceStatus: 'loading' | 'error' | 'ready';
  today: string;
  currency: string;
  onRunFull?: (inputs: CheckInputs) => void;
  onAddRough?: () => void; // home: 05-27 opens RoughFiguresSheet
  onRetry?: () => void; // 05-27: useDecideSnapshot().retry
  onResult?: (state: QuickState, computation: QuickComputation) => void; // first-read analytics + haptic hook for 05-23 (the computation tells a cash-only overdraw from a fit)
  /** D-95: 'dark' is hosted by the ink card -- no card chrome of its own, the R17.3 styling. The onboarding first check keeps 'light'. */
  variant?: 'light' | 'dark';
  /** The resolved field placeholder (05-114 passes the decide.home.* key through t()); without it the existing short placeholder shows. */
  placeholder?: string;
  /** The short form (rule P): shown above 1.3x text scale or below 360 wide. */
  placeholderShort?: string;
  /** Reports whether a quick result is open, so the host can shrink the hero. */
  onResultOpenChange?: (open: boolean) => void;
  /** 05-117: the resolved screen-reader label of the item and price field; without it the quick-check label shows (onboarding keeps it). */
  fieldA11yLabel?: string;
}

const AMOUNT_HEIGHT = 56;
const NAME_MAX = 80;
const ZERO_RATE = /^0*\.?0*$/; // '' and any spelling of zero
const TRAILING_DOT = /^\d{1,4}\.$/;
const MAX_APR_TYPED = '999.99'; // gates keystrokes only; isValidAprText is the check
const MAX_TAX_TYPED = '100';
const RUN_HEIGHT = 48;
const PILL_INSET = 6;
const CHECK_HEIGHT = 44;
const PLACEHOLDER_SHORT_WIDTH = 360; // R6 rule P
const PLACEHOLDER_SHORT_SCALE = 1.3;

export function QuickCheckForm({ surface, source, sourceStatus, today, currency, onRunFull, onAddRough, onRetry, onResult, variant = 'light', placeholder, placeholderShort, onResultOpenChange, fieldA11yLabel }: QuickCheckFormProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const dark = variant === 'dark';
  const reduced = useReduceMotion();
  const { width, fontScale } = useWindowDimensions();
  const shortPlaceholder = width < PLACEHOLDER_SHORT_WIDTH || fontScale > PLACEHOLDER_SHORT_SCALE;
  const fieldPlaceholder =
    placeholder === undefined ? t('decide.quick.placeholderShort') : shortPlaceholder ? (placeholderShort ?? placeholder) : placeholder;
  const cardStyle = dark ? styles.cardDark : [styles.card, { backgroundColor: colors.surface }, shadows.card];
  const wholeFmt = useMoneyFormatter(false);
  const exactFmt = useMoneyFormatter(true);
  const q = useQuickCheck(source, surface);
  const aprInfo = useInfoSheet('beforeInterest');
  const { inputs, submitted, computation } = q.state;

  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [fieldPrice, setFieldPrice] = useState<number | null>(null);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [aprDraft, setAprDraft] = useState(inputs.aprText);
  const [aprSeen, setAprSeen] = useState(inputs.aprText);
  const [tick, setTick] = useState(0);
  const handled = useRef(0);

  // Follow an external APR change (See it on credit, Clear) without clobbering a half-typed "9."
  if (inputs.aprText !== aprSeen) {
    setAprSeen(inputs.aprText);
    setAprDraft(inputs.aprText);
  }

  // The result callback fires once per Check it, with the state the submit produced (not per keystroke).
  useEffect(() => {
    if (tick === handled.current) return;
    const state = quickStateOf(computation);
    if (state === null) return;
    handled.current = tick;
    onResult?.(state, computation);
  }, [tick, computation, onResult]);

  const resultOpen = submitted && computation.kind !== 'incomplete';
  const reportedOpen = useRef(false);
  useEffect(() => {
    if (reportedOpen.current === resultOpen) return;
    reportedOpen.current = resultOpen;
    onResultOpenChange?.(resultOpen);
  }, [resultOpen, onResultOpenChange]);

  const whole = moneyFn(wholeFmt, currencyCode(currency));
  const exact = moneyFn(exactFmt, currencyCode(currency));
  const wholeA11y = moneyA11yFn(wholeFmt, currencyCode(currency));
  const exactA11y = moneyA11yFn(exactFmt, currencyCode(currency));
  const label = { ...textRole(pairing, 'label'), color: dark ? colors.inkSoft1 : colors.inkDim };

  if (sourceStatus === 'loading' || (sourceStatus === 'ready' && source === null)) {
    return (
      <View
        accessible
        accessibilityLabel={t('decide.quick.loading')}
        accessibilityState={{ busy: true }}
        style={cardStyle}
      >
        <SkeletonBar height={AMOUNT_HEIGHT} dark={dark} />
        <SkeletonBar height={space.touchMin} dark={dark} />
        <SkeletonBar height={AMOUNT_HEIGHT} dark={dark} />
      </View>
    );
  }
  if (sourceStatus === 'error') {
    return (
      <View style={cardStyle}>
        <Text style={{ ...textRole(pairing, dark ? 'sheetTitle' : 'heading'), color: dark ? colors.surface : colors.ink }}>{t('decide.quick.error.heading')}</Text>
        <Text style={{ ...textRole(pairing, dark ? 'label' : 'body'), ...(dark ? { fontSize: fontSize.meta } : {}), color: dark ? colors.inkSoft1 : colors.inkDim }}>{t('decide.quick.error.body')}</Text>
        <View style={styles.row}>
          {dark ? (
            <DarkPill label={t('decide.quick.error.retry')} variant="solid" onPress={onRetry} />
          ) : (
            <Pill label={t('decide.quick.error.retry')} variant="secondary" onPress={onRetry} />
          )}
        </View>
      </View>
    );
  }

  const failParse = () => showToast({ kind: 'info', text: { key: 'decide.quick.parseError' } });
  const check = () => {
    if (surface === 'home') {
      if (q.submit(text).ok) setTick((n) => n + 1);
      else failParse();
    } else if (fieldPrice !== null && fieldPrice <= MAX_INPUT_MINOR && q.submitFields(name, fieldPrice).ok) setTick((n) => n + 1);
    else failParse();
  };

  const onApr = (next: string) => {
    if (next === '' || isValidAprText(next)) {
      setAprDraft(next);
      setAprSeen(next);
      q.setApr(next);
    } else if (TRAILING_DOT.test(next) && isValidAprText(next.slice(0, -1))) {
      setAprDraft(next); // typing "9." keeps the engine on "9" until a digit follows
    }
  };

  const showResult = submitted && computation.kind !== 'incomplete';
  const credit = inputs.mode === 'credit';
  const extra =
    computation.kind === 'logged' || computation.kind === 'first_read' || computation.kind === 'cash_only'
      ? computation.resolvedPrice.price - (inputs.price ?? 0)
      : (inputs.fees ?? 0);
  const extrasSummary = !extrasOpen && extra > 0 ? t('decide.quick.extrasSummary', { amount: whole(extra) }) : '';
  const none = computation.kind === 'none';
  const unconverted = computation.kind === 'unconverted';

  const toggleEl = showResult ? (
    <SegmentedToggle
      dark={dark}
      accessibilityLabel={t('decide.quick.payWith')}
      options={[
        { key: 'cash', label: t('decide.quick.cash') },
        { key: 'credit', label: t('decide.quick.credit') },
      ]}
      value={inputs.mode}
      onChange={(key) => q.setMode(key === 'credit' ? 'credit' : 'cash')}
    />
  ) : null;
  const resultEl = showResult ? (
    <QuickResult
      variant={variant}
      computation={computation}
      mode={inputs.mode}
      name={inputs.name}
      price={inputs.price}
      fmt={whole}
      fmtCents={exact}
      fmtA11y={wholeA11y}
      fmtCentsA11y={exactA11y}
      onTryCredit={q.tryCredit}
      combine={q.combine}
      onCombine={q.setCombine}
      openCount={q.stack.openCount}
      firstReadBasis={surface === 'firstRead'}
      waitingCurrencies={source?.monthFallback?.currencies ?? null}
    />
  ) : null;

  return (
    <View style={cardStyle}>
      {surface === 'home' ? (
        <View style={styles.row}>
          <View style={[styles.amount, dark ? styles.amountDark : { backgroundColor: colors.fill1 }]}>
            {dark ? (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: SURFACE_ON_INK_OPACITY, borderRadius: radii.pill }]}
              />
            ) : null}
            <TextInput
              value={text}
              onChangeText={(next) => {
                setText(next);
                q.setText(next);
              }}
              onSubmitEditing={check}
              returnKeyType="go"
              accessibilityLabel={fieldA11yLabel ?? t('decide.quick.a11y')}
              placeholder={fieldPlaceholder} // R6 rule P: the pill also holds "Check it"; the light form always uses the short text
              placeholderTextColor={dark ? colors.inkSoft2 : colors.inkFaint}
              style={[styles.amountInput, { ...textRole(pairing, 'body'), color: dark ? colors.surface : colors.ink }]}
            />
            <View style={styles.checkInside}>
              {dark ? (
                <DarkPill label={t('decide.quick.check')} variant="solid" onPress={check} minHeight={CHECK_HEIGHT} />
              ) : (
                <Pill label={t('decide.quick.check')} variant="primary" onPress={check} />
              )}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.fields}>
          <View>
            <Text style={label}>{t('decide.onboarding.what')}</Text>
            <View style={[styles.field, { backgroundColor: colors.fill1 }]}>
              <TextInput
                value={name}
                onChangeText={(next) => {
                  setName(next);
                  if (submitted) q.submitFields(next, fieldPrice);
                }}
                maxLength={NAME_MAX}
                accessibilityLabel={t('decide.onboarding.what')}
                placeholderTextColor={colors.inkFaint}
                style={[styles.fieldInput, { ...textRole(pairing, 'body'), color: colors.ink }]}
              />
            </View>
          </View>
          <MoneyInput
            value={fieldPrice}
            currency={currency}
            onChange={(minor) => {
              setFieldPrice(minor);
              if (submitted) q.submitFields(name, minor);
            }}
            label={t('decide.onboarding.price')}
            accessibilityLabel={t('decide.onboarding.price')}
            large
          />
          <Pill label={t('decide.onboarding.check')} variant="primary" onPress={check} />
        </View>
      )}

      {dark && resultEl !== null ? (
        <>
          <DarkRule />
          {reduced ? (
            <View style={styles.darkResult}>{resultEl}</View>
          ) : (
            <Animated.View style={styles.darkResult} entering={FadeInDown.duration(DURATION.entrance)}>
              {resultEl}
            </Animated.View>
          )}
          {toggleEl}
        </>
      ) : (
        <>
          {toggleEl}
          {resultEl}
        </>
      )}

      {showResult && credit ? (
        <View style={styles.fields}>
          <RateInput
            value={aprDraft}
            onChange={onApr}
            label={t('decide.quick.aprLabel')}
            hint={ZERO_RATE.test(aprDraft) ? t('decide.quick.beforeInterest') : t('decide.quick.aYear')}
            accessibilityLabel={t('decide.quick.aprA11y')}
            max={MAX_APR_TYPED}
            tone={variant}
            rangeText={t('decide.custom.range.apr')}
            labelAccessory={aprInfo.button(variant)}
          />
          {aprInfo.sheet}
          <View style={styles.terms}>
            <Text style={label}>{t('decide.quick.overMonths', { count: inputs.termMonths })}</Text>
            <CustomValueChips
              presets={CREDIT_TERMS}
              value={inputs.termMonths}
              onChange={q.setTerm}
              groupLabel={t('decide.quick.termsA11y')}
              min={DURATION_MIN}
              max={DURATION_MAX}
              rangeText={t('decide.custom.range.months')}
              unitWord={t('decide.custom.unit.months')}
              tone={variant}
            />
          </View>
        </View>
      ) : null}

      {showResult ? (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: extrasOpen }}
          accessibilityLabel={extrasSummary === '' ? t('decide.quick.extras') : `${t('decide.quick.extras')}, ${extrasSummary}`}
          onPress={() => setExtrasOpen((open) => !open)}
          style={({ pressed }) => [styles.extrasRow, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: dark ? colors.inkSoft1 : colors.inkDim }}>{t('decide.quick.extras')}</Text>
          {extrasSummary !== '' ? (
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: dark ? colors.inkSoft1 : colors.inkMuted }}>{extrasSummary}</Text>
          ) : null}
          <View
            testID="extras-chevron"
            style={[styles.chevron, { borderColor: dark ? colors.inkSoft1 : colors.inkSoft3, transform: [{ rotate: extrasOpen ? '135deg' : '45deg' }] }]}
          />
        </Pressable>
        {extrasOpen ? (
          <View style={styles.fields}>
            <RateInput
              value={inputs.taxText}
              onChange={q.setTax}
              label={t('decide.quick.salesTax')}
              accessibilityLabel={t('decide.quick.salesTaxA11y')}
              placeholder={t('decide.quick.taxPlaceholder')}
              max={MAX_TAX_TYPED}
              tone={variant}
              rangeText={t('decide.custom.range.percent')}
            />
            <MoneyInput
              value={inputs.fees}
              currency={currency}
              onChange={q.setFees}
              tone={variant}
              label={t('decide.quick.fees')}
              accessibilityLabel={t('decide.quick.fees')}
            />
          </View>
        ) : null}
      </View>
      ) : null}

      {showResult ? (
        <View style={styles.actions}>
          {none ? (
            dark ? (
              <DarkPill label={t('decide.home.noFigures.addRough')} variant="solid" onPress={onAddRough} />
            ) : (
              <Pill label={t('decide.home.noFigures.addRough')} variant="primary" onPress={onAddRough} />
            )
          ) : null}
          {surface === 'home' && !none ? (
            dark ? (
              <DarkPill
                label={t('decide.quick.runFull')}
                variant="tint"
                grow
                minHeight={RUN_HEIGHT}
                disabled={unconverted}
                onPress={() => onRunFull?.(q.toCheckInputs(today))}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('decide.quick.runFull')}
                accessibilityState={{ disabled: unconverted }}
                disabled={unconverted}
                onPress={() => onRunFull?.(q.toCheckInputs(today))}
                style={({ pressed }) => [styles.run, { backgroundColor: colors.ink, opacity: unconverted ? 0.5 : pressed ? PRESSED_OPACITY : 1 }]}
              >
                <Text style={{ ...textRole(pairing, 'label'), color: colors.surface }}>{t('decide.quick.runFull')}</Text>
              </Pressable>
            )
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('decide.quick.clearA11y')}
            onPress={() => {
              q.clear();
              setText('');
              setName('');
              setFieldPrice(null);
              setExtrasOpen(false);
            }}
            style={({ pressed }) => [styles.clear, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
          >
            <Text style={label}>{t('decide.quick.clearText')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function SkeletonBar({ height, dark }: { height: number; dark: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.skeleton, { height, backgroundColor: dark ? 'transparent' : colors.fill1 }]}>
      {dark ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface, opacity: SURFACE_ON_INK_OPACITY, borderRadius: radii.pill }]} />
      ) : null}
    </View>
  );
}

/** R17.3: the quick result opens under a 1px surface@.12 rule. */
function DarkRule() {
  const { colors } = useTheme();
  return <View testID="quick-result-rule" style={[styles.rule, { backgroundColor: colors.surface, opacity: SURFACE_ON_INK_OPACITY }]} />;
}

const styles = StyleSheet.create({
  cardDark: { gap: space.gapMd },
  darkResult: { gap: space.gapSm },
  rule: { height: 1 },
  amountDark: { overflow: 'hidden' },
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapMd },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  amount: { flex: 1, minHeight: AMOUNT_HEIGHT, borderRadius: radii.pill, paddingLeft: space.cardPad, paddingRight: PILL_INSET, flexDirection: 'row', alignItems: 'center' },
  amountInput: { flex: 1, padding: 0, minHeight: CHECK_HEIGHT },
  fields: { gap: space.gapMd },
  field: { minHeight: space.touchMin, borderRadius: radii.pill, paddingHorizontal: space.gapMd, justifyContent: 'center' },
  fieldInput: { minHeight: space.touchMin, padding: 0 },
  terms: { gap: space.gapSm },
  extrasRow: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  run: { flex: 1, minHeight: RUN_HEIGHT, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.cardPad },
  clear: { minWidth: space.touchMin, minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gapSm },
  chevron: { width: size.chevronCompact, aspectRatio: 1, borderTopWidth: 2, borderRightWidth: 2, flexShrink: 0 },
  checkInside: { marginLeft: space.gapSm },
  skeleton: { borderRadius: radii.pill, overflow: 'hidden' },
});
