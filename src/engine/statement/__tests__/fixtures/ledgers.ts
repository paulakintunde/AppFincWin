/**
 * Test-only ledger fixture generator for profile.test.ts's property tests
 * (plan 02-36). Not engine code -- lives under __tests__ and is never
 * imported by anything under src/engine/statement/*.ts itself.
 *
 * `arbLedger` produces a "true" ledger (an opening balance plus a sequence
 * of signed amounts, in the app's own stored sign convention). `renderDraft`
 * then renders that true ledger as a `StatementDraft` under a chosen sign
 * convention (`s`), balance meaning (`held` or `owed`), and physical row
 * order (`asc`/`desc`) -- reverse-engineering the magnitude/marker pair
 * that would make `convertDraft` recover the true ledger exactly under the
 * profile `{ positiveMeans: s === 1 ? 'money-in' : 'money-spent', balanceMeans }`.
 */
import fc from 'fast-check';
import { minorUnits, type AmountMarker, type MinorUnits } from '../../../money';
import type { DraftRow, StatementDraft } from '../../types';

export interface Ledger {
  opening: number;
  amounts: number[];
  dates: string[];
}

function dateFor(i: number): string {
  const day = String((i % 28) + 1).padStart(2, '0');
  return `2026-01-${day}`;
}

export function arbLedger(): fc.Arbitrary<Ledger> {
  return fc
    .record({
      opening: fc.integer({ min: -1_000_000_000_000, max: 1_000_000_000_000 }),
      amounts: fc.array(fc.integer({ min: -1_000_000_000_000, max: 1_000_000_000_000 }), {
        minLength: 1,
        maxLength: 200,
      }),
    })
    .filter((l) => l.amounts.some((a) => a !== 0))
    .map((l) => ({ ...l, dates: l.amounts.map((_, i) => dateFor(i)) }));
}

export interface RenderOptions {
  s: 1 | -1;
  balanceMeans: 'held' | 'owed';
  kind: 'checking' | 'savings' | 'cash' | 'investment' | 'other' | 'credit' | 'loan';
  orientation: 'asc' | 'desc';
  withBalances: boolean;
}

function markerForAmount(trueAmount: number, s: 1 | -1): AmountMarker {
  if (trueAmount === 0) return 'none';
  const rawSign = Math.sign(trueAmount) * s;
  return rawSign === 1 ? 'none' : 'minus';
}

function markerForBalance(trueBalance: number, balanceMeans: 'held' | 'owed'): AmountMarker {
  if (trueBalance === 0) return 'none';
  if (balanceMeans === 'held') return trueBalance > 0 ? 'none' : 'minus';
  return trueBalance > 0 ? 'minus' : 'none';
}

/** Renders a true ledger as a StatementDraft that, converted under the matching
 * profile, reproduces `amounts`/running-balances exactly. */
export function renderDraft(ledger: Ledger, opts: RenderOptions): StatementDraft {
  const n = ledger.amounts.length;
  let running = ledger.opening;
  const trueBalances: number[] = [];
  for (const a of ledger.amounts) {
    running += a;
    trueBalances.push(running);
  }

  const order = opts.orientation === 'asc' ? Array.from({ length: n }, (_, i) => i) : Array.from({ length: n }, (_, i) => n - 1 - i);

  const rows: DraftRow[] = order.map((i, pos) => {
    const amt = ledger.amounts[i] as number;
    const bal = trueBalances[i] as number;
    const marker = markerForAmount(amt, opts.s);
    const magnitude: MinorUnits = minorUnits(Math.abs(amt));
    let balanceMagnitude: MinorUnits | null = null;
    let balanceMarker: AmountMarker = 'none';
    let rawBalance: string | null = null;
    if (opts.withBalances) {
      balanceMagnitude = minorUnits(Math.abs(bal));
      balanceMarker = markerForBalance(bal, opts.balanceMeans);
      rawBalance = String(bal);
    }
    return {
      index: pos,
      localDate: ledger.dates[i] ?? null,
      description: 'Row',
      magnitude,
      marker,
      rawAmount: String(amt),
      balanceMagnitude,
      balanceMarker,
      rawBalance,
      currency: 'GBP',
      externalId: null,
      trnType: null,
      issues: [],
    };
  });

  return {
    source: 'csv',
    layoutSignature: 'date|description|amount|balance',
    accountHint: opts.kind === 'credit' ? 'card' : 'bank',
    currency: 'GBP',
    rows,
    statedOpening: opts.withBalances
      ? {
          magnitude: minorUnits(Math.abs(ledger.opening)),
          marker: markerForBalance(ledger.opening, opts.balanceMeans),
          asOf: null,
          raw: String(ledger.opening),
        }
      : null,
    statedClosing: null,
    available: null,
    statedLimit: null,
    balanceLabel: null,
    labels: [],
    periodStart: null,
    periodEnd: null,
    warnings: [],
  };
}
