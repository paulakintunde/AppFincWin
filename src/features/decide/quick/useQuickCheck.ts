/**
 * 05-13 (DCU-01, D-01, D-23, D-24, ANL-06): the quick check's state, parse, live computation and analytics.
 * The form is layout only; everything it does is here. Inputs are the stored QuickInputs shape (strings and integer minor
 * units), so no rate is invented and no float reaches the engine (D-02). Every amount that reaches computeQuick is
 * bounded by MAX_INPUT_MINOR, because the engine's minorUnits() throws on unsafe integers.
 */
import { useCallback, useMemo, useState } from 'react';
import { useOtherChecks } from '@/data/queries/decide';
import { getAnalytics } from '@/services/analytics';
import { useAmountParser } from '@/ui/money/useAmountParser';
import { parseQuick } from '../quickParse';
import { MAX_INPUT_MINOR, defaultQuickInputs, quickToCheckInputs } from '../snapshot/checkInputs';
import { computeQuick } from '../snapshot/computeCheck';
import { DURATION_MAX, DURATION_MIN } from '../snapshot/customValues';
import type { CheckInputs, QuickComputation, QuickInputs, SnapshotResult, StackSelection } from '../snapshot/types';

export interface QuickCheckState {
  inputs: QuickInputs;
  submitted: boolean;
  computation: QuickComputation;
}

export type QuickState = 'fits' | 'adjust' | 'no' | 'missing';

const FALLBACK_CURRENCY = 'USD';

/** What the analytics event carries: a state word only. Nothing was judged for none, cash_only and unconverted. */
export function quickStateOf(c: QuickComputation): QuickState | null {
  switch (c.kind) {
    case 'logged':
      return c.verdict.state;
    case 'first_read':
      return c.firstRead.state;
    case 'none':
    case 'cash_only':
    case 'unconverted':
      return 'missing';
    case 'incomplete':
      return null;
  }
}

const validAmount = (n: number): boolean => Number.isSafeInteger(n) && n > 0 && n <= MAX_INPUT_MINOR;

export function useQuickCheck(source: SnapshotResult | null, surface: 'home' | 'firstRead') {
  const parser = useAmountParser();
  const stack: StackSelection = useOtherChecks(null);
  const [combine, setCombine] = useState(true);
  const [inputs, setInputs] = useState<QuickInputs>(defaultQuickInputs);
  const [submitted, setSubmitted] = useState(false);
  const currency = source?.currency ?? FALLBACK_CURRENCY;
  const allowCashOnly = surface === 'firstRead';
  const otherChecks = combine ? stack.otherChecks : undefined;

  const computation = useMemo<QuickComputation>(
    () => (source === null ? { kind: 'incomplete' } : computeQuick(source, inputs, { allowCashOnly, otherChecks: otherChecks ?? [] })),
    [source, inputs, allowCashOnly, otherChecks]
  );

  const parseText = useCallback(
    (text: string): { name: string; price: number } | null =>
      parseQuick(text, (s) => {
        const r = parser.parse(s, currency);
        return r.ok ? r.value : null;
      }),
    [parser, currency]
  );

  const fire = useCallback(
    (next: QuickInputs) => {
      if (surface !== 'home' || source === null) return;
      const state = quickStateOf(computeQuick(source, next, { allowCashOnly, otherChecks: otherChecks ?? [] }));
      if (state !== null) getAnalytics().track('quick_check_run', { state });
    },
    [surface, source, allowCashOnly, otherChecks]
  );

  const submit = useCallback(
    (text: string): { ok: true } | { ok: false } => {
      const parsed = parseText(text);
      if (parsed === null || !validAmount(parsed.price)) return { ok: false };
      const next = { ...inputs, name: parsed.name, price: parsed.price };
      setInputs(next);
      setSubmitted(true);
      fire(next);
      return { ok: true };
    },
    [parseText, inputs, fire]
  );

  const submitFields = useCallback(
    (name: string, price: number | null): { ok: boolean } => {
      if (price === null || !validAmount(price)) return { ok: false };
      const next = { ...inputs, name: name.slice(0, 80), price };
      setInputs(next);
      setSubmitted(true);
      fire(next);
      return { ok: true };
    },
    [inputs, fire]
  );

  const patch = useCallback((p: Partial<QuickInputs>) => setInputs((prev) => ({ ...prev, ...p })), []);

  // After a submit every edit recomputes; a text edit re-parses, and an amount that does not parse or is over the bound
  // gives no price at all (the result goes back to incomplete) rather than a stale answer.
  const setText = useCallback(
    (text: string) => {
      if (!submitted) return;
      const parsed = parseText(text);
      if (parsed === null || !validAmount(parsed.price)) patch({ price: null });
      else patch({ name: parsed.name, price: parsed.price });
    },
    [submitted, parseText, patch]
  );

  const setFees = useCallback(
    (minor: number | null) => {
      if (minor !== null && !validAmount(minor)) return;
      patch({ fees: minor });
    },
    [patch]
  );

  return {
    state: { inputs, submitted, computation } satisfies QuickCheckState,
    submit,
    submitFields,
    setMode: useCallback((mode: 'cash' | 'credit') => patch({ mode }), [patch]),
    setApr: useCallback((aprText: string) => patch({ aprText }), [patch]),
    // D-71 (T-05-76-01): only a whole duration from 1 to DURATION_MAX reaches the engine; the bound lives here, not only in the chips.
    setTerm: useCallback(
      (termMonths: number) => {
        if (Number.isInteger(termMonths) && termMonths >= DURATION_MIN && termMonths <= DURATION_MAX) patch({ termMonths });
      },
      [patch]
    ),
    setTax: useCallback((taxText: string) => patch({ taxText }), [patch]),
    setFees,
    setText,
    tryCredit: useCallback(() => patch({ mode: 'credit', aprText: '0', termMonths: 12 }), [patch]),
    clear: useCallback(() => {
      setInputs(defaultQuickInputs());
      setSubmitted(false);
    }, []),
    // IN-B06: the full check records the currency the quick amounts were parsed and judged in.
    toCheckInputs: useCallback((today: string): CheckInputs => quickToCheckInputs(inputs, today, source?.currency ?? null), [inputs, source]),
    combine,
    setCombine,
    stack,
  };
}
