/**
 * D-67 (CR-C06, CR-B02): a check typed in a previous home currency is judged in the current one. PURE; stored rates only
 * (the snapshot's own `fx`, never the FX fetch door, depcruise fx-fetch-never-from-reads).
 *
 * The stored inputs keep the currency they were typed in (D-37: never re-stamped). Before anything is computed, every
 * money amount is converted at the latest stored rate into the snapshot currency, and the flow says so ("Typed in X,
 * shown in Y at the latest stored rate."). A missing rate gives the usual unconverted state, never a guess. Edits made on
 * the converted view are converted back before they are saved; an amount the edit did not change keeps its exact stored
 * value, so nothing drifts by a rounding unit.
 */
import { convertLatest } from '@/data/queries/fxConvert';
import type { CheckInputs, SnapshotResult, UnconvertedNote } from './types';

/** IN-A01: seeded sample checks carry no currency; their amounts are USD minor units (the demo seed). */
export const SAMPLE_CURRENCY = 'USD';

/** The currency a check's amounts were typed in: the stored stamp, USD for an unstamped sample, else the home currency. */
export function typedCurrency(inputs: CheckInputs, home: string, isSample: boolean): string {
  return inputs.currency ?? (isSample ? SAMPLE_CURRENCY : home);
}

export interface TypedInNote {
  from: string;
  to: string;
}

export type InHome =
  /** Typed in the snapshot currency: the inputs unchanged. */
  | { kind: 'home'; inputs: CheckInputs }
  /** Typed in another currency: every amount converted, `currency` set to the snapshot's for the view only. */
  | { kind: 'converted'; inputs: CheckInputs; note: TypedInNote }
  /** No stored rate converts the typed currency: the inputs unchanged, judged as unconverted. */
  | { kind: 'missing'; inputs: CheckInputs; unconverted: UnconvertedNote };

/** Converts one amount; `original` is the stored amount it came from, when there is one. Null when no rate converts it. */
type Conv = (amount: number, original: number | undefined) => number | null;
type F = (n: number, o?: number) => number;

class NoRate extends Error {}

const line = <L extends { id: string; amount: number }>(v: readonly L[], o: readonly L[] | undefined, f: F): L[] =>
  v.map((l) => ({ ...l, amount: f(l.amount, o?.find((x) => x.id === l.id)?.amount) }));
const opt = (n: number | null, o: number | null | undefined, f: F): number | null => (n === null ? null : f(n, o ?? undefined));

/** The money fields of CheckInputs, each mapped through `f` (lines and setbacks matched to `original` by id). */
const MONEY: { readonly [K in keyof CheckInputs]?: (v: CheckInputs[K], o: CheckInputs[K] | undefined, f: F) => CheckInputs[K] } = {
  advertised: (v, o, f) => opt(v, o, f),
  adjustments: line,
  runningCosts: line,
  replaces: line,
  setbacks: (v, o, f) => v.map((s) => ({ ...s, amount: opt(s.amount, o?.find((x) => x.id === s.id)?.amount, f) })),
  lossOfValue: (v, o, f) => (v === null || v.kind !== 'amount' ? v : { kind: 'amount', monthly: f(v.monthly, o?.kind === 'amount' ? o.monthly : undefined) }),
  loan: (v, o, f) => ({ ...v, deposit: f(v.deposit, o?.deposit) }),
  instalment: (v, o, f) => ({ ...v, amount: opt(v.amount, o?.amount, f), lateFee: opt(v.lateFee, o?.lateFee, f) }),
  card: (v, o, f) => ({ ...v, fees: opt(v.fees, o?.fees, f) }),
  incomeChange: (v, o, f) => (v === null ? v : { ...v, amount: opt(v.amount, o?.amount, f) }),
  wait: (v, o, f) => ({ monthlyAmount: opt(v.monthlyAmount, o?.monthlyAmount, f) }),
  split: (v, o, f) => (v === null ? v : { ...v, amounts: v.amounts.map((a, i) => f(a, o?.amounts[i])) }),
};

const MONEY_KEYS = Object.keys(MONEY) as (keyof CheckInputs)[];

/**
 * Every money key of `values` that is present, mapped through `conv` (matched to `originals`), or null when one amount
 * has no rate. Keys `values` does not hold are left out.
 */
function mapMoney(values: Partial<CheckInputs>, originals: Partial<CheckInputs>, conv: Conv): Record<string, unknown> | null {
  const f: F = (n, o) => {
    const v = conv(n, o);
    if (v === null) throw new NoRate();
    return v;
  };
  const out: Record<string, unknown> = {};
  try {
    for (const key of MONEY_KEYS) {
      if (!(key in values)) continue;
      const map = MONEY[key] as (v: unknown, o: unknown, f: F) => unknown;
      out[key] = map(values[key], originals[key], f);
    }
  } catch {
    // the mappers are plain object copies: the only throw is NoRate
    return null;
  }
  return out;
}

function converter(source: SnapshotResult, from: string, to: string): ((amount: number) => number | null) | null {
  const fx = source.fx;
  if (fx === undefined) return null;
  return (amount) => convertLatest(amount, from, to, fx.rates, fx.customs, fx.today)?.amount ?? null;
}

/** The check's inputs in the snapshot currency, for computing and showing (D-67). */
export function inHomeCurrency(inputs: CheckInputs, source: SnapshotResult, opts: { isSample: boolean }): InHome {
  const home = source.currency;
  const from = typedCurrency(inputs, home, opts.isSample);
  if (from === home) return { kind: 'home', inputs };
  const missing: InHome = { kind: 'missing', inputs, unconverted: { currencies: [from], rowCount: 1 } };
  const toHome = converter(source, from, home);
  if (toHome === null) return missing;
  const money = mapMoney(inputs, {}, (n) => toHome(n));
  if (money === null) return missing;
  return { kind: 'converted', inputs: { ...inputs, ...money, currency: home } as CheckInputs, note: { from, to: home } };
}

/**
 * An edit made on the converted view, converted back into the typed currency before it is saved. `stored` is the saved
 * inputs the view was built from: an amount whose stored value still converts to the edited one is kept exactly. The
 * stamped currency is never part of a saved edit (D-37).
 */
export function fromHomePatch(patch: Partial<CheckInputs>, stored: CheckInputs, source: SnapshotResult, opts: { isSample: boolean }): Partial<CheckInputs> {
  const home = source.currency;
  const from = typedCurrency(stored, home, opts.isSample);
  const { currency: _stamp, ...rest } = patch;
  const toHome = converter(source, from, home);
  const toTyped = converter(source, home, from);
  if (from === home || toHome === null || toTyped === null) return rest;
  const back: Conv = (amount, original) => (original !== undefined && toHome(original) === amount ? original : toTyped(amount));
  // an amount too large to convert back leaves the edit as typed (the price bound refuses it downstream)
  const money = mapMoney(rest, stored, back);
  return money === null ? rest : ({ ...rest, ...money } as Partial<CheckInputs>);
}

/** The snapshot a check is judged against: its own missing rate makes every figure unconverted (D-37). */
export function sourceFor(source: SnapshotResult, view: InHome): SnapshotResult {
  return view.kind === 'missing' && source.unconverted === null ? { ...source, unconverted: view.unconverted } : source;
}
