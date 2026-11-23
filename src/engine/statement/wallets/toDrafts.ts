/**
 * Turns read wallet lines into one StatementDraft per currency (D-22), a fee
 * expense line per fee (D-23) and a transfer pair per currency conversion
 * (IMP-06). Rows carry gross; fees are separate, so each currency's balance
 * moves by exactly the net.
 */
import type { DraftRow, StatementDraft } from '../types';
import type { WalletDrafts, WalletFeeLine, WalletLine, WalletRead, WalletTransferPair } from './types';

function toRow(l: WalletLine): DraftRow {
  const balance = l.balanceMinor;
  return {
    index: l.index,
    localDate: l.localDate,
    description: l.description,
    magnitude: Math.abs(l.grossMinor),
    marker: l.grossMinor < 0 ? 'minus' : 'none',
    rawAmount: null,
    balanceMagnitude: balance === null ? null : Math.abs(balance),
    balanceMarker: balance !== null && balance < 0 ? 'minus' : 'none',
    rawBalance: null,
    currency: l.currency,
    externalId: l.externalId,
    trnType: l.grossMinor < 0 ? 'DEBIT' : 'CREDIT',
    issues: l.description === '' ? ['empty-description'] : [],
  };
}

function pairsOf(lines: readonly WalletLine[]): WalletTransferPair[] {
  const byKey = new Map<string, WalletLine[]>();
  for (const l of lines) {
    if (l.kind !== 'conversion' || l.pairKey === null) continue;
    byKey.set(l.pairKey, [...(byKey.get(l.pairKey) ?? []), l]);
  }
  const pairs: WalletTransferPair[] = [];
  for (const group of byKey.values()) {
    const [a, b] = group as [WalletLine, WalletLine];
    // Only a clean two-line, two-currency group is a conversion; anything else stays plain payments
    if (group.length !== 2 || a.currency === b.currency) continue;
    const from = a.grossMinor < 0 ? a : b;
    const to = from === a ? b : a;
    pairs.push({
      fromIndex: from.index,
      toIndex: to.index,
      fromCurrency: from.currency,
      toCurrency: to.currency,
      feeIndex: from.feeMinor > 0 ? from.index : to.feeMinor > 0 ? to.index : null,
    });
  }
  return pairs;
}

export function walletToDrafts(read: Extract<WalletRead, { ok: true }>): WalletDrafts {
  const currencies = [...new Set(read.lines.map((l) => l.currency))].sort();
  const drafts: StatementDraft[] = currencies.map((currency) => {
    const mine = read.lines.filter((l) => l.currency === currency);
    const dates = mine.map((l) => l.localDate).sort();
    return {
      source: 'csv',
      layoutSignature: `wallet|${read.wallet}|${currency}`,
      accountHint: 'bank',
      currency,
      rows: mine.filter((l) => l.kind !== 'fee-only').map(toRow),
      statedOpening: null,
      statedClosing: null,
      available: null,
      statedLimit: null,
      balanceLabel: null,
      labels: [],
      periodStart: dates[0] as string,
      periodEnd: dates[dates.length - 1] as string,
      warnings: [],
    };
  });
  const feeLines: WalletFeeLine[] = read.lines
    .filter((l) => l.feeMinor > 0)
    .map((l) => ({ forIndex: l.index, currency: l.currency, localDate: l.localDate, magnitude: l.feeMinor }));
  return { wallet: read.wallet, drafts, feeLines, transferPairs: pairsOf(read.lines), currencies };
}
