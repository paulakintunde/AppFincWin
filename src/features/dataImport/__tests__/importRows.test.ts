import { classifyRows, DATA_CSV_SCHEMAS, parseDataCsv, type DataTable } from '@/engine/dataCsv';
import { currencyExponent } from '@/engine/money/currencyExponents';
import { toCsv } from '@/features/export/csvSerialize';
import { reportRows, toCreateInputs, type ImportContext } from '../importRows';
import { buildTemplate, templateColumns } from '../templates';

const ctx: ImportContext = { householdId: 'hh', ownerId: 'me', homeCurrency: 'USD', today: '2026-11-23' };
const ID = '123e4567-e89b-42d3-a456-426614174000';

function parse(table: DataTable, csv: string) {
  const r = parseDataCsv(table, csv, currencyExponent);
  if (!r.ok) throw new Error(`parse failed: ${r.error}`);
  return r.rows;
}

describe('toCreateInputs', () => {
  it('maps accounts as integer minor units and never reuses a file id', () => {
    const rows = parse('accounts', `id,name,kind,currency,opening_balance,overdraft_limit\n${ID},Everyday,checking,USD,150000,50000\n`);
    const out = toCreateInputs('accounts', rows, ['new'], ctx);
    expect(out).toHaveLength(1);
    const first = out[0]!;
    if (first.table !== 'accounts') throw new Error('table');
    expect(first.input).toEqual({
      household_id: 'hh', name: 'Everyday', kind: 'checking', currency: 'USD', opening_balance: 150000, overdraft_limit: 50000,
    });
    expect(JSON.stringify(first)).not.toContain(ID);
  });

  it('maps goals, debts and holdings', () => {
    const goals = toCreateInputs('savings_goals', parse('savings_goals', 'name,currency,target,monthly_amount,ready_by,locked\nTrip,EUR,200000,20000,2027-06-01,true\n'), ['new'], ctx);
    expect(goals[0]).toMatchObject({
      table: 'savings_goals',
      input: { householdId: 'hh', ownerId: 'me', fields: { name: 'Trip', currency: 'EUR', target: 200000, monthly_amount: 20000, ready_by: '2027-06-01', locked: true, opening_saved: 0 } },
    });
    const debts = toCreateInputs('debts', parse('debts', 'name,kind,currency,balance,apr,minimum_payment,due_day\nCar,loan,USD,800000,6.5,25000,15\n'), ['new'], ctx);
    expect(debts[0]).toMatchObject({ table: 'debts', input: { fields: { name: 'Car', kind: 'loan', balance: 800000, apr: '6.5', minimum_payment: 25000, due_day: 15 } } });
    const holds = toCreateInputs('holdings', parse('holdings', 'name,type,currency,value,value_as_of,opening_put_in\nFund,brokerage,USD,500000,2026-01-01,450000\n'), ['new'], ctx);
    expect(holds[0]).toMatchObject({ table: 'holdings', input: { name: 'Fund', type: 'brokerage', value: 500000, openingPutIn: 450000, valueAsOf: '2026-01-01', ownerId: 'me', householdId: 'hh' } });
  });

  it('keeps zero-decimal currencies as they are', () => {
    const out = toCreateInputs('savings_goals', parse('savings_goals', 'name,currency,target\nTrip,JPY,50000\n'), ['new'], ctx);
    expect(out[0]).toMatchObject({ input: { fields: { target: 50000 } } });
  });

  it('leaves out rows with issues and rows that already exist, unless overridden', () => {
    const rows = parse('accounts', 'name,kind,currency,opening_balance\nA,cash,USD,1\n,cash,USD,1\nC,cash,,1\nD,cash,USD,1.234\nE,cash,USD,5\n');
    const matches = classifyRows(rows, [{ id: 'x', name: 'E' }]);
    expect(matches).toEqual(['new', 'new', 'new', 'new', 'same-name']);
    const plain = toCreateInputs('accounts', rows, matches, ctx);
    expect(plain.map((c) => c.row)).toEqual([0]);
    const forced = toCreateInputs('accounts', rows, matches, ctx, new Set([4, 1]));
    expect(forced.map((c) => c.row)).toEqual([0, 4]);
  });

  it('flags a value the create would refuse as a row to check, not a throw', () => {
    const rows = parse('accounts', 'name,kind,currency,overdraft_limit\nA,cash,USD,-100\n');
    expect(reportRows('accounts', rows, ['new'], ctx)[0]).toMatchObject({ state: 'check', issue: 'out-of-range' });
    expect(toCreateInputs('accounts', rows, ['new'], ctx)).toEqual([]);
  });

  it('reports ready, check and exists with the first reason', () => {
    const rows = parse('debts', 'name,kind,currency,balance\nA,loan,USD,100\nB,loan,,100\nC,loan,USD,100\n');
    const rep = reportRows('debts', rows, ['new', 'new', 'same-id'], ctx);
    expect(rep.map((r) => r.state)).toEqual(['ready', 'check', 'exists']);
    expect(rep[1]!.issue).toBe('currency-missing');
  });

  it('drops a future holding date rather than failing the create', () => {
    const out = toCreateInputs('holdings', parse('holdings', 'name,type,currency,value,value_as_of\nF,other,USD,1,2030-01-01\n'), ['new'], ctx);
    expect(out[0]).toBeDefined();
    expect(JSON.stringify(out[0])).not.toContain('2030');
  });

  it('a file written by Export imports as it is (goals row with every export column and bookkeeping)', () => {
    const cols = [...DATA_CSV_SCHEMAS.savings_goals.allowed];
    const row: Record<string, unknown> = {
      id: ID, household_id: 'h', name: '=Trip', currency: 'USD', target: 100000, monthly_amount: null, ready_by: '2027-01-01', opening_saved: 0,
      kind: 'wait', bucket: null, locked: false, protect: true, created_at: '2026-01-01T00:00:00Z',
    };
    const rows = parse('savings_goals', toCsv(cols, [row]));
    const out = toCreateInputs('savings_goals', rows, ['new'], ctx);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ input: { fields: { name: '=Trip', protect: true } } });
  });
});

describe('buildTemplate', () => {
  const tables: DataTable[] = ['accounts', 'savings_goals', 'debts', 'holdings'];
  it.each(tables)('%s: header is the schema column order and there is exactly one example row that imports clean', (table) => {
    const csv = buildTemplate(table, 'USD');
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]!.split(',')).toEqual(templateColumns(table));
    expect(templateColumns(table)).toEqual(expect.arrayContaining([...DATA_CSV_SCHEMAS[table].required]));
    const rows = parse(table, csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.issues).toEqual([]);
    expect(toCreateInputs(table, rows, ['new'], ctx)).toHaveLength(1);
  });
});
