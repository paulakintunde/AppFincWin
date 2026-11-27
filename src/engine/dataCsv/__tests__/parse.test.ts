import { classifyRows, parseDataCsv, unescapeCell } from '../parse';

const exp = (c: string) => (c === 'JPY' ? 0 : 2);
const ID = '123e4567-e89b-42d3-a456-426614174000';

function ok(table: Parameters<typeof parseDataCsv>[0], text: string) {
  const r = parseDataCsv(table, text, exp);
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r;
}

describe('unescapeCell', () => {
  it('strips one apostrophe before = + - @ only', () => {
    expect(unescapeCell("'=SUM(A1)")).toBe('=SUM(A1)');
    expect(unescapeCell("'+1")).toBe('+1');
    expect(unescapeCell("'-x")).toBe('-x');
    expect(unescapeCell("'@a")).toBe('@a');
    // 10-30: export writes "'=x" as "''=x", so one apostrophe comes off a run before = + - @.
    expect(unescapeCell("''=x")).toBe("'=x");
    expect(unescapeCell("'''@a")).toBe("''@a");
    expect(unescapeCell("''abc")).toBe("''abc");
    expect(unescapeCell("'abc")).toBe("'abc");
    expect(unescapeCell('-1200')).toBe('-1200');
    expect(unescapeCell('')).toBe('');
    expect(unescapeCell("'")).toBe("'");
  });
});

describe('header', () => {
  it('parses, any order, case-insensitive, trimmed', () => {
    const r = ok('savings_goals', ' Target , NAME,currency\r\n1000,Trip,USD\r\n');
    expect(r.columns).toEqual(['target', 'name', 'currency']);
    expect(r.rows[0]!.values.name).toBe('Trip');
    expect(r.rows[0]!.money.target).toBe(1000);
  });
  it('reports a missing required column', () => {
    expect(parseDataCsv('savings_goals', 'name,currency\nA,USD', exp)).toEqual({
      ok: false, error: 'header-mismatch', missing: ['target'],
    });
  });
  it('reports an unknown column', () => {
    const r = parseDataCsv('savings_goals', 'name,currency,target,colour\nA,USD,1,red', exp);
    expect(r).toEqual({ ok: false, error: 'header-mismatch', unknown: ['colour'] });
  });
  it('reports both missing and unknown', () => {
    const r = parseDataCsv('accounts', 'name,zzz\nA,b', exp);
    expect(r).toEqual({ ok: false, error: 'header-mismatch', missing: ['kind', 'currency'], unknown: ['zzz'] });
  });
  it('maps tokenizer errors', () => {
    expect(parseDataCsv('accounts', '', exp)).toMatchObject({ ok: false, error: 'empty' });
    expect(parseDataCsv('accounts', 'name,kind\n"a', exp)).toMatchObject({ ok: false, error: 'unreadable' });
  });
  it('refuses over 5000 rows', () => {
    const lines = ['name,currency,target'];
    for (let i = 0; i < 5001; i += 1) lines.push(`a${i},USD,1`);
    expect(parseDataCsv('savings_goals', lines.join('\n'), exp)).toMatchObject({ ok: false, error: 'too-many-rows' });
  });
  it('header only gives zero rows', () => {
    expect(ok('accounts', 'name,kind,currency\n').rows).toEqual([]);
  });
});

describe('cells', () => {
  const head = 'name,currency,target\n';
  const one = (t: string, cur = 'USD') => ok('savings_goals', `${head}A,${cur},${t}\n`).rows[0]!;
  it('reads money as minor units', () => {
    expect(one('250000').money.target).toBe(250000);
    expect(one('-1200').money.target).toBe(-1200);
    expect(one('2500.00').money.target).toBe(250000);
    expect(one('2500.5').money.target).toBe(250050);
    expect(one('-2.5').money.target).toBe(-250);
    expect(one('0.05').money.target).toBe(5);
    expect(one('2500', 'JPY').money.target).toBe(2500);
  });
  it('flags decimals beyond the exponent, bad amounts and empties', () => {
    expect(one('2500.001').issues).toEqual(['too-many-decimals']);
    expect(one('2500.5', 'JPY').issues).toEqual(['too-many-decimals']);
    expect(one('abc').issues).toEqual(['bad-amount']);
    expect(one('1e5').issues).toEqual(['bad-amount']);
    expect(one('99999999999999999').issues).toEqual(['bad-amount']);
    expect(one('').issues).toEqual(['bad-amount']);
  });
  it('flags missing name and currency', () => {
    const r = ok('savings_goals', `${head},,5\n`).rows[0]!;
    expect(r.issues).toEqual(['name-missing', 'currency-missing']);
  });
  it('optional empty money is null without an issue', () => {
    const r = ok('savings_goals', 'name,currency,target,opening_saved\nA,USD,5,\n').rows[0]!;
    expect(r.money.opening_saved).toBeNull();
    expect(r.values.opening_saved).toBeNull();
    expect(r.issues).toEqual([]);
  });
  it('unescapes text and reads decimals', () => {
    const r = ok('savings_goals', "name,currency,target\n'=X,USD,1.50\n").rows[0]!;
    expect(r.values.name).toBe('=X');
    expect(r.money.target).toBe(150);
  });
  it('checks enums', () => {
    expect(ok('accounts', 'name,kind,currency\nA,piggy,USD').rows[0]!.issues).toEqual(['bad-choice']);
    expect(ok('accounts', 'name,kind,currency\nA,savings,USD').rows[0]!.issues).toEqual([]);
    expect(ok('savings_goals', 'name,currency,target,bucket\nA,USD,1,\n').rows[0]!.issues).toEqual([]);
  });
  it('checks ids', () => {
    expect(ok('accounts', 'id,name,kind,currency\nnope,A,cash,USD').rows[0]!.issues).toEqual(['bad-id']);
    expect(ok('accounts', `id,name,kind,currency\n${ID},A,cash,USD`).rows[0]!.issues).toEqual([]);
    expect(ok('accounts', 'id,name,kind,currency\n,A,cash,USD').rows[0]!.issues).toEqual([]);
  });
  it('checks dates', () => {
    const h = 'name,currency,target,ready_by\n';
    expect(ok('savings_goals', `${h}A,USD,1,2027-02-30`).rows[0]!.issues).toEqual(['bad-date']);
    expect(ok('savings_goals', `${h}A,USD,1,soon`).rows[0]!.issues).toEqual(['bad-date']);
    expect(ok('savings_goals', `${h}A,USD,1,2027-02-28`).rows[0]!.issues).toEqual([]);
    expect(ok('savings_goals', `${h}A,USD,1,2027-02-28T10:00:00Z`).rows[0]!.issues).toEqual([]);
    expect(ok('savings_goals', `${h}A,USD,1,`).rows[0]!.issues).toEqual([]);
  });
  it('ignores bookkeeping columns', () => {
    const r = ok('accounts', 'name,kind,currency,household_id,created_at\nA,cash,USD,h,t').rows[0]!;
    expect(r.values.household_id).toBeUndefined();
    expect(r.index).toBe(0);
  });
  it('a blank currency is flagged and the default exponent is used', () => {
    const r = ok('debts', 'name,kind,currency,balance\nA,loan,,10.5').rows[0]!;
    expect(r.issues).toContain('currency-missing');
    expect(r.money.balance).toBe(1050);
  });
});

describe('classifyRows', () => {
  it('classifies', () => {
    const r = ok('accounts', `id,name,kind,currency\n${ID},A,cash,USD\n,  bob ,cash,USD\n,New,cash,USD\n`);
    expect(
      classifyRows(r.rows, [
        { id: ID, name: 'Other' },
        { id: 'x', name: 'BOB' },
      ])
    ).toEqual(['same-id', 'same-name', 'new']);
  });
  it('a row without a name is new', () => {
    const r = ok('accounts', 'name,kind,currency\n,cash,USD\n');
    expect(classifyRows(r.rows, [{ id: 'x', name: '' }])).toEqual(['new']);
  });
});
