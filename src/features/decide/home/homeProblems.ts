/**
 * 05-111 (D-96; UI-SPEC R17.5, R17.13 M4): the "Needs a look" entries and the notice row text. PURE: no React, no I/O,
 * no clock (`today` and `now` are passed in) and no money formatting. Entries carry codes and raw parameters; the
 * renderer maps them to copy, and formats any amount with formatMoney / formatMoneyA11y.
 *
 * Every problem is listed (T-05-111-02). Only problems the dark card does not already show are counted, so a first-run
 * user, or one whose card is unavailable for a missing rate, gets no notice row from those.
 */
import type { SyncStatus } from '@/data/sync/useSyncStatus';
import { syncStatusLabel, type SyncLabel } from '@/ui/syncStatusLabel';
import { potSetAside } from '@/engine/decide';
import { inHomeCurrency } from '../snapshot/checkCurrency';
import type { CheckInputs, SnapshotResult } from '../snapshot/types';

/** A rate older than this many days is listed (user, 2026-10-23). */
export const STALE_RATE_DAYS = 30;

export type ProblemAction =
  | { kind: 'add_rough' }
  | { kind: 'exchange_rates' }
  | { kind: 'review_changes' }
  | { kind: 'review_edits' }
  | { kind: 'pots' }
  | { kind: 'card_minimum'; accountId: string };

export type ProblemEntry =
  /** 1: no full month and no rough figures. */
  | { id: 'no_figures'; counted: false; action: ProblemAction }
  /** 2: a needed exchange rate is missing: lines (the card shows it), the card check limit, or checks typed in a currency with no rate. */
  | { id: 'missing_rate'; variant: 'lines'; currency: string; rowCount: number; counted: false; action: ProblemAction }
  | { id: 'missing_rate'; variant: 'card_limit'; counted: true; action: ProblemAction }
  | { id: 'missing_rate'; variant: 'check'; currency: string; checkCount: number; counted: true; action: ProblemAction }
  /** 2, pot variant (D-101): pots left out for want of a stored rate; the card shows the gap, so not counted (like 'lines'). `currency` lists the missing ones. */
  | { id: 'missing_rate'; variant: 'pots'; currency: string; potCount: number; counted: false; action: ProblemAction }
  /** 3 and 4: failed saves and conflicts, both through FailedWritesSheet. */
  | { id: 'failed_saves'; count: number; counted: true; action: ProblemAction }
  | { id: 'conflicts'; count: number; counted: true; action: ProblemAction }
  /** 5: a card owing a balance has no minimum (D-40). */
  | { id: 'card_minimum'; accountId: string; cardName: string; counted: true; action: ProblemAction }
  /** 6: a rate used in the figures is older than 30 days. `rateDate` is the stored 'YYYY-MM-DD'. */
  | { id: 'stale_rate'; currency: string; rateDate: string; counted: true; action: ProblemAction }
  /** 7: offline with writes waiting, or writes stuck over 5 s. No action: "They send when the connection returns." */
  /** 8: pots past their ready-by date (D-101). */
  | { id: 'pot_past_due'; count: number; counted: true; action: ProblemAction }
  | { id: 'sync'; label: SyncLabel; dot: boolean; counted: true; action: null };

export interface OpenCheckForProblems {
  inputs: CheckInputs;
  isSample: boolean;
}

export interface HomeProblemsInput {
  source: SnapshotResult | null;
  /** Open checks, parsed; used for the D-67 check (typed in a currency with no stored rate). */
  openChecks: readonly OpenCheckForProblems[];
  sync: SyncStatus;
  /** The local date, 'YYYY-MM-DD'. */
  today: string;
  /** Epoch ms, for the 5 s sync rule. */
  now: number;
}

const DAY_MS = 86_400_000;

/** Whole days from one 'YYYY-MM-DD' to another (calendar arithmetic in UTC, so DST never shifts a day). */
function daysBetween(from: string, to: string): number {
  const parse = (iso: string) => {
    const [y = 0, m = 1, d = 1] = iso.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / DAY_MS);
}

export function homeProblems(input: HomeProblemsInput): ProblemEntry[] {
  const { source, sync, today, now } = input;
  const entries: ProblemEntry[] = [];

  // 1: no figures
  if (source !== null && source.kind === 'none' && source.unconverted === null) {
    entries.push({ id: 'no_figures', counted: false, action: { kind: 'add_rough' } });
  }

  // 2: a missing rate. Lines: the card already shows it. The card limit and a D-67 check are counted.
  if (source !== null) {
    // unconverted rows include pots with no stored rate; those are counted in the pots entry below, not here too
    const lineRows = source.unconverted === null ? 0 : Math.max(0, source.unconverted.rowCount - source.meta.unconvertedPots);
    if (source.unconverted !== null && lineRows > 0) {
      for (const currency of source.unconverted.currencies) {
        entries.push({
          id: 'missing_rate',
          variant: 'lines',
          currency,
          rowCount: lineRows,
          counted: false,
          action: { kind: 'exchange_rates' },
        });
      }
    }
    if (source.meta.unconvertedPots > 0 && source.unconverted !== null) {
      entries.push({
        id: 'missing_rate',
        variant: 'pots',
        currency: source.unconverted.currencies.join(', '),
        potCount: source.meta.unconvertedPots,
        counted: false,
        action: { kind: 'exchange_rates' },
      });
    }
    if (source.cardMaxPurchase === null) {
      entries.push({ id: 'missing_rate', variant: 'card_limit', counted: true, action: { kind: 'exchange_rates' } });
    }
    const perCurrency = new Map<string, number>();
    for (const check of input.openChecks) {
      const view = inHomeCurrency(check.inputs, source, { isSample: check.isSample });
      if (view.kind !== 'missing') continue;
      for (const currency of view.unconverted.currencies) perCurrency.set(currency, (perCurrency.get(currency) ?? 0) + 1);
    }
    for (const [currency, checkCount] of perCurrency) {
      entries.push({ id: 'missing_rate', variant: 'check', currency, checkCount, counted: true, action: { kind: 'exchange_rates' } });
    }
  }

  // 3 and 4: failed saves, conflicts
  if (sync.failed > 0) entries.push({ id: 'failed_saves', count: sync.failed, counted: true, action: { kind: 'review_changes' } });
  if (sync.conflicts > 0) entries.push({ id: 'conflicts', count: sync.conflicts, counted: true, action: { kind: 'review_edits' } });

  // 5: card minimum not set, one entry per card in account order
  if (source !== null) {
    for (const accountId of source.meta.cardsWithoutMinimumIds ?? []) {
      const card = source.cards.find((c) => c.accountId === accountId);
      entries.push({ id: 'card_minimum', accountId, cardName: card?.name ?? '', counted: true, action: { kind: 'card_minimum', accountId } });
    }
  }

  // 6: a rate older than 30 days (a rate dated today or in the future is never stale)
  if (source !== null) {
    for (const conversion of source.conversions) {
      if (daysBetween(conversion.rateDate, today) > STALE_RATE_DAYS) {
        entries.push({ id: 'stale_rate', currency: conversion.currency, rateDate: conversion.rateDate, counted: true, action: { kind: 'exchange_rates' } });
      }
    }
  }

  // 8 (listed before sync, which stays last): pots past their date
  if (source !== null) {
    const pastDue = (source.pots ?? []).filter((pot) => potSetAside(pot, today).state === 'past_due').length;
    if (pastDue > 0) entries.push({ id: 'pot_past_due', count: pastDue, counted: true, action: { kind: 'pots' } });
  }

  // 7: offline or waiting writes (R16 sync rules). The dot is for offline with writes waiting only (M4).
  const primary = syncStatusLabel(sync, now).primary;
  if (primary !== null) {
    entries.push({ id: 'sync', label: primary, dot: primary.key === 'sync.offlineWaiting', counted: true, action: null });
  }

  return entries;
}

export type NoticeRowText =
  | { kind: 'sync'; label: SyncLabel }
  | { kind: 'items'; count: number };

export type NoticeRowModel = { visible: false } | { visible: true; text: NoticeRowText; dot: boolean };

/**
 * The notice row. Hidden when nothing is counted. When the sync state is the only counted entry its own text shows
 * ("Offline", "Offline · {n} changes waiting", "Saving…", "{n} changes waiting"); otherwise "{n} items need a look".
 * The dot is reserved for real problems, so slow saves and waiting writes show none.
 */
export function noticeRowModel(entries: readonly ProblemEntry[]): NoticeRowModel {
  const counted = entries.filter((e) => e.counted);
  if (counted.length === 0) return { visible: false };
  const only = counted[0];
  if (counted.length === 1 && only !== undefined && only.id === 'sync') {
    return { visible: true, text: { kind: 'sync', label: only.label }, dot: only.dot };
  }
  return { visible: true, text: { kind: 'items', count: counted.length }, dot: true };
}
