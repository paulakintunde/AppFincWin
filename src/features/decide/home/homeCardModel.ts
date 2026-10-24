/**
 * 05-111 (D-95, D-97; UI-SPEC R17.3, R17.4, R17.13 M3): what the dark card on Decide home says. PURE: no React, no I/O,
 * and no money formatting (amounts are raw integer minor units; the renderer calls formatMoney / formatMoneyA11y).
 *
 * The figure is never recomputed here: a logged source reads the engine's own `prepareContext` (the same derivation the
 * Your month card used), a rough source reads the figures the user gave. A needed rate that is missing makes the card
 * 'unavailable', never a guessed number (D-37, T-05-111-01).
 */
import { prepareContext } from '@/engine/decide';
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
      /** Money in and money out of the judged month, minor units. */
      inAmount: number;
      outAmount: number;
      /** True when the home rendered with the logged basis: the caller then sets `homeBasisSeen`. */
      markBasisSeen: boolean;
    };

export interface HomeCardFlags {
  status: 'loading' | 'error' | 'ready';
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

  if (source.kind === 'rough') {
    const { monthlyIncome, monthlySpending } = source.figures;
    return figure('figures', null, monthlyIncome - monthlySpending, monthlyIncome, monthlySpending, false);
  }

  if (loggedContext === null || !loggedContext.ok || money === null) {
    return { state: 'unavailable', label: 'figures', unavailable: { reason: 'no_basis', action: 'add_rough' } };
  }
  return figure(label, label === 'tightest' ? 'tightestFigures' : null, loggedContext.context.leftBefore, money.incomeBasis, money.spendingBasis, true);
}

function figure(
  label: HomeCardLabel,
  info: 'tightestFigures' | null,
  left: number,
  inAmount: number,
  outAmount: number,
  logged: boolean
): HomeCardModel {
  return {
    state: 'figure',
    label,
    info,
    amount: left < 0 ? -left : left,
    short: left < 0,
    inAmount,
    outAmount,
    markBasisSeen: logged,
  };
}
