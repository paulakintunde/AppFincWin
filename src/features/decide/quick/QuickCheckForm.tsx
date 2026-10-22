/**
 * 05-13 (DCU-01, D-01, D-02, D-22, D-23, D-24, D-37): the quick check card, shared by Decide home and the onboarding first
 * check. Layout, top to bottom: the amount field, Cash | Credit, the result (above the Credit controls so editing never
 * hides the answer), the Credit block, "+ Tax, fees", then the actions. All behaviour lives in useQuickCheck; the snapshot
 * arrives as a prop so this component imports no data layer.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { Pill } from '@/ui/Pill';
import { hapticSelection } from '@/ui/haptics';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { ACCENT_TINT_OPACITY, shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { currencyCode } from '@/engine/money';
import { moneyFn } from '../check/steps/stepUi';
import { MoneyInput } from '../ui/MoneyInput';
import { RateInput } from '../ui/RateInput';
import { SegmentedToggle } from '../ui/SegmentedToggle';
import { CREDIT_TERMS, type CheckInputs, type CreditTerm, type QuickComputation, type SnapshotResult } from '../snapshot/types';
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
}

const AMOUNT_HEIGHT = 56;
const NAME_MAX = 80;
const ZERO_RATE = /^0*\.?0*$/; // '' and any spelling of zero
const TRAILING_DOT = /^\d{1,4}\.$/;

function TermChip({ months, selected, onPress }: { months: CreditTerm; selected: boolean; onPress: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={t('decide.quick.termChipA11y', { count: months })}
      onPress={() => {
        if (selected) return;
        hapticSelection();
        onPress();
      }}
      style={[styles.termChip, { backgroundColor: colors.fill1 }]}
    >
      {selected ? (
        <View
          testID="accent-tint"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill }]}
        />
      ) : null}
      <Text style={{ ...textRole(pairing, 'label'), color: selected ? colors.accent : colors.ink }}>{String(months)}</Text>
    </Pressable>
  );
}

export function QuickCheckForm({ surface, source, sourceStatus, today, currency, onRunFull, onAddRough, onRetry, onResult }: QuickCheckFormProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const wholeFmt = useMoneyFormatter(false);
  const exactFmt = useMoneyFormatter(true);
  const q = useQuickCheck(source, surface);
  const { inputs, submitted, computation } = q.state;

  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [fieldPrice, setFieldPrice] = useState<number | null>(null);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [aprDraft, setAprDraft] = useState(inputs.aprText);
  const [aprSeen, setAprSeen] = useState(inputs.aprText);
  const [tick, setTick] = useState(0);
  const handled = useRef(0);

  // Follow an external APR change (Try on credit, Clear) without clobbering a half-typed "9."
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

  const whole = moneyFn(wholeFmt, currencyCode(currency));
  const exact = moneyFn(exactFmt, currencyCode(currency));
  const label = { ...textRole(pairing, 'label'), color: colors.inkDim };

  if (sourceStatus === 'loading' || (sourceStatus === 'ready' && source === null)) {
    return (
      <View
        accessible
        accessibilityLabel={t('decide.quick.loading')}
        accessibilityState={{ busy: true }}
        style={[styles.card, { backgroundColor: colors.surface }, shadows.card]}
      >
        <View style={[styles.skeleton, { height: AMOUNT_HEIGHT, backgroundColor: colors.fill1 }]} />
        <View style={[styles.skeleton, { height: space.touchMin, backgroundColor: colors.fill1 }]} />
        <View style={[styles.skeleton, { height: AMOUNT_HEIGHT, backgroundColor: colors.fill1 }]} />
      </View>
    );
  }
  if (sourceStatus === 'error') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }, shadows.card]}>
        <Text style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>{t('decide.quick.error.heading')}</Text>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.quick.error.body')}</Text>
        <View style={styles.row}>
          <Pill label={t('decide.quick.error.retry')} variant="secondary" onPress={onRetry} />
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

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }, shadows.card]}>
      {surface === 'home' ? (
        <View style={styles.row}>
          <View style={[styles.amount, { backgroundColor: colors.fill1 }]}>
            <TextInput
              value={text}
              onChangeText={(next) => {
                setText(next);
                q.setText(next);
              }}
              onSubmitEditing={check}
              returnKeyType="go"
              accessibilityLabel={t('decide.quick.a11y')}
              placeholder={t('decide.quick.placeholder')}
              placeholderTextColor={colors.inkFaint}
              style={[styles.amountInput, { ...textRole(pairing, 'body'), color: colors.ink }]}
            />
          </View>
          <Pill label={t('decide.quick.check')} variant="primary" onPress={check} />
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

      <SegmentedToggle
        accessibilityLabel={t('decide.quick.payWith')}
        options={[
          { key: 'cash', label: t('decide.quick.cash') },
          { key: 'credit', label: t('decide.quick.credit') },
        ]}
        value={inputs.mode}
        onChange={(key) => q.setMode(key === 'credit' ? 'credit' : 'cash')}
      />

      {showResult ? (
        <QuickResult
          computation={computation}
          mode={inputs.mode}
          name={inputs.name}
          price={inputs.price}
          fmt={whole}
          fmtCents={exact}
          onTryCredit={q.tryCredit}
          combine={q.combine}
          onCombine={q.setCombine}
          openCount={q.stack.openCount}
          firstReadBasis={surface === 'firstRead'}
        />
      ) : null}

      {credit ? (
        <View style={styles.fields}>
          <RateInput
            value={aprDraft}
            onChange={onApr}
            label={t('decide.quick.aprLabel')}
            hint={ZERO_RATE.test(aprDraft) ? t('decide.quick.beforeInterest') : t('decide.quick.aYear')}
            accessibilityLabel={t('decide.quick.aprA11y')}
          />
          <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.quick.termsA11y')} style={styles.terms}>
            {CREDIT_TERMS.map((months) => (
              <TermChip key={months} months={months} selected={inputs.termMonths === months} onPress={() => q.setTerm(months)} />
            ))}
          </View>
        </View>
      ) : null}

      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: extrasOpen }}
          accessibilityLabel={extrasSummary === '' ? t('decide.quick.extras') : `${t('decide.quick.extras')}, ${extrasSummary}`}
          onPress={() => setExtrasOpen((open) => !open)}
          style={({ pressed }) => [styles.extrasRow, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{t('decide.quick.extras')}</Text>
          {extrasSummary !== '' ? (
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{extrasSummary}</Text>
          ) : null}
        </Pressable>
        {extrasOpen ? (
          <View style={styles.fields}>
            <RateInput
              value={inputs.taxText}
              onChange={q.setTax}
              label={t('decide.quick.salesTax')}
              accessibilityLabel={t('decide.quick.salesTaxA11y')}
              placeholder={t('decide.quick.taxPlaceholder')}
            />
            <MoneyInput
              value={inputs.fees}
              currency={currency}
              onChange={q.setFees}
              label={t('decide.quick.fees')}
              accessibilityLabel={t('decide.quick.fees')}
            />
          </View>
        ) : null}
      </View>

      {showResult ? (
        <View style={styles.actions}>
          {none ? <Pill label={t('decide.home.noFigures.addRough')} variant="primary" onPress={onAddRough} /> : null}
          {surface === 'home' && !none ? (
            <Pill
              label={t('decide.quick.runFull')}
              variant="primary"
              disabled={unconverted}
              onPress={unconverted ? undefined : () => onRunFull?.(q.toCheckInputs(today))}
            />
          ) : null}
          <Pill label={t('decide.quick.clear')} variant="secondary" onPress={() => { q.clear(); setText(''); setName(''); setFieldPrice(null); }} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapMd },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  amount: { flex: 1, height: AMOUNT_HEIGHT, borderRadius: radii.pill, paddingHorizontal: space.cardPad, justifyContent: 'center' },
  amountInput: { padding: 0, minHeight: space.touchMin },
  fields: { gap: space.gapMd },
  field: { minHeight: space.touchMin, borderRadius: radii.pill, paddingHorizontal: space.gapMd, justifyContent: 'center' },
  fieldInput: { minHeight: space.touchMin, padding: 0 },
  terms: { flexDirection: 'row', gap: space.gapSm },
  termChip: {
    flex: 1,
    minHeight: space.touchMin,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  extrasRow: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { gap: space.gapSm },
  skeleton: { borderRadius: radii.pill },
});
