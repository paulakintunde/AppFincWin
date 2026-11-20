// 08.1-08 (CMP-F19, D-02, D-03, UX-21, CMP-F04, T-08.1-26, T-08.1-27): me vs household inputs, opt-in on and off, no partner item leaks.
import { prepare } from '@/engine/decide/v3';
import { monthPicture } from '@/engine/month';
import { account, household as base, row } from '../../__tests__/helpers/sourceFixtures';
import { buildInputs } from '../buildInputs';
import type { InputsSource } from '../buildInputsParts';
import { viewerRows, withHouseholdScope, type HouseholdPartnerSource, type HouseholdScopeSource } from '../householdScope';

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

  it("scope 'household' with both opt-ins pools the rounded figure and counts my 60% of it", () => {
    const own = left(src());
    const pooled = left(src(hh()));
    const slice = Math.floor(((own + 400_000) * 60) / 100);
    expect(Math.abs(pooled - slice)).toBeLessThanOrEqual(1);
    expect(buildInputs(src(hh()), null).household?.notShared).toEqual([]);
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
