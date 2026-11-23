// 10-26 (IMP-06, D-21..D-23): the pure wallet import model -- per-currency targets, held-back lines
// and the rows, fee expenses and conversion pairs a commit writes. No React.
import { readWallet, walletToDrafts, type WalletDrafts } from '@/engine/statement';
import { csv, REVOLUT_HEADER, revolutRow, WISE_HEADER, wiseRow } from '@/engine/statement/__tests__/wallets/synthetic';
import { buildWalletCommit, walletItems, walletLabel, walletPlan, type WalletItem } from '../walletModel';

function wiseDrafts(): WalletDrafts {
  const text = csv(WISE_HEADER, [
    wiseRow({ id: 'A', amount: '-10.00', currency: 'EUR', description: 'Coffee', fees: '0.30' }),
    wiseRow({ id: 'B', amount: '25.00', currency: 'GBP', description: 'Refund' }),
    wiseRow({ id: 'C', amount: '40.00', currency: 'EUR', description: 'Gift' }),
  ]);
  const read = readWallet(text);
  if (read === null || !read.ok) throw new Error('fixture must read');
  return walletToDrafts(read);
}

function revolutConversion(): WalletDrafts {
  const text = csv(REVOLUT_HEADER, [
    revolutRow({ type: 'EXCHANGE', description: 'Exchanged to GBP', amount: '-100.00', fee: '0.50', currency: 'EUR', date: '2026-03-05 10:00:00' }),
    revolutRow({ type: 'EXCHANGE', description: 'Exchanged from EUR', amount: '85.10', fee: '0.00', currency: 'GBP', date: '2026-03-05 10:00:00' }),
    revolutRow({ description: 'Bakery', amount: '-12.50', currency: 'EUR', date: '2026-03-06 09:00:00' }),
  ]);
  const read = readWallet(text);
  if (read === null || !read.ok) throw new Error('fixture must read');
  return walletToDrafts(read);
}

let n = 0;
const newId = (): string => `id-${(n += 1)}`;
const base = { householdId: 'h1', timeZone: 'UTC', batchId: 'b1', feesCategoryId: 'fees', transferCategoryId: 'xfer' };

describe('walletPlan', () => {
  it('offers a new account per currency, nothing created and nothing counted until switched on', () => {
    const plan = walletPlan(wiseDrafts(), []);
    expect(plan.wallet).toBe('wise');
    expect(plan.targets).toEqual([
      { currency: 'EUR', accountId: null, createName: 'Wise EUR', create: false },
      { currency: 'GBP', accountId: null, createName: 'Wise GBP', create: false },
    ]);
    expect(plan.counts.newAccounts).toBe(0);
  });

  it('suggests the single non-archived account in that currency that carries the wallet name', () => {
    const plan = walletPlan(wiseDrafts(), [
      { id: 'a1', name: 'My Wise EUR', currency: 'EUR', archived: false },
      { id: 'a2', name: 'Wise GBP old', currency: 'GBP', archived: true },
    ]);
    expect(plan.targets[0]).toEqual({ currency: 'EUR', accountId: 'a1', createName: null, create: false });
    expect(plan.targets[1]?.accountId).toBeNull();
  });

  it('does not guess when two accounts match', () => {
    const plan = walletPlan(wiseDrafts(), [
      { id: 'a1', name: 'Wise one', currency: 'EUR', archived: false },
      { id: 'a2', name: 'Wise two', currency: 'EUR', archived: false },
    ]);
    expect(plan.targets[0]?.accountId).toBeNull();
  });

  it('holds back lines whose currency has no account and no switch', () => {
    const d = wiseDrafts();
    const plan = walletPlan(d, [{ id: 'a1', name: 'Wise EUR', currency: 'EUR', archived: false }]);
    const gbp = d.drafts.find((x) => x.currency === 'GBP')!.rows.map((r) => r.index);
    expect(plan.heldBack).toEqual(gbp);
    expect(plan.counts.lines).toBe(2);
  });

  it('counts a switched-on currency as a new account and does not hold its lines back', () => {
    const plan = walletPlan(wiseDrafts(), [], { create: new Set(['GBP']) });
    expect(plan.counts.newAccounts).toBe(1);
    expect(plan.targets[1]).toMatchObject({ currency: 'GBP', create: true });
    expect(plan.heldBack).toHaveLength(2); // only EUR is held back
  });

  it('a chosen existing account wins over the suggestion', () => {
    const plan = walletPlan(wiseDrafts(), [{ id: 'a1', name: 'Wise EUR', currency: 'EUR', archived: false }], {
      link: new Map([['EUR', 'other']]),
    });
    expect(plan.targets[0]?.accountId).toBe('other');
  });

  it('counts fees and conversions only for available currencies', () => {
    const d = revolutConversion();
    const none = walletPlan(d, []);
    expect(none.counts).toMatchObject({ lines: 0, fees: 0, conversions: 0 });
    const both = walletPlan(d, [], { link: new Map([['EUR', 'e'], ['GBP', 'g']]) });
    expect(both.counts).toMatchObject({ lines: 3, fees: 1, conversions: 1 });
    const onlyEur = walletPlan(d, [], { link: new Map([['EUR', 'e']]) });
    expect(onlyEur.counts.conversions).toBe(0);
  });

  it('labels', () => {
    expect(walletLabel('paypal')).toBe('PayPal');
  });
});

describe('walletItems', () => {
  const linkAll = { link: new Map([['EUR', 'e'], ['GBP', 'g']]) };

  it('shows a linked conversion as one item with its fee, and the other lines plain', () => {
    const d = revolutConversion();
    const items = walletItems(d, walletPlan(d, [], linkAll));
    expect(items.map((i) => i.kind)).toEqual(['conversion', 'line']);
    const conv = items[0] as Extract<WalletItem, { kind: 'conversion' }>;
    expect([conv.from.currency, conv.to.currency]).toEqual(['EUR', 'GBP']);
    expect(conv.fee).toEqual({ magnitude: 50, currency: 'EUR' });
  });

  it('splits an unlinked conversion into two lines and offers to link it again', () => {
    const d = revolutConversion();
    const from = d.transferPairs[0]!.fromIndex;
    const items = walletItems(d, walletPlan(d, [], { ...linkAll, unlinked: new Set([from]) }), new Set([from]));
    expect(items.map((i) => i.kind)).toEqual(['line', 'line', 'line']);
    expect(items.filter((i) => i.kind === 'line' && i.relinkFrom === from)).toHaveLength(1);
  });

  it('marks lines with no account as held back and keeps a fee under its payment', () => {
    const d = wiseDrafts();
    const items = walletItems(d, walletPlan(d, [], { link: new Map([['EUR', 'e']]) }));
    const lines = items.filter((i): i is Extract<WalletItem, { kind: 'line' }> => i.kind === 'line');
    expect(lines.filter((l) => l.held).map((l) => l.row.currency)).toEqual(['GBP']);
    expect(lines.find((l) => l.row.description === 'Coffee')?.fee).toEqual({ magnitude: 30, currency: 'EUR' });
  });
});

describe('buildWalletCommit', () => {
  it('writes payments at gross with the fee as its own linked expense', () => {
    n = 0;
    const d = wiseDrafts();
    const out = buildWalletCommit({ ...base, drafts: d, accountByCurrency: new Map([['EUR', 'e'], ['GBP', 'g']]), newId });
    expect(out.rows).toHaveLength(3);
    const coffee = out.rows.find((r) => r.name === 'Coffee')!;
    expect(coffee).toMatchObject({ account_id: 'e', original_amount: -1000, original_currency: 'EUR', status: 'paid', import_batch_id: 'b1' });
    expect(out.walletFees).toHaveLength(1);
    expect(out.walletFees[0]).toMatchObject({ forRowId: coffee.id, row: { account_id: 'e', original_amount: -30, category_id: 'fees', name: 'Wise fee' } });
  });

  it('per currency, inserted amounts equal the file net movement', () => {
    n = 0;
    const d = wiseDrafts();
    const out = buildWalletCommit({ ...base, drafts: d, accountByCurrency: new Map([['EUR', 'e'], ['GBP', 'g']]), newId });
    const all = [...out.rows, ...out.walletFees.map((f) => f.row)];
    const sum = (acct: string): number => all.filter((r) => r.account_id === acct).reduce((a, r) => a + r.original_amount, 0);
    expect(sum('e')).toBe(-1000 - 30 + 4000);
    expect(sum('g')).toBe(2500);
  });

  it('links a conversion as a pair with its fee as a separate expense', () => {
    n = 0;
    const out = buildWalletCommit({ ...base, drafts: revolutConversion(), accountByCurrency: new Map([['EUR', 'e'], ['GBP', 'g']]), newId });
    expect(out.walletPairs).toHaveLength(1);
    const pair = out.walletPairs[0]!;
    const from = out.rows.find((r) => r.id === pair.fromRowId)!;
    const to = out.rows.find((r) => r.id === pair.toRowId)!;
    expect([from.original_amount, to.original_amount]).toEqual([-10000, 8510]);
    expect([from.account_id, to.account_id]).toEqual(['e', 'g']);
    expect(out.walletFees).toHaveLength(1);
    expect(out.walletFees[0]).toMatchObject({ forRowId: pair.fromRowId, row: { original_amount: -50 } });
  });

  it('leaves a conversion as plain lines when no Transfer category is known, when the person unlinks it, or when one side is not imported', () => {
    n = 0;
    const accts = new Map([['EUR', 'e'], ['GBP', 'g']]);
    expect(buildWalletCommit({ ...base, transferCategoryId: null, drafts: revolutConversion(), accountByCurrency: accts, newId }).walletPairs).toEqual([]);
    const d = revolutConversion();
    const from = d.transferPairs[0]!.fromIndex;
    expect(buildWalletCommit({ ...base, drafts: d, accountByCurrency: accts, unlinked: new Set([from]), newId }).walletPairs).toEqual([]);
    const one = buildWalletCommit({ ...base, drafts: d, accountByCurrency: new Map([['EUR', 'e']]), newId });
    expect(one.walletPairs).toEqual([]);
    expect(one.rows.every((r) => r.account_id === 'e')).toBe(true);
  });

  it('never imports a line whose currency has no account', () => {
    n = 0;
    const out = buildWalletCommit({ ...base, drafts: wiseDrafts(), accountByCurrency: new Map([['EUR', 'e']]), newId });
    expect(out.rows.every((r) => r.original_currency === 'EUR')).toBe(true);
    expect(out.rows).toHaveLength(2);
  });
});
