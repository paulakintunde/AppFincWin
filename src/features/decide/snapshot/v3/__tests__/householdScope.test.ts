// 08.1-08 (CMP-F19, D-02, D-03, UX-21, CMP-F04, T-08.1-26, T-08.1-27): me vs household inputs, opt-in on and off, no partner item leaks.
import { prepare } from '@/engine/decide/v3';
import { jointSlices } from '@/engine/household';
import { monthPicture } from '@/engine/month';
import { minorUnits } from '@/engine/money';
import { account, household as base, row } from '../../__tests__/helpers/sourceFixtures';
import { buildInputs } from '../buildInputs';
import type { InputsSource } from '../buildInputsParts';
import { jointToHome, jointWithPending, viewerRows, withHouseholdScope, type HouseholdPartnerSource, type HouseholdScopeSource, type JointAccountSource } from '../householdScope';

const noa: HouseholdPartnerSource = { key: 'noa', weight: 40, sharing: true, roundedLeft: 400_000, currency: 'USD' };
const hh = (over: Partial<HouseholdScopeSource> = {}): HouseholdScopeSource => ({ scope: 'household', viewerId: 'ali', myWeight: 60, partners: [noa], ...over });
const everyday = [account({ id: 'chk', name: 'Checking', currency: 'USD', use: 'everyday' }), account({ id: 'sav', name: 'Savings', kind: 'savings', currency: 'USD' })];
const src = (household?: HouseholdScopeSource, over: Partial<InputsSource> = {}): InputsSource => ({ ...(base() as InputsSource), accounts: everyday, ...(household === undefined ? {} : { household }), ...over });
const left = (s: InputsSource): number => Number(monthPicture(prepare(buildInputs(s, null))).leftAfterPlans);

describe('08.1-08 household scope in the builder', () => {
  it('no household source: the inputs carry no household block (default Just me, D-02)', () => {
    expect(buildInputs(src(), null).household).toBeUndefined();
  });

  it("scope 'me' with a sharing partner counts none of their money and names nobody", () => {
    const me = buildInputs(src(hh({ scope: 'me' })), null);
    expect(me.household).toEqual({ scope: 'me', notShared: [], settleUp: null });
    expect(left(src(hh({ scope: 'me' })))).toBe(left(src()));
  });

  it("scope 'household' under the bill split pools the rounded figure and counts my 60% of it", () => {
    const own = left(src());
    const pooled = left(src(hh({ setting: { rule: 'bill', setup: null, shares: null } })));
    const slice = Math.floor(((own + 400_000) * 60) / 100);
    expect(Math.abs(pooled - slice)).toBeLessThanOrEqual(1);
    expect(buildInputs(src(hh()), null).household?.notShared).toEqual([]);
  });

  it('08.1-22: with no rule saved the default for separate accounts is What each person brings: my own money, however much a partner shares', () => {
    expect(left(src(hh()))).toBe(left(src()));
  });

  it('08.1-22: a set split counts my share of the pool; a split that no longer matches the members counts what each person brings', () => {
    const own = left(src());
    const set = left(src(hh({ setting: { rule: 'custom', setup: null, shares: { ali: 50, noa: 50 } } })));
    expect(Math.abs(set - Math.floor((own + 400_000) / 2))).toBeLessThanOrEqual(1);
    expect(left(src(hh({ setting: { rule: 'custom', setup: null, shares: { ali: 50, noa: 40 } } })))).toBe(own);
  });

  it('08.1-22: the bill weights the source carries (by key) decide the bill split; "mine only" counts as bring', () => {
    const own = left(src());
    const w = left(src(hh({ memberKeys: ['noa', 'ali'], billWeights: { ali: 25, noa: 75 }, setting: { rule: 'bill', setup: null, shares: null } })));
    expect(Math.abs(w - Math.floor((own + 400_000) / 4))).toBeLessThanOrEqual(1);
    expect(left(src(hh({ billWeights: null, setting: { rule: 'bill', setup: null, shares: null } })))).toBe(own);
  });

  it('a partner who has not shared (or has no figure, or another currency) is named, and nothing of theirs is counted', () => {
    const own = left(src());
    for (const p of [{ ...noa, sharing: false }, { ...noa, roundedLeft: null }, { ...noa, currency: 'EUR' }]) {
      const s = src(hh({ partners: [p] }));
      expect(buildInputs(s, null).household).toEqual({ scope: 'household', notShared: ['noa'], settleUp: null });
      expect(left(s)).toBe(own);
    }
  });

  it('two partners: only the sharing one is pooled, the other is named', () => {
    const lee: HouseholdPartnerSource = { key: 'lee', weight: 20, sharing: false, roundedLeft: null, currency: 'USD' };
    const out = buildInputs(src(hh({ myWeight: 40, partners: [noa, lee] })), null);
    expect(out.household?.notShared).toEqual(['lee']);
  });

  it('the settle-up facts pass through in both scopes', () => {
    const settleUp = { lapsedAsPayer: true, owed: 12_000 };
    expect(buildInputs(src(hh({ scope: 'me', settleUp })), null).household?.settleUp).toEqual({ lapsedAsPayer: true, owed: 12_000 });
    expect(buildInputs(src(hh({ settleUp })), null).household?.settleUp).toEqual({ lapsedAsPayer: true, owed: 12_000 });
  });

  it('a joint account (is_shared) reaches the engine as joint; others do not', () => {
    const s = src(undefined, { accounts: [account({ id: 'chk', name: 'Checking', currency: 'USD', is_shared: true }), account({ id: 'sav', name: 'Savings', kind: 'savings', currency: 'USD' })] });
    const accts = buildInputs(s, null).accounts ?? [];
    expect(accts.find((a) => a.id === 'chk')?.joint).toBe(true);
    expect(accts.find((a) => a.id === 'sav')?.joint).toBeUndefined();
  });

  it('08.1-22: Just me with a joint account counts my slice of it, not the whole balance (JA-01)', () => {
    const joint: JointAccountSource = { id: 'chk', currency: 'USD', purpose: null, spendable: false, balance: 1_000_000, monthIn: 0, monthOut: 0, billsDueBeforeNextIn: 0, paidInBy: {} };
    const accountsJoint = [account({ id: 'chk', name: 'Checking', currency: 'USD', use: 'everyday', is_shared: true })];
    const withJoint = (h?: HouseholdScopeSource) => src(h, { accounts: accountsJoint, balances: { chk: 1_000_000 } });
    const bring = { rule: 'bring' as const, setup: null, shares: null };
    const a = buildInputs(withJoint(hh({ scope: 'me', partners: [noa], joint: [joint], setting: bring })), null);
    expect(a.accounts?.find((x) => x.id === 'chk')?.balance).toBe(500_000); // carried money splits equally: half of the true $10,000 each
    // with one joint account and no rule saved the setup is One joint account and the default is the bill split (60/40 here)
    expect(buildInputs(withJoint(hh({ scope: 'me', partners: [noa], joint: [joint] })), null).accounts?.find((x) => x.id === 'chk')?.balance).toBe(600_000);
    expect(a.household?.jointBack).toBeDefined();
    const b = a;
    expect(b.balance).toBeLessThan(buildInputs(withJoint(), null).balance + 1); // never more than what was held before
  });

  it('08.1-22: an account no rate converts counts nowhere, and a household with no joint accounts has no jointBack', () => {
    const joint: JointAccountSource = { id: 'chk', currency: 'JPY', purpose: null, spendable: false, balance: 1, monthIn: 0, monthOut: 0, billsDueBeforeNextIn: 0, paidInBy: {} };
    expect(buildInputs(src(hh({ scope: 'me', joint: [joint] })), null).household?.jointBack).toBeUndefined();
    expect(buildInputs(src(hh({ scope: 'me' })), null).household?.jointBack).toBeUndefined();
  });

  it('withHouseholdScope returns the same inputs when there is no source', () => {
    const inputs = buildInputs(src(), null);
    expect(withHouseholdScope(inputs, undefined)).toBe(inputs);
  });
});

describe('08.1-08 viewer scoping (T-08.1-26): no partner item reaches the inputs in either scope', () => {
  const partnerRows: InputsSource['rows'] = [
    { ...row({ id: 'noa-private', local_date: '2026-09-20', original_amount: -77_700, original_currency: 'USD', home_currency: 'USD' }), created_by: 'noa', is_shared: false },
    { ...row({ id: 'noa-pay', local_date: '2026-09-01', original_amount: 999_900, original_currency: 'USD', home_currency: 'USD' }), created_by: 'noa', is_shared: false },
  ];
  const sharedRow = { ...row({ id: 'shared-bill', local_date: '2026-09-21', original_amount: -5_000, original_currency: 'USD', home_currency: 'USD' }), created_by: 'noa', is_shared: true };
  const mine = { ...row({ id: 'ali-own', local_date: '2026-09-22', original_amount: -1_000, original_currency: 'USD', home_currency: 'USD' }), created_by: 'ali', is_shared: false };

  it('viewerRows keeps mine, shared and creator-less rows, and drops a partner personal row', () => {
    const legacy = { ...row({ id: 'legacy' }) };
    const kept = viewerRows([...partnerRows, sharedRow, mine, legacy, { ...legacy, id: 'nullcreator', created_by: null }], 'ali').map((r) => r.id);
    expect(kept).toEqual(['shared-bill', 'ali-own', 'legacy', 'nullcreator']);
  });

  it.each(['me', 'household'] as const)('scope %s: a partner personal line is in no month, and the figures equal the viewer-only build', (scope) => {
    const rows = [...(base() as InputsSource).rows, mine, sharedRow, ...partnerRows];
    const withPartner = buildInputs(src(hh({ scope, partners: [] }), { rows }), null);
    const onlyViewer = buildInputs(src(hh({ scope, partners: [] }), { rows: [...(base() as InputsSource).rows, mine, sharedRow] }), null);
    const ids = withPartner.months.flatMap((m) => m.lines.map((l) => l.id));
    expect(ids).not.toContain('noa-private');
    expect(ids).not.toContain('noa-pay');
    expect(ids).toEqual(expect.arrayContaining(['ali-own', 'shared-bill']));
    expect(withPartner.months).toEqual(onlyViewer.months);
    expect(withPartner.balance).toBe(onlyViewer.balance);
  });

  it('the inputs hold only the one partner figure: no partner key appears besides the notShared names', () => {
    const json = JSON.stringify(buildInputs(src(hh()), null), (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(json).not.toContain('noa-private');
  });

  it("without a household source, rows are read as given (a household of one is unchanged)", () => {
    const rows = [...(base() as InputsSource).rows, ...partnerRows];
    expect(buildInputs(src(undefined, { rows }), null).months.flatMap((m) => m.lines.map((l) => l.id))).toContain('noa-private');
  });
});

describe('08.1-22 jointToHome / jointWithPending', () => {
  const j: JointAccountSource = { id: 'j1', currency: 'EUR', purpose: 'bills', spendable: false, safetyNet: true, balance: 100, monthIn: 60, monthOut: 20, billsDueBeforeNextIn: 5, paidInBy: { a: 40, b: 20 } };
  const x2 = (n: number, c: string): number | null => (c === 'EUR' ? n * 2 : null);
  it('converts every figure, works out the carried money and orders the pay-ins by member', () => {
    expect(jointToHome([j], ['b', 'a'], x2)).toEqual([
      { id: 'j1', purpose: 'bills', spendable: false, safetyNet: true, balance: 200, monthIn: 120, monthOut: 40, carried: 120, billsDueBeforeNextIn: 10, paidInBy: [40, 80] },
    ]);
  });
  it('an account no rate converts is left out; a member with no pay-in has none', () => {
    expect(jointToHome([{ ...j, currency: 'JPY' }], ['a'], x2)).toEqual([]);
    expect(jointToHome([{ ...j, paidInBy: {} }], ['a'], x2)[0]?.paidInBy).toEqual([0]);
  });
  it('the pending lines on the account add to the bills due before the next pay-in and to this month\'s money out', () => {
    const rows = [
      { account_id: 'j1', local_date: '2026-11-18', original_amount: -30, status: 'pending' }, // due before the pay-in, this month
      { account_id: 'j1', local_date: '2026-12-05', original_amount: -40, status: 'pending' }, // after the pay-in, next month
      { account_id: 'j1', local_date: '2026-11-10', original_amount: -99, status: 'pending' }, // already past
      { account_id: 'j1', local_date: '2026-11-18', original_amount: 50, status: 'pending' }, // money in
      { account_id: 'j1', local_date: '2026-11-18', original_amount: -11, status: 'paid' }, // paid
      { account_id: 'other', local_date: '2026-11-18', original_amount: -7, status: 'pending' },
    ];
    expect(jointWithPending([j], rows, '2026-11-15', '2026-12-01')[0]).toMatchObject({ billsDueBeforeNextIn: 35, monthOut: 50 });
    expect(jointWithPending([j], rows, '2026-11-15', null)[0]).toMatchObject({ billsDueBeforeNextIn: 75, monthOut: 50 });
  });

  it('B-CR-01: a pending outflow never raises the carried money, so "What each person brings" splits the hand-worked figures', () => {
    // balance 2,000 (paid lines only); A paid in 1,500, B 0; nothing paid out; a 1,200 rent line is still pending this month
    const everyday: JointAccountSource = { id: 'j1', currency: 'USD', purpose: 'everyday', spendable: false, balance: 200000, monthIn: 150000, monthOut: 0, billsDueBeforeNextIn: 0, paidInBy: { a: 150000 } };
    const rent = [{ account_id: 'j1', local_date: '2026-11-20', original_amount: -120000, status: 'pending' }];
    const same = (n: number, c: string): number | null => (c === 'USD' ? n : null);
    const withRent = jointWithPending([everyday], rent, '2026-11-15', '2026-12-01');
    expect(withRent[0]).toMatchObject({ monthOut: 120000, monthOutPaid: 0 });
    const [raw] = jointToHome(withRent, ['a', 'b'], same);
    // carried = balance - (paid in - PAID out) = 2,000 - 1,500 = 500; the month's planned outflow still includes the rent
    expect(raw).toMatchObject({ carried: 50000, monthOut: 120000 });
    // the "How spending is shared" view reads the same account with no pending rows: the same carried money
    expect(jointToHome([everyday], ['a', 'b'], same)[0]?.carried).toBe(50000);
    const facts = [{ ...raw!, viewerBalance: minorUnits(0), viewerOwnMonth: minorUnits(0) }];
    // 500 carried splits 250 / 250; the 1,500 brought this month goes to A: A 1,750, B 250
    expect(jointSlices(facts, 'paidIn', null, 0, 2).cash).toBe(175000);
    expect(jointSlices(facts, 'paidIn', null, 1, 2).cash).toBe(25000);
  });
});
