/**
 * Refund re-dating (05.2 D-06..D-09, D-11; owner decisions 1-3). Pure.
 *
 * A refund linked to a purchase (V3Line.refundOf) counts in the purchase's month, up to the purchase price, with the
 * purchase's date and category. Any amount above the price stays in the refund's own month as money in ('other_in',
 * id suffixed ':surplus'). Several refunds on one purchase are applied in date order (tie broken by id).
 *
 * Nothing is stored (D-07): the move is recomputed from the lines on every evaluation, so removing the link reverses it.
 * A refund whose purchase is not in the months (outside the read window, or deleted), or whose purchase is not a
 * 'spending' line, is left where it is. A refund of a payment-plan purchase is a credit to the purchase month; the
 * plan's series is untouched (D-09).
 *
 * Line amounts are positive magnitudes for both 'spending' and 'refund' lines (buildV3Inputs); the maths is bigint.
 *
 * Unspent anchor note: a refund whose purchase sits before the unspent anchor is now dated before the anchor, so
 * rollForward ignores it and confirmed unspent does not rise when the refund arrives (intended; fixes the 05.1-18 drift).
 *
 * Run once at the top of evaluate() (D-11) so typical month, this month, income pattern and unspent read the same months.
 * Idempotent: a moved credit carries refundOf null.
 */
import { minorFromBigInt } from '../../../payoff/types';
import type { V3Inputs, V3Line, V3Month } from '../types';

interface Located {
  readonly line: V3Line;
  readonly monthIndex: number;
}

interface Edit {
  readonly removed: Set<string>;
  readonly added: V3Line[];
}

function isLinked(line: V3Line): boolean {
  return line.role === 'refund' && typeof line.refundOf === 'string';
}

/** Moves linked refunds into their purchase's month. Returns the same array when nothing is linked. */
export function redateRefunds(months: readonly V3Month[]): readonly V3Month[] {
  const byId = new Map<string, Located>();
  const groups = new Map<string, Located[]>();
  months.forEach((m, monthIndex) => {
    for (const line of m.lines) byId.set(line.id, { line, monthIndex });
  });
  months.forEach((m, monthIndex) => {
    for (const line of m.lines) {
      if (!isLinked(line) || BigInt(line.amount) <= 0n) continue;
      const target = byId.get(line.refundOf as string);
      if (target === undefined || target.line.role !== 'spending') continue;
      const group = groups.get(target.line.id) ?? [];
      group.push({ line, monthIndex });
      groups.set(target.line.id, group);
    }
  });
  if (groups.size === 0) return months;

  const edits = new Map<number, Edit>();
  const editOf = (i: number): Edit => {
    const e = edits.get(i) ?? { removed: new Set<string>(), added: [] };
    edits.set(i, e);
    return e;
  };
  for (const [purchaseId, group] of groups) {
    const { line: purchase, monthIndex: purchaseMonth } = byId.get(purchaseId) as Located;
    group.sort((a, b) => (a.line.date < b.line.date ? -1 : a.line.date > b.line.date ? 1 : a.line.id < b.line.id ? -1 : 1));
    let room = BigInt(purchase.amount);
    for (const { line: r, monthIndex } of group) {
      const amount = BigInt(r.amount);
      const credit = amount < room ? amount : room;
      room -= credit;
      editOf(monthIndex).removed.add(r.id);
      if (credit > 0n) {
        editOf(purchaseMonth).added.push({ ...r, date: purchase.date, categoryId: purchase.categoryId, amount: minorFromBigInt(credit, 'redateRefunds'), refundOf: null });
      }
      if (amount > credit) {
        editOf(monthIndex).added.push({ ...r, id: `${r.id}:surplus`, role: 'other_in', amount: minorFromBigInt(amount - credit, 'redateRefunds'), refundOf: null });
      }
    }
  }

  return months.map((m, i) => {
    const e = edits.get(i);
    if (e === undefined) return m;
    const kept = m.lines.filter((l) => !e.removed.has(l.id));
    const lines = [...kept, ...e.added]
      .map((l, idx) => ({ l, idx }))
      .sort((a, b) => (a.l.date < b.l.date ? -1 : a.l.date > b.l.date ? 1 : a.idx - b.idx))
      .map((x) => x.l);
    return { ...m, lines };
  });
}

/** The inputs with linked refunds re-dated; the same object when no line carries a refund link. */
export function withRedatedRefunds(inputs: V3Inputs): V3Inputs {
  const months = redateRefunds(inputs.months);
  return months === inputs.months ? inputs : { ...inputs, months };
}
