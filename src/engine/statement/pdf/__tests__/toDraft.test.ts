import { pdfToDrafts } from '../toDraft';
import type { PdfDraftOptions } from '../toDraft';
import type { PdfExtraction } from '../types';

type C = [string, number, number];
const D = (t: string): C => [t, 40, 70];
const DESC = (t: string): C => [t, 94, 94 + t.length * 5];
const OUT = (t: string): C => [t, 340, 380];
const IN = (t: string): C => [t, 420, 460];
const BETWEEN = (t: string): C => [t, 380, 420];
const BAL = (t: string): C => [t, 500, 545];
const AMT = (t: string): C => [t, 440, 480];

const HEAD: C[] = [D('Date'), DESC('Description'), OUT('Paid out'), IN('Paid in'), BAL('Balance')];
const HEAD_AMT: C[] = [D('Date'), DESC('Description'), AMT('Amount'), BAL('Balance')];
const PERIOD: C[] = [['Statement period 01 Mar 2026 to 31 Mar 2026', 40, 300]];

function sheet(rows: C[][]): PdfExtraction {
  const items = rows.flatMap((cells, i) => cells.map(([str, a, b]) => ({ str, x: a, y: 780 - i * 16, w: b - a })));
  return { pageCount: 1, pages: [{ n: 1, width: 600, height: 800, items }] };
}

const opts = (over: Partial<PdfDraftOptions> = {}): PdfDraftOptions => ({
  accountCurrency: 'GBP',
  exponentFor: () => 2,
  dayFirst: true,
  decimalMark: '.',
  today: '2026-09-26',
  yearOverride: null,
  ...over,
});

function draftOf(rows: C[][], over: Partial<PdfDraftOptions> = {}) {
  const r = pdfToDrafts(sheet(rows), opts(over));
  if (r.kind !== 'drafts') throw new Error('expected drafts');
  return r.drafts[0]!;
}

describe('amount columns', () => {
  it('reads debit, credit, and conflicting markers', () => {
    const d = draftOf([
      PERIOD,
      HEAD,
      [D('02 Mar'), DESC('A'), OUT('45.23'), BAL('1,200.37')],
      [D('03 Mar'), DESC('B'), IN('500.00'), BAL('1,700.37')],
      [D('04 Mar'), DESC('C'), OUT('5.00 CR')],
    ]).draft;
    expect(d.rows[0]).toMatchObject({ magnitude: 4523, marker: 'dr', rawAmount: '45.23', balanceMagnitude: 120037, issues: [] });
    expect(d.rows[1]).toMatchObject({ magnitude: 50000, marker: 'cr' });
    expect(d.rows[2]).toMatchObject({ magnitude: null, issues: ['conflicting-markers'] });
    expect(d.labels).toContain('debit-credit-columns');
    expect(d.source).toBe('pdf');
  });

  it('two markers that disagree are a conflict', () => {
    const d = draftOf([PERIOD, HEAD, [D('02 Mar'), DESC('A'), OUT('-5.00 CR')]]).draft;
    expect(d.rows[0]!.issues).toEqual(['conflicting-markers']);
  });

  it('a dr marker in the credit column conflicts too', () => {
    const d = draftOf([PERIOD, HEAD, [D('02 Mar'), DESC('A'), IN('5.00 DR')]]).draft;
    expect(d.rows[0]!.issues).toEqual(['conflicting-markers']);
  });

  it('reads a single amount column with CR and minus markers', () => {
    const d = draftOf([
      PERIOD,
      HEAD_AMT,
      [D('02 Mar'), DESC('A'), AMT('500.00 CR')],
      [D('03 Mar'), DESC('B'), AMT('-250.00')],
      [D('04 Mar'), DESC('C'), AMT('12.00 DR')],
    ]).draft;
    expect(d.rows.map((r) => r.marker)).toEqual(['cr', 'minus', 'dr']);
    expect(d.rows.map((r) => r.magnitude)).toEqual([50000, 25000, 1200]);
    expect(d.labels).not.toContain('dr-cr-markers');
  });

  it('claims dr-cr-markers only when every amount row carries one', () => {
    const d = draftOf([PERIOD, HEAD_AMT, [D('02 Mar'), DESC('A'), AMT('5.00 CR')], [D('03 Mar'), DESC('B'), AMT('6.00 DR')]]).draft;
    expect(d.labels).toContain('dr-cr-markers');
  });

  it('maps parse failures, zero amounts, bad balances and a missing amount', () => {
    const d = draftOf([
      PERIOD,
      HEAD,
      [D('02 Mar'), DESC('A'), OUT('99999999999999.00')],
      [D('03 Mar'), DESC('B'), OUT('0.00'), BAL('1.2.34')],
      [D('04 Mar'), DESC('C'), OUT('1 2 3 4 5.67')],
      [D('05 Mar'), DESC('D')],
    ]).draft;
    expect(d.rows[0]!.issues).toContain('amount-too-large');
    expect(d.rows[1]!.issues).toEqual(expect.arrayContaining(['zero-amount', 'bad-balance']));
    expect(d.rows[1]!.balanceMagnitude).toBeNull();
    expect(d.rows[1]!.rawBalance).toBe('1.2.34');
    expect(d.rows[3]).toMatchObject({ magnitude: null, rawAmount: null, issues: ['bad-amount'] });
  });

  it('flags an empty description and an unknown currency', () => {
    const d = draftOf([PERIOD, HEAD, [D('02 Mar'), OUT('5.00')]], { exponentFor: () => null }).draft;
    expect(d.rows[0]!.issues).toEqual(expect.arrayContaining(['empty-description', 'unknown-currency']));
  });
});

describe('between-column amounts', () => {
  const clear = [
    PERIOD,
    HEAD,
    [DESC('Opening balance'), BAL('100.00')],
    [D('02 Mar'), DESC('A'), OUT('10.00'), BAL('90.00')],
    [D('03 Mar'), DESC('B'), IN('20.00'), BAL('110.00')],
  ];

  it('places a value from the balance change, with no issue', () => {
    const d = draftOf([...clear, [D('04 Mar'), DESC('C'), BETWEEN('30.00'), BAL('140.00')], [D('05 Mar'), DESC('D'), BETWEEN('15.00'), BAL('125.00')]]).draft;
    expect(d.rows[2]).toMatchObject({ magnitude: 3000, marker: 'cr', issues: [] });
    expect(d.rows[3]).toMatchObject({ magnitude: 1500, marker: 'dr', issues: [] });
  });

  it('flags it when the balance cannot place it', () => {
    const d = draftOf([...clear, [D('04 Mar'), DESC('C'), BETWEEN('30.00')], [D('05 Mar'), DESC('D'), BETWEEN('30.00'), BAL('999.00')]]).draft;
    expect(d.rows[2]).toMatchObject({ magnitude: 3000, marker: 'none', issues: ['pdf-ambiguous-column'] });
    expect(d.rows[3]!.issues).toEqual(['pdf-ambiguous-column']);
  });

  it('flags it when no column direction can be learned', () => {
    const d = draftOf([PERIOD, HEAD, [D('02 Mar'), DESC('A'), BETWEEN('30.00'), BAL('30.00')]]).draft;
    expect(d.rows[0]!.issues).toEqual(['pdf-ambiguous-column']);
  });

  it('reports an unreadable between value', () => {
    const d = draftOf([...clear, [D('04 Mar'), DESC('C'), BETWEEN('1.2.34')]]).draft;
    expect(d.rows[2]!.issues).toEqual(['bad-amount']);
  });

  it('skips unusable learning samples', () => {
    const d = draftOf([
      PERIOD,
      HEAD,
      [D('02 Mar'), DESC('A'), OUT('1.2.34'), BAL('1.00')],
      [D('03 Mar'), DESC('B'), OUT('5.00'), BAL('9.00')],
      [D('04 Mar'), DESC('C'), OUT('5.00')],
    ]).draft;
    expect(d.rows).toHaveLength(3);
  });
});

describe('both columns and headerless rows', () => {
  it('nets a same-line reversal and flags it', () => {
    const d = draftOf([PERIOD, HEAD, [D('02 Mar'), DESC('A'), OUT('10.00'), IN('25.00')], [D('03 Mar'), DESC('B'), OUT('30.00'), IN('5.00')]]).draft;
    expect(d.rows[0]).toMatchObject({ magnitude: 1500, marker: 'cr', rawAmount: '10.00 | 25.00', issues: ['pdf-ambiguous-column'] });
    expect(d.rows[1]).toMatchObject({ magnitude: 2500, marker: 'dr' });
  });

  it('reports an unreadable side of a reversal', () => {
    const d = draftOf([PERIOD, HEAD, [D('02 Mar'), DESC('A'), OUT('1.2.34'), IN('25.00')], [D('03 Mar'), DESC('B'), OUT('1.00'), IN('1.2.34')]]).draft;
    expect(d.rows[0]!.issues).toEqual(['bad-amount']);
    expect(d.rows[1]!.issues).toEqual(['bad-amount']);
  });

  const headerless = (...rows: string[][]): C[][] => [PERIOD, ...rows.map((r) => [D(r[0]!), DESC(r[1]!), ...r.slice(2).map((t, i): C => [t, 340 + i * 80, 380 + i * 80])])];

  it('places a candidate by the balance change', () => {
    const d = draftOf(
      headerless(['02 Mar', 'Opening balance', '1,245.60'], ['03 Mar', 'A', '45.23', '1,200.37'], ['04 Mar', 'B', '10.00', '1,210.37'], ['05 Mar', 'C', '1.00', '1,211.37']),
    ).draft;
    expect(d.rows).toHaveLength(3);
    expect(d.rows[0]).toMatchObject({ magnitude: 4523, marker: 'minus', issues: [] });
    expect(d.rows[1]).toMatchObject({ magnitude: 1000, marker: 'plus' });
  });

  it('flags two candidates that both match, and unmatched ones', () => {
    const d = draftOf(
      headerless(
        ['02 Mar', 'A', '5.00', '1,200.00'],
        ['03 Mar', 'B', '10.00', '10.00', '1,210.00'],
        ['04 Mar', 'C', '10.00', '7.00', '1,250.00'],
        ['05 Mar', 'D', '1.2.34', '9.00', '1,260.00'],
      ),
    ).draft;
    expect(d.rows[1]).toMatchObject({ magnitude: 1000, marker: 'none', issues: ['pdf-ambiguous-column'] });
    expect(d.rows[2]!.issues).toEqual(['pdf-ambiguous-column']);
    expect(d.rows[3]!.issues).toEqual(expect.arrayContaining(['bad-amount', 'pdf-ambiguous-column']));
  });

  it('flags several candidates when there is no balance to place them', () => {
    const d = draftOf(headerless(['02 Mar', 'A', '5.00', '6.00', '7.00'], ['03 Mar', 'B', '7.00'], ['04 Mar', 'C', '8.00'])).draft;
    expect(d.rows[0]).toMatchObject({ magnitude: 500, marker: 'none', issues: ['pdf-ambiguous-column'] });
  });

  it('uses the notation marker of a single candidate when there is no balance chain', () => {
    const d = draftOf(headerless(['02 Mar', 'A', '5.00 CR'], ['03 Mar', 'B', '6.00'], ['04 Mar', 'C', '7.00'])).draft;
    expect(d.rows[0]).toMatchObject({ magnitude: 500, marker: 'cr', issues: [] });
    expect(d.rows[1]).toMatchObject({ magnitude: 600, marker: 'none', issues: [] });
  });
});

describe('foreign amounts on continuation lines (IMP-05)', () => {
  it('carries a recognised note as structured data and keeps the raw text and the wrapped flag', () => {
    const d = draftOf([
      PERIOD,
      HEAD,
      [D('02 Mar'), DESC('SAMPLE STORE'), OUT('35.38')],
      [DESC('USD 45.00 @ 1.2718')],
      [D('03 Mar'), DESC('PLAIN'), OUT('2.00')],
    ]).draft;
    expect(d.rows[0]).toMatchObject({ description: 'SAMPLE STORE USD 45.00 @ 1.2718', issues: ['pdf-wrapped-description'] });
    expect(d.rows[0]!.foreign).toMatchObject({ magnitude: 4500, currency: 'USD' });
    expect(d.rows[1]!.foreign).toBeNull();
  });

  it('takes the first hit among later parts and ignores the first part and a same-currency note', () => {
    const d = draftOf([
      PERIOD,
      HEAD,
      [D('02 Mar'), DESC('USD 9.00 SHOP'), OUT('1.00')],
      [DESC('REF 123')],
      [DESC('EUR 10.00')],
      [D('03 Mar'), DESC('SAME'), OUT('2.00')],
      [DESC('GBP 2.00')],
    ], { exponentFor: (code) => (['GBP', 'USD', 'EUR'].includes(code) ? 2 : null) }).draft;
    expect(d.rows[0]!.foreign).toMatchObject({ magnitude: 1000, currency: 'EUR' });
    expect(d.rows[1]!.foreign).toBeNull();
  });
});

describe('descriptions and dates', () => {
  it('joins wrapped parts, and carries the previous date for a line without one', () => {
    const d = draftOf([
      PERIOD,
      HEAD,
      [D('02 Mar'), DESC('ACME'), OUT('1.00')],
      [DESC('REF 123')],
      [DESC('NO DATE'), OUT('2.00')],
    ]).draft;
    expect(d.rows[0]).toMatchObject({ description: 'ACME REF 123', issues: ['pdf-wrapped-description'] });
    expect(d.rows[1]).toMatchObject({ localDate: '2026-03-02', issues: ['pdf-no-date'] });
  });

  it('a first row without a date is a bad date', () => {
    const d = draftOf([PERIOD, HEAD, [DESC('NO DATE'), OUT('2.00')]]).draft;
    expect(d.rows[0]).toMatchObject({ localDate: null, issues: expect.arrayContaining(['pdf-no-date', 'bad-date']) });
  });

  it('resolves numeric dates by evidence, and flags them when there is none', () => {
    const sure = draftOf([HEAD, [D('14/03/2026'), DESC('A'), OUT('1.00')], [D('03/04/2026'), DESC('B'), OUT('1.00')]], { dayFirst: false }).draft;
    expect(sure.rows.map((r) => r.localDate)).toEqual(['2026-03-14', '2026-04-03']);
    expect(sure.rows[1]!.issues).toEqual([]);
    const guess = draftOf([HEAD, [D('03/04/2026'), DESC('B'), OUT('1.00')]]).draft;
    expect(guess.rows[0]).toMatchObject({ localDate: '2026-04-03', issues: ['pdf-ambiguous-date'] });
    const us = draftOf([HEAD, [D('03/04/2026'), DESC('B'), OUT('1.00')]], { dayFirst: false }).draft;
    expect(us.rows[0]!.localDate).toBe('2026-03-04');
  });

  it('contradictory numeric dates are bad dates', () => {
    const d = draftOf([HEAD, [D('14/03/2026'), DESC('A'), OUT('1.00')], [D('03/14/2026'), DESC('B'), OUT('1.00')]]).draft;
    expect(d.rows.map((r) => r.issues)).toEqual([['bad-date'], ['bad-date']]);
  });

  it('takes the year from the period across a new year, and flags a date outside it', () => {
    const d = draftOf([
      [['Statement period 15 Dec 2025 to 14 Jan 2026', 40, 300]],
      HEAD,
      [D('16 Dec'), DESC('A'), OUT('1.00')],
      [D('02 Jan'), DESC('B'), OUT('1.00')],
      [D('20 Feb'), DESC('C'), OUT('1.00')],
    ]).draft;
    expect(d.rows.map((r) => r.localDate)).toEqual(['2025-12-16', '2026-01-02', '2025-02-20']);
    expect(d.rows[2]!.issues).toEqual(['pdf-ambiguous-date']);
    expect(d.periodStart).toBe('2025-12-15');
    expect(d.periodEnd).toBe('2026-01-14');
  });

  it('reads a period written with named dates', () => {
    const d = draftOf([[['Statement period 01-Mar-2026 to 31-Mar-2026', 40, 300]], HEAD, [D('02 Mar'), DESC('A'), OUT('1.00')]]).draft;
    expect(d.periodStart).toBe('2026-03-01');
  });

  it('asks a year question when there is no evidence, and the answer re-runs the reader', () => {
    const rows = [HEAD, [D('16 Dec'), DESC('A'), OUT('1.00')]];
    const asked = draftOf(rows);
    expect(asked.yearQuestion).toEqual([2025, 2026]);
    const answered = draftOf(rows, { yearOverride: { section: 0, year: 2025 } });
    expect(answered.yearQuestion).toBeNull();
    expect(answered.draft.rows[0]!.localDate).toBe('2025-12-16');
    const other = draftOf(rows, { yearOverride: { section: 1, year: 2025 } });
    expect(other.yearQuestion).toEqual([2025, 2026]);
  });
});

describe('currency, notation and figures', () => {
  it('detects a currency symbol, else uses the account currency', () => {
    const sym = draftOf([PERIOD, HEAD, [D('02 Mar'), DESC('A'), OUT('£45.23')]]).draft;
    expect(sym.currency).toBe('GBP');
    const euro = draftOf([PERIOD, HEAD, [D('02 Mar'), DESC('A'), OUT('€45.23')]]).draft;
    expect(euro.currency).toBe('EUR');
    expect(euro.rows[0]!.currency).toBe('EUR');
    const mixed = draftOf([PERIOD, HEAD, [D('02 Mar'), DESC('A'), OUT('€45.23')], [D('03 Mar'), DESC('B'), OUT('£1.00')]]).draft;
    expect(mixed.currency).toBeNull();
    const none = draftOf([PERIOD, HEAD, [D('02 Mar'), DESC('A'), OUT('45.23')]], { accountCurrency: 'USD' }).draft;
    expect(none.currency).toBeNull();
    expect(none.rows[0]!.currency).toBe('USD');
  });

  it('uses the region decimal mark when the notation is ambiguous, and the evidence when not', () => {
    const comma = draftOf([PERIOD, HEAD, [D('02 Mar'), DESC('A'), OUT('45,23')]]).draft;
    expect(comma.rows[0]!.magnitude).toBe(4523);
    const region = draftOf([PERIOD, HEAD, [D('02 Mar'), DESC('A'), OUT('45')]], { decimalMark: ',' }).draft;
    expect(region.layoutSignature).toBe('pdf|header|date,description,debit,credit,balance|,');
    const dot = draftOf([PERIOD, HEAD, [D('02 Mar'), DESC('A'), OUT('1,234.50')]]).draft;
    expect(dot.rows[0]!.magnitude).toBe(123450);
    expect(dot.layoutSignature.endsWith('|.')).toBe(true);
  });

  it('warns about mixed digit grouping', () => {
    const d = draftOf([PERIOD, HEAD, [D('02 Mar'), DESC('A'), OUT('1,00,000.00')], [D('03 Mar'), DESC('B'), OUT('1,234,567.00')]]).draft;
    expect(d.warnings).toContain('mixed-grouping');
  });

  it('captures stated figures, the limit label and the card hint', () => {
    const d = draftOf([
      PERIOD,
      [DESC('Previous balance'), BAL('820.40')],
      [DESC('Credit limit'), BAL('1,000.00')],
      [DESC('Available credit'), BAL('179.60')],
      HEAD,
      [D('02 Mar'), DESC('A'), OUT('1.00')],
      [DESC('New balance'), BAL('821.40')],
      [DESC('Minimum payment'), BAL('25.00')],
    ]).draft;
    expect(d.statedOpening).toEqual({ magnitude: 82040, marker: 'none', asOf: '2026-03-01', raw: '820.40' });
    expect(d.statedClosing).toMatchObject({ magnitude: 82140, asOf: '2026-03-31' });
    expect(d.available).toMatchObject({ magnitude: 17960 });
    expect(d.statedLimit).toBe(100000);
    expect(d.labels).toContain('limit-label');
    expect(d.accountHint).toBe('card');
    expect(d.warnings).toContain('summary-lines-removed');
    expect(d.rows).toHaveLength(1);
  });

  it('drops an unreadable stated figure and notes the bank hint', () => {
    const d = draftOf([PERIOD, [DESC('Sort code'), BAL('1')], [DESC('Opening balance'), BAL('1.2.34')], HEAD, [D('02 Mar'), DESC('A'), OUT('1.00')]]).draft;
    expect(d.statedOpening).toBeNull();
    expect(d.statedLimit).toBeNull();
    expect(d.accountHint).toBe('bank');
  });

  it('notes the available-balance heading and an OD marker', () => {
    const d = draftOf([
      PERIOD,
      [D('Date'), DESC('Description'), OUT('Paid out'), IN('Paid in'), ['Available balance', 500, 545]],
      [D('02 Mar'), DESC('A'), OUT('1.00'), BAL('5.00 OD')],
    ]).draft;
    expect(d.balanceLabel).toBe('available');
    expect(d.labels).toEqual(expect.arrayContaining(['available-balance-label', 'od-marker']));
    expect(d.rows[0]!.balanceMarker).toBe('od');
  });

  it('keeps a foreign continuation as provenance, with the billed amount', () => {
    const d = draftOf([[['Statement period 05 Feb 2026 to 04 Mar 2026', 40, 300]], HEAD_AMT, [D('17 Feb'), DESC('SAMPLE STORE NEW YORK'), AMT('35.38')], [DESC('USD 45.00 @ 1.2718')]]).draft;
    expect(d.rows[0]).toMatchObject({
      magnitude: 3538,
      currency: 'GBP',
      description: 'SAMPLE STORE NEW YORK USD 45.00 @ 1.2718',
      issues: ['pdf-wrapped-description'],
    });
  });
});

describe('sections and failures', () => {
  it('returns one draft per section in file order with hints', () => {
    const r = pdfToDrafts(
      sheet([
        PERIOD,
        [['CHECKING ACCOUNT', 40, 140]],
        HEAD,
        [D('02 Mar'), DESC('A'), OUT('1.00')],
        [['SAVINGS ACCOUNT', 40, 140]],
        HEAD,
        [D('03 Mar'), DESC('B'), IN('2.00')],
        [['CREDIT CARD', 40, 140]],
        HEAD,
        [D('04 Mar'), DESC('C'), OUT('3.00')],
      ]),
      opts(),
    );
    if (r.kind !== 'drafts') throw new Error('expected drafts');
    expect(r.drafts.map((d) => d.sectionLabel)).toEqual(['checking', 'savings', 'card']);
    expect(r.drafts.map((d) => d.draft.accountHint)).toEqual(['bank', 'bank', 'card']);
    expect(r.drafts.map((d) => d.draft.rows[0]!.description)).toEqual(['A', 'B', 'C']);
    expect(r.drafts[0]!.draft.periodStart).toBe('2026-03-01');
  });

  it('skips an unreadable section when another reads', () => {
    const r = pdfToDrafts(
      sheet([[['CHECKING ACCOUNT', 40, 140]], [DESC('nothing here')], [['SAVINGS ACCOUNT', 40, 140]], PERIOD, HEAD, [D('03 Mar'), DESC('B'), IN('2.00')]]),
      opts(),
    );
    if (r.kind !== 'drafts') throw new Error('expected drafts');
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]!.sectionLabel).toBe('savings');
  });

  it('is unreadable with no table', () => {
    const r = pdfToDrafts(sheet([[DESC('hello world')]]), opts());
    expect(r).toEqual({
      kind: 'unreadable',
      fingerprint: { failedStep: 'no_table', pages: '1', hasDate: false, hasDescription: false, hasAmount: false, hasDebitCredit: false, hasBalance: false },
    });
  });

  it('is unreadable with a header but no rows', () => {
    const r = pdfToDrafts({ ...sheet([HEAD]), pageCount: 3 }, opts());
    expect(r).toMatchObject({ kind: 'unreadable', fingerprint: { failedStep: 'no_rows', pages: '2-5', hasDate: true, hasDebitCredit: true, hasBalance: true } });
  });

  it('keeps only the first failure across sections', () => {
    const r = pdfToDrafts(sheet([[['CHECKING ACCOUNT', 40, 140]], [DESC('x')], [['SAVINGS ACCOUNT', 40, 140]], HEAD]), opts());
    expect(r).toMatchObject({ kind: 'unreadable', fingerprint: { failedStep: 'no_table' } });
  });
});
