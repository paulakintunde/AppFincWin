/**
 * 05-111 (D-95, D-97; UI-SPEC R17.3, R17.4, R17.13 M3): what the dark card on Decide home says. PURE: no React, no I/O,
 * and no money formatting (amounts are raw integer minor units; the renderer calls formatMoney / formatMoneyA11y).
 *
 * The figure is never recomputed here: a logged source reads the engine's own `prepareContext` (the same derivation the
 * Your month card used), a rough source reads the figures the user gave. A needed rate that is missing makes the card
 * 'unavailable', never a guessed number (D-37, T-05-111-01).
 */
import { prepareContext, totalSetAside } from '@/engine/decide';
import type { DecideSettingsRow } from '@/db/decideSettings';
import type { SnapshotResult } from '../snapshot/types';

/** Under this many full months the engine judges on the lowest month in and the highest month out (04 D-12). */
const MIN_FULL_MONTHS = 3;

/** The card label. 'tightest' carries the tightestFigures info (R17.13 M3); 'switched' shows on the first visit after the switch only. */
export type HomeCardLabel = 'average' | 'worst' | 'tightest' | 'figures' | 'switched';

export type HomeCardUnavailable =
  /** No full month and no rough figure: action 'Add rough figures'. */
  | { reason: 'first_run'; action: 'add_rough' }
  /** Lines in these currencies wait for a stored rate: action 'See lines waiting for a rate'. */
  | { reason: 'missing_rate'; currencies: readonly string[]; action: 'see_rate_lines' }
  /** A logged source with no money-in basis the engine can use: action 'Add rough figures'. */
  | { reason: 'no_basis'; action: 'add_rough' };

export type HomeCardModel =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'first_run'; label: 'figures'; unavailable: Extract<HomeCardUnavailable, { reason: 'first_run' }> }
  | { state: 'unavailable'; label: HomeCardLabel; unavailable: Exclude<HomeCardUnavailable, { reason: 'first_run' }> }
  | {
      state: 'figure';
      label: HomeCardLabel;
      /** 'tightestFigures' when the label is 'tightest' (the ⓘ beside it), else null. */
      info: 'tightestFigures' | null;
      /** Absolute value in minor units; no minus sign. */
      amount: number;
      /** True = "{amount} short"; false = "{amount} left". */
      short: boolean;
      /** Money in and everything that leaves (D-100 addendum), minor units: inAmount - outAmount is the signed hero. */
      inAmount: number;
      outAmount: number;
      /** The rows of Month details, adding up to the hero. */
      breakdown: MonthBreakdown;
      /** True when the home rendered with the logged basis: the caller then sets `homeBasisSeen`. */
      markBasisSeen: boolean;
    };

/**
 * 05-125 (D-100, R18.1): the Month details breakdown. Every row is read from the engine's own derivation (logged) or
 * from the same formula over the rough figures, so `income - spending - debts - saving - setAside === result` always.
 */
export interface MonthBreakdown {
  source: 'logged' | 'rough';
  income: number;
  spending: number;
  /** Debt payments; 0 on a rough source (no debts are known). */
  debts: number;
  /** Saving and investing (pausable); 0 on a rough source. */
  saving: number;
  /** The pots' monthly set-asides (D-101). */
  setAside: number;
  /** Net free cash flow, signed. */
  result: number;
}

/** Everything that leaves in the breakdown: money in minus the result, so In - Out equals the hero (D-100 addendum). */
export function breakdownOut(b: MonthBreakdown): number {
  return b.income - b.result;
}

/**
 * The breakdown for a source; null when there is none to show. A rough source takes the pots' set-asides off its
 * rough spending exactly as a logged month does (`totalSetAside`, the engine's own sum), so both follow one formula.
 */
export function monthBreakdown(source: SnapshotResult, today: string): MonthBreakdown | null {
  if (source.kind === 'logged') {
    const ctx = prepareContext(source.snapshot);
    if (!ctx.ok) return null;
    const c = ctx.context;
    return {
      source: 'logged',
      income: c.money.incomeBasis,
      spending: c.money.spendingBasis,
      debts: c.debtPayments,
      saving: c.pausable,
      setAside: c.setAside,
      result: c.leftBefore,
    };
  }
  if (source.kind === 'rough') {
    const setAside = totalSetAside(source.pots ?? [], today).total;
    const { monthlyIncome, monthlySpending } = source.figures;
    return { source: 'rough', income: monthlyIncome, spending: monthlySpending, debts: 0, saving: 0, setAside, result: monthlyIncome - monthlySpending - setAside };
  }
  return null;
}

export interface HomeCardFlags {
  status: 'loading' | 'error' | 'ready';
  /** The local date the pots' set-asides are worked out from (rough source only; a logged source uses its snapshot's asOf). */
  today: string;
  /** The per-user `homeBasisSeen` flag (05-110); a failed read counts as not seen. */
  homeBasisSeen: boolean;
}

function hasRough(settings: DecideSettingsRow | null): boolean {
  return settings !== null && (settings.rough_income !== null || settings.rough_spending !== null);
}

export function homeCardModel(source: SnapshotResult | null, settings: DecideSettingsRow | null, flags: HomeCardFlags): HomeCardModel {
  if (flags.status === 'loading') return { state: 'loading' };
  if (flags.status === 'error') return { state: 'error' };
  if (source === null) return { state: 'loading' };

  const loggedContext = source.kind === 'logged' ? prepareContext(source.snapshot) : null;
  const money = loggedContext !== null && loggedContext.ok ? loggedContext.context.money : null;

  // The label the engine's basis gives; "Your figures" before a logged month decides it (D-04).
  let label: HomeCardLabel = 'figures';
  if (money !== null) {
    if (money.fullMonthsUsed < MIN_FULL_MONTHS) label = 'tightest';
    else label = money.basis === 'average' ? 'average' : 'worst';
    // D-95: the switch label replaces the normal one on the first visit after real history replaced rough figures.
    if (!flags.homeBasisSeen && hasRough(settings)) label = 'switched';
  }

  // D-37: a needed rate is missing, so there is no figure to show (T-05-111-01).
  if (source.unconverted !== null) {
    return {
      state: 'unavailable',
      label,
      unavailable: { reason: 'missing_rate', currencies: source.unconverted.currencies, action: 'see_rate_lines' },
    };
  }

  if (source.kind === 'none') {
    return { state: 'first_run', label: 'figures', unavailable: { reason: 'first_run', action: 'add_rough' } };
  }

  const breakdown = monthBreakdown(source, flags.today);
  if (breakdown === null) {
    return { state: 'unavailable', label: 'figures', unavailable: { reason: 'no_basis', action: 'add_rough' } };
  }
  if (source.kind === 'rough') return figure('figures', null, breakdown);
  return figure(label, label === 'tightest' ? 'tightestFigures' : null, breakdown);
}

function figure(label: HomeCardLabel, info: 'tightestFigures' | null, breakdown: MonthBreakdown): HomeCardModel {
  const left = breakdown.result;
  return {
    state: 'figure',
    label,
    info,
    amount: left < 0 ? -left : left,
    short: left < 0,
    inAmount: breakdown.income,
    outAmount: breakdownOut(breakdown),
    breakdown,
    markBasisSeen: breakdown.source === 'logged',
  };
}
