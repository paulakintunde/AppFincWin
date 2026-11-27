// 10-26 (IMP-06, D-21..D-23): the pure wallet import model -- per-currency targets, held-back lines
// and the rows, fee expenses and conversion pairs a commit writes. No React.
import type { BuiltinCategoryKey } from '@/engine/categorize';
import { readWallet, walletToDrafts, type ExistingRow, type WalletDrafts } from '@/engine/statement';
import { csv, PAYPAL_HEADER, paypalRow, REVOLUT_HEADER, revolutRow, WISE_HEADER, wiseRow } from '@/engine/statement/__tests__/wallets/synthetic';
import { buildWalletCommit, walletItems, walletLabel, walletMarks, walletPlan, type WalletItem } from '../walletModel';

function wiseDrafts(): WalletDrafts {
  const text = csv(WISE_HEADER, [
    wiseRow({ id: 'A', amount: '-10.30', currency: 'EUR', description: 'Coffee', fees: '0.30' }), // fee-inclusive (10-review D-3)
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
    expect(conv.fee).toEqual({ magnitude: 50, currency: 'EUR', returned: false });
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
    expect(lines.find((l) => l.row.description === 'Coffee')?.fee).toEqual({ magnitude: 30, currency: 'EUR', returned: false });
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

  it('10-review (D-2): a returned fee is saved as money in under its own name, so the balance moves by Net', () => {
    n = 0;
    const read = readWallet(csv(PAYPAL_HEADER, [paypalRow({ type: 'Payment Refund', gross: '-10.00', fee: '0.30', net: '-9.70' })]));
    if (read === null || !read.ok) throw new Error('fixture must read');
    const d = walletToDrafts(read);
    const out = buildWalletCommit({ ...base, drafts: d, accountByCurrency: new Map([['USD', 'u']]), newId });
    expect(out.walletFees).toHaveLength(1);
    expect(out.walletFees[0]?.row).toMatchObject({ original_amount: 30, name: 'PayPal fee returned', category_id: 'fees' });
    const total = [...out.rows, ...out.walletFees.map((f) => f.row)].reduce((a, r) => a + r.original_amount, 0);
    expect(total).toBe(-970);
    const items = walletItems(d, walletPlan(d, [], { link: new Map([['USD', 'u']]) }));
    expect((items[0] as Extract<WalletItem, { kind: 'line' }>).fee).toEqual({ magnitude: 30, currency: 'USD', returned: true });
    const stored = { id: 's1', localDate: out.walletFees[0]!.row.local_date, amount: 30, name: 'PayPal fee returned', externalId: null, importFormat: 'csv' };
    expect([...walletMarks(d, new Map([['USD', 'u']]), new Map([['u', [stored]]]), { learned: new Map(), builtinIds: new Map() }).duplicateFees]).toEqual([0]);
  });

  it('never imports a line whose currency has no account', () => {
    n = 0;
    const out = buildWalletCommit({ ...base, drafts: wiseDrafts(), accountByCurrency: new Map([['EUR', 'e']]), newId });
    expect(out.rows.every((r) => r.original_currency === 'EUR')).toBe(true);
    expect(out.rows).toHaveLength(2);
  });
});

describe('walletMarks and the commit (D-34)', () => {
  const guess = { learned: new Map<string, string>(), builtinIds: new Map<BuiltinCategoryKey, string>([['Dining', 'cat-dining']]) };
  const accounts = new Map([['EUR', 'acc-eur'], ['GBP', 'acc-gbp']]);

  it('flags a stored line as a duplicate and drops it, and its fee, from the commit', () => {
    const d = wiseDrafts();
    const first = buildWalletCommit({ ...base, drafts: d, accountByCurrency: accounts, newId });
    const existing = new Map<string, ExistingRow[]>([
      [
        'acc-eur',
        [...first.rows, ...first.walletFees.map((f) => f.row)].filter((r) => r.account_id === 'acc-eur').map((r) => ({
          id: r.id,
          localDate: r.local_date,
          amount: r.original_amount,
          name: r.name ?? null,
          externalId: r.external_id ?? null,
          importFormat: r.import_format ?? null,
        })),
      ],
    ]);
    const marks = walletMarks(d, accounts, existing, guess);
    expect(marks.duplicates.size).toBe(2);
    expect(marks.duplicateFees.size).toBe(1);
    const again = buildWalletCommit({ ...base, drafts: d, accountByCurrency: accounts, marks, newId });
    expect(again.rows.map((r) => r.original_currency)).toEqual(['GBP']);
    expect(again.walletFees).toEqual([]);
    expect(walletPlan(d, [], { link: accounts, marks }).counts).toMatchObject({ lines: 1, fees: 0 });
    expect(walletPlan(d, [], { link: accounts, marks }).duplicateCount).toBe(2);
  });

  it('counts a stored fee-only expense once per stored copy', () => {
    const d = wiseDrafts();
    const fee = d.feeLines[0];
    if (fee === undefined) throw new Error('fixture has a fee');
    const stored = { id: 's1', localDate: fee.localDate, amount: -fee.magnitude, name: 'Wise fee', externalId: null, importFormat: 'csv' };
    const marks = walletMarks(d, accounts, new Map([['acc-eur', [stored]]]), guess);
    expect([...marks.duplicateFees]).toEqual([0]);
  });

  it('imports everything when nothing is stored, and gives guessed categories to lines', () => {
    const d = wiseDrafts();
    const marks = walletMarks(d, accounts, new Map(), guess);
    expect(marks.duplicates.size).toBe(0);
    const coffee = walletMarks(
      { ...d, drafts: d.drafts.map((x) => ({ ...x, rows: x.rows.map((r) => ({ ...r, description: 'Coffee shop' })) })) },
      accounts,
      new Map(),
      guess
    );
    const built = buildWalletCommit({ ...base, drafts: d, accountByCurrency: accounts, marks: coffee, newId });
    expect(built.rows.some((r) => r.category_id === 'cat-dining')).toBe(true);
  });

  it('skips lines whose currency has no account without reading stored rows', () => {
    const marks = walletMarks(wiseDrafts(), new Map(), new Map(), guess);
    expect(marks.duplicates.size).toBe(0);
  });
});
