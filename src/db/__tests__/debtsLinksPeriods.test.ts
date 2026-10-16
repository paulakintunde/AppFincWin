import { NotFoundError, VersionConflictError } from '../errors';
import {
  DEBT_INSERT_KEYS,
  DEBT_PATCH_KEYS,
  fetchDebts,
  insertDebt,
  updateDebt,
  type DebtPatch,
  type DebtRow,
  type NewDebt,
} from '../debts';
import {
  DECIDE_LINK_INSERT_KEYS,
  fetchDecideLinks,
  fetchLinkedLines,
  fetchPaymentLinks,
  fetchWrittenRowLinks,
  insertDecideLink,
  updateDecideLink,
  type DecideLinkRow,
  type NewDecideLink,
} from '../decideLinks';
import { fetchStatementPeriods, insertStatementPeriod, type StatementPeriodRow } from '../statementPeriods';
import { createFakeSupabase } from './fakeSupabase';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const H = '33333333-3333-4333-8333-333333333333';

function debtRow(overrides: Partial<DebtRow> = {}): DebtRow {
  return {
    id: 'd1',
    household_id: 'h1',
    account_id: null,
    check_id: null,
    series_id: null,
    name: 'Car loan',
    kind: 'loan',
    currency: 'GBP',
    balance: 100000,
    apr: '5.5',
    minimum_payment: 2000,
    secured: true,
    term_months: 60,
    start_date: null,
    min_percent: null,
    min_interest_added: null,
    min_floor: null,
    paid_in_full: false,
    is_sample: false,
    deleted_at: null,
    version: 1,
    updated_by: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const NEW_DEBT: NewDebt = {
  id: 'd1',
  household_id: 'h1',
  account_id: null,
  series_id: null,
  name: 'Car loan',
  kind: 'loan',
  currency: 'GBP',
  balance: 100000,
  apr: '5.5',
  minimum_payment: 2000,
  secured: true,
  term_months: 60,
  start_date: null,
  min_percent: null,
  min_interest_added: null,
  min_floor: null,
  paid_in_full: false,
};

function linkRow(overrides: Partial<DecideLinkRow> = {}): DecideLinkRow {
  return {
    id: 'l1',
    household_id: 'h1',
    created_by: 'u1',
    check_id: 'k1',
    entity: 'transactions',
    target_id: 't1',
    source: 'attached',
    role: null,
    deleted_at: null,
    version: 1,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const NEW_LINK: NewDecideLink = { id: 'l1', household_id: 'h1', check_id: 'k1', entity: 'transactions', target_id: 't1' };

describe('debts', () => {
  it('keeps check_id and is_sample out of the key lists; includes paid_in_full and series_id', () => {
    for (const keys of [DEBT_INSERT_KEYS, DEBT_PATCH_KEYS] as readonly (readonly string[])[]) {
      expect(keys).not.toContain('check_id');
      expect(keys).not.toContain('is_sample');
      expect(keys).toContain('paid_in_full');
      expect(keys).toContain('series_id');
    }
  });

  it('fetchDebts selects live debts', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [debtRow()], error: null, status: 200 });
    await expect(fetchDebts(client)).resolves.toEqual([debtRow()]);
    expect(client.calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null]);
  });

  it('insertDebt is replay-safe and rejects extra keys', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    client.respondWith({ data: debtRow(), error: null, status: 200 });
    await expect(insertDebt(client, NEW_DEBT)).resolves.toEqual(debtRow());

    const c2 = createFakeSupabase();
    await expect(insertDebt(c2, { ...NEW_DEBT, check_id: 'k1' } as unknown as NewDebt)).rejects.toBeInstanceOf(TypeError);
    expect(c2.calls).toHaveLength(0);
  });

  it('updateDebt is version-conditional', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [debtRow({ version: 2 })], error: null, status: 200 });
    await expect(updateDebt(client, 'd1', 1, { paid_in_full: true })).resolves.toMatchObject({ version: 2 });
    expect(client.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['version', 1]);

    const c2 = createFakeSupabase();
    c2.respondWith({ data: [], error: null, status: 200 });
    c2.respondWith({ data: debtRow({ version: 5 }), error: null, status: 200 });
    await expect(updateDebt(c2, 'd1', 1, { balance: 1 })).rejects.toBeInstanceOf(VersionConflictError);

    const c3 = createFakeSupabase();
    c3.respondWith({ data: [], error: null, status: 200 });
    c3.respondWith({ data: null, error: null, status: 200 });
    await expect(updateDebt(c3, 'd1', 1, { balance: 1 })).rejects.toBeInstanceOf(NotFoundError);

    await expect(updateDebt(createFakeSupabase(), 'd1', 1, { is_sample: true } as unknown as DebtPatch)).rejects.toBeInstanceOf(
      TypeError
    );
  });
});

describe('decide links', () => {
  it('insert keys carry role and never source', () => {
    expect(DECIDE_LINK_INSERT_KEYS).toContain('role');
    expect(DECIDE_LINK_INSERT_KEYS).not.toContain('source');
  });

  it('fetchDecideLinks makes no request for no checks', async () => {
    const client = createFakeSupabase();
    await expect(fetchDecideLinks(client, [])).resolves.toEqual([]);
    expect(client.calls).toHaveLength(0);
  });

  it('fetchDecideLinks selects live links for the checks', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [linkRow()], error: null, status: 200 });
    await expect(fetchDecideLinks(client, ['k1'])).resolves.toEqual([linkRow()]);
    expect(client.calls.find((c) => c.method === 'in')?.args).toEqual(['check_id', ['k1']]);
  });

  it('insertDecideLink is replay-safe and never sends source', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    client.respondWith({ data: linkRow(), error: null, status: 200 });
    await expect(insertDecideLink(client, NEW_LINK)).resolves.toEqual(linkRow());

    const c2 = createFakeSupabase();
    await expect(insertDecideLink(c2, { ...NEW_LINK, source: 'written' } as unknown as NewDecideLink)).rejects.toBeInstanceOf(
      TypeError
    );
    expect(c2.calls).toHaveLength(0);
  });

  it('insertDecideLink sends the role of an attached line', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: linkRow({ role: 'payment' }), error: null, status: 200 });
    await insertDecideLink(client, { ...NEW_LINK, role: 'payment' });
    expect(client.calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({ role: 'payment' });
  });

  it('updateDecideLink is version-conditional', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: linkRow({ version: 3 }), error: null, status: 200 });
    await expect(updateDecideLink(client, 'l1', 1, { deleted_at: 'now' })).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('fetchLinkedLines returns [] without a request when both id lists are empty', async () => {
    const client = createFakeSupabase();
    await expect(fetchLinkedLines(client, H, { transactionIds: [], seriesIds: [] })).resolves.toEqual([]);
    expect(client.calls).toHaveLength(0);
  });

  it('fetchLinkedLines ORs transaction ids and series ids', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    await fetchLinkedLines(client, H, { transactionIds: [U1], seriesIds: [U2] });
    expect(client.calls.find((c) => c.method === 'or')?.args[0]).toBe(`id.in.(${U1}),recurring_series_id.in.(${U2})`);
    expect(client.calls.find((c) => c.table === 'transactions' && c.method === 'is')?.args).toEqual(['deleted_at', null]);
  });

  it('fetchLinkedLines refuses non-uuid ids and over-long lists before any request', async () => {
    const client = createFakeSupabase();
    await expect(fetchLinkedLines(client, H, { transactionIds: ['x),id.neq.(1'], seriesIds: [] })).rejects.toBeInstanceOf(TypeError);
    await expect(fetchLinkedLines(client, H, { transactionIds: Array<string>(201).fill(U1), seriesIds: [] })).rejects.toBeInstanceOf(
      RangeError
    );
    expect(client.calls).toHaveLength(0);
  });

  it('fetchPaymentLinks reads live written payment series links', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [{ check_id: 'k1', target_id: 's1' }], error: null, status: 200 });
    await expect(fetchPaymentLinks(client)).resolves.toEqual([{ check_id: 'k1', target_id: 's1' }]);
    const eqs = client.calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqs).toEqual([
      ['entity', 'recurring_series'],
      ['source', 'written'],
      ['role', 'payment'],
    ]);
    expect(client.calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null]);
  });

  it('fetchWrittenRowLinks reads live written transaction links', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [{ check_id: 'k1', target_id: 't1' }], error: null, status: 200 });
    await expect(fetchWrittenRowLinks(client)).resolves.toEqual([{ check_id: 'k1', target_id: 't1' }]);
    const eqs = client.calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqs).toEqual([
      ['entity', 'transactions'],
      ['source', 'written'],
    ]);
  });
});

describe('statement periods', () => {
  const PERIOD: StatementPeriodRow = {
    id: 'p1',
    household_id: 'h1',
    account_id: 'a1',
    period_start: '2026-09-01',
    period_end: '2026-09-30',
  };

  it('fetchStatementPeriods returns rows', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [PERIOD], error: null, status: 200 });
    await expect(fetchStatementPeriods(client)).resolves.toEqual([PERIOD]);
  });

  it('insertStatementPeriod returns the row, and null on a duplicate', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: PERIOD, error: null, status: 201 });
    await expect(insertStatementPeriod(client, PERIOD)).resolves.toEqual(PERIOD);
    client.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    await expect(insertStatementPeriod(client, PERIOD)).resolves.toBeNull();
  });

  it('rejects an inverted period before any request', async () => {
    const client = createFakeSupabase();
    await expect(
      insertStatementPeriod(client, { ...PERIOD, period_start: '2026-10-01', period_end: '2026-09-01' })
    ).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });
});
