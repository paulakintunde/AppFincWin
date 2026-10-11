import { assembleTable, findSections } from '../rows';
import type { PdfCell, PdfLine } from '../layout';

const c = (text: string, x0: number, x1: number): PdfCell => ({ text, x0, x1 });
let y = 800;
const ln = (cells: PdfCell[], page = 1): PdfLine => ({ page, y: (y -= 12), cells });
const header = (page = 1): PdfLine =>
  ln([c('Date', 40, 70), c('Description', 94, 160), c('Paid out', 340, 380), c('Paid in', 420, 460), c('Balance', 510, 545)], page);
const date = (t = '02 Mar') => c(t, 40, 70);
const desc = (t = 'ACME GROCERS') => c(t, 94, 94 + t.length * 5);
const out = (t: string) => c(t, 340, 380);
const cred = (t: string) => c(t, 420, 460);
const bal = (t: string) => c(t, 500, 545);

describe('assembleTable (header mode)', () => {
  it('builds a credit row with a balance', () => {
    const t = assembleTable([header(), ln([date(), desc('SALARY'), cred('1,500.00'), bal('2,745.60')])]);
    expect(t?.mode).toBe('header');
    expect(t?.roles).toEqual(['date', 'description', 'debit', 'credit', 'balance']);
    expect(t?.rows).toEqual([
      {
        page: 1,
        dateText: '02 Mar',
        descriptionParts: ['SALARY'],
        amountColumn: 'credit',
        amountText: null,
        debitText: null,
        creditText: '1,500.00',
        candidates: null,
        balanceText: '2,745.60',
        flags: [],
      },
    ]);
  });

  it('a wrapped description joins its row and is flagged, never emitted as its own row', () => {
    const t = assembleTable([header(), ln([date(), desc('ACME'), out('45.23'), bal('1,200.37')]), ln([desc('NBR 131')]), ln([desc('MORE')])]);
    expect(t?.rows).toHaveLength(1);
    expect(t?.rows[0]!.descriptionParts).toEqual(['ACME', 'NBR 131', 'MORE']);
    expect(t?.rows[0]!.flags).toEqual(['wrapped']);
    expect(t?.rows[0]!.amountColumn).toBe('debit');
  });

  it('ignores a text line before any row exists', () => {
    const t = assembleTable([header(), ln([desc('NOTE')]), ln([date(), desc(), out('1.00')])]);
    expect(t?.rows).toHaveLength(1);
    expect(t?.rows[0]!.flags).toEqual([]);
  });

  it('flags a line with an amount but no date', () => {
    const t = assembleTable([header(), ln([desc('MYSTERY'), out('9.99')])]);
    expect(t?.rows[0]).toMatchObject({ dateText: null, flags: ['no-date'], debitText: '9.99' });
  });

  it('flags a midway value as between', () => {
    const t = assembleTable([header(), ln([date(), desc(), c('10.00', 380, 420)])]);
    expect(t?.rows[0]).toMatchObject({ amountColumn: 'between', amountText: '10.00', flags: ['between'] });
    const two = assembleTable([header(), ln([date(), desc(), c('10.00', 380, 420), c('11.00', 382, 422)])]);
    expect(two?.rows[0]).toMatchObject({ amountText: '10.00', flags: ['between'] });
  });

  it('flags values in both money columns', () => {
    const t = assembleTable([header(), ln([date(), desc(), out('5.00'), cred('6.00')])]);
    expect(t?.rows[0]!.flags).toEqual(['both-columns']);
    expect(t?.rows[0]!.amountColumn).toBe('debit');
  });

  it('keeps the first value when a column holds two', () => {
    const t = assembleTable([header(), ln([date(), desc(), out('5.00'), c('7.00', 345, 380), bal('1.00'), c('2.00', 505, 545)])]);
    expect(t?.rows[0]).toMatchObject({ debitText: '5.00', balanceText: '1.00' });
  });

  it('uses an amount column and recognises a date placed as a numeric-looking cell', () => {
    const h = ln([c('Date', 40, 70), c('Details', 94, 160), c('Amount', 340, 380), c('Balance', 510, 545)]);
    const t = assembleTable([h, ln([c('14.03.26', 40, 80), desc(), c('12.00', 340, 380)])]);
    expect(t?.rows[0]).toMatchObject({ dateText: '14.03.26', amountText: '12.00', amountColumn: 'amount' });
    expect(t?.roles).toEqual(['date', 'description', 'amount', 'balance']);
  });

  it('puts a numeric-looking cell that is not near the date column in the numbers, not the date', () => {
    const t = assembleTable([header(), ln([desc('X'), c('03/04', 300, 330), cred('1.00')])]);
    expect(t?.rows[0]!.dateText).toBeNull();
  });

  it('attaches a balance-only line to a row without a balance, otherwise ignores it', () => {
    const t = assembleTable([
      header(),
      ln([date(), desc(), out('1.00')]),
      ln([bal('99.00')]),
      ln([bal('88.00')]),
    ]);
    expect(t?.rows).toHaveLength(1);
    expect(t?.rows[0]!.balanceText).toBe('99.00');
    expect(t?.rows[0]!.flags).toEqual([]);
  });

  it('ignores lines before the first header but still reads figures from them', () => {
    const t = assembleTable([
      ln([c('Statement period 1 March 2026 to 31 March 2026', 40, 300)]),
      ln([c('Sort code 12-34-56', 40, 200)]),
      ln([c('Account number 12345678', 40, 200)]),
      ln([date(), desc(), out('1.00')]),
      header(),
      ln([date(), desc(), out('2.00')]),
    ]);
    expect(t?.rows).toHaveLength(1);
    expect(t?.summary.periodLine).toBe('Statement period 1 March 2026 to 31 March 2026');
    expect(t?.summary.bankHint).toBe(true);
    expect(JSON.stringify(t)).not.toContain('12345678');
  });

  it('re-anchors on a header repeated on page 2 and skips a split header second line', () => {
    const top = ln([c('Date', 40, 70), c('Description', 94, 160), c('Paid', 340, 380), c('Paid in', 420, 460), c('Balance', 510, 545)], 2);
    const sub = ln([c('out', 350, 370)], 2);
    const t = assembleTable([header(), ln([date(), desc(), out('1.00')]), top, sub, ln([date('03 Mar'), desc(), cred('2.00')], 2)]);
    expect(t?.rows.map((r) => [r.page, r.amountColumn])).toEqual([
      [1, 'debit'],
      [2, 'credit'],
    ]);
  });

  it('captures opening, closing, limit and available figures and removes totals', () => {
    const t = assembleTable([
      ln([desc('Balance brought forward'), bal('1,245.60')]),
      header(),
      ln([date(), desc(), out('1.00')]),
      ln([desc('Closing balance'), bal('1,244.60')]),
      ln([desc('Credit limit'), bal('5,000.00')]),
      ln([desc('Available credit'), bal('4,000.00')]),
      ln([desc('Minimum payment 25.00')]),
      ln([desc('Total payments'), cred('300.00')]),
    ]);
    expect(t?.rows).toHaveLength(1);
    expect(t?.summary).toMatchObject({
      openingText: '1,245.60',
      closingText: '1,244.60',
      limitText: '5,000.00',
      availableText: '4,000.00',
      summaryLinesRemoved: true,
      cardHint: true,
    });
  });

  it('keeps the first opening figure and the last closing figure, and tolerates figure-less lines', () => {
    const t = assembleTable([
      header(),
      ln([desc('Opening balance'), bal('10.00')]),
      ln([desc('Previous balance'), bal('20.00')]),
      ln([desc('Opening balance')]),
      ln([desc('Closing balance'), bal('30.00')]),
      ln([desc('New balance')]),
      ln([desc('Carried forward'), bal('40.00')]),
    ]);
    expect(t?.summary).toMatchObject({ openingText: '10.00', closingText: '40.00' });
    expect(t?.rows).toHaveLength(0);
  });

  it('does not treat a merchant that merely starts with a removed word as a total', () => {
    const t = assembleTable([header(), ln([date(), desc('TOTALLY WINE'), out('9.00')])]);
    expect(t?.rows).toHaveLength(1);
    expect(t?.summary.summaryLinesRemoved).toBe(false);
  });

  it('drops section labels and keeps the first period line', () => {
    const t = assembleTable([
      ln([c('PERIOD 1 Mar to 31 Mar 2026', 40, 300)]),
      ln([c('Period again', 40, 100)]),
      header(),
      ln([c('Savings account', 40, 120)]),
      ln([date(), desc(), out('1.00')]),
    ]);
    expect(t?.summary.periodLine).toBe('PERIOD 1 Mar to 31 Mar 2026');
    expect(t?.rows[0]!.descriptionParts).toEqual(['ACME GROCERS']);
  });

  it('reads a period line from two dates without the word period', () => {
    const t = assembleTable([ln([c('1 March 2026 to 31 March 2026', 40, 300)]), header()]);
    expect(t?.summary.periodLine).toBe('1 March 2026 to 31 March 2026');
  });

  it('records an available-balance label and a card hint for card ending lines', () => {
    const h = ln([c('Date', 40, 70), c('Description', 94, 160), c('Amount', 340, 380), c('Available balance', 480, 545)]);
    const t = assembleTable([ln([c('Card ending 1234', 40, 200)]), h]);
    expect(t?.availableLabel).toBe(true);
    expect(t?.summary.cardHint).toBe(true);
    expect(JSON.stringify(t)).not.toContain('1234');
  });

  it('a dated line mentioning an account number stays a row and sets no hint', () => {
    const t = assembleTable([header(), ln([date(), desc('PAY ACCOUNT NUMBER REF'), out('4.00')])]);
    expect(t?.rows).toHaveLength(1);
    expect(t?.summary.bankHint).toBe(false);
  });

  it('starts a no-date row from a number-only line and keeps the first value in a column', () => {
    const noMoney = ln([c('Date', 40, 70), c('Description', 94, 160), c('Reference', 200, 260), c('Amount', 340, 380)]);
    const t = assembleTable([noMoney, ln([c('123.45', 340, 380)]), ln([date(), desc(), c('77.00', 200, 260), c('3.00', 340, 380)])]);
    expect(t?.rows).toHaveLength(2);
    expect(t?.rows[0]).toMatchObject({ dateText: null, flags: ['no-date'] });
    expect(t?.rows[1]).toMatchObject({ amountText: '77.00' });
  });
});

describe('assembleTable (headerless mode)', () => {
  const row = (d: string, name: string, ...nums: string[]): PdfLine =>
    ln([c(d, 40, 70), c(name, 94, 94 + name.length * 5), ...nums.map((n, i) => c(n, 300 + i * 60, 340 + i * 60))]);

  it('reads date-first lines ending in numbers', () => {
    const t = assembleTable([
      row('02 Mar', 'ACME GROCERS', '45.23', '1,200.37'),
      row('03 Mar', 'COFFEE', '3.50', '1,196.87'),
      row('04 Mar', 'RAIL', '12.00', '1,184.87'),
      row('05 Mar', 'SHOP', '1.00', '1,183.87'),
    ]);
    expect(t?.mode).toBe('headerless');
    expect(t?.roles).toEqual(['date', 'description', 'amount', 'balance']);
    expect(t?.availableLabel).toBe(false);
    expect(t?.rows).toHaveLength(4);
    expect(t?.rows[0]).toMatchObject({ dateText: '02 Mar', descriptionParts: ['ACME GROCERS'], candidates: ['45.23'], balanceText: '1,200.37', amountColumn: null, flags: [] });
  });

  it('takes the last of three trailing numbers as the balance, and a lone number as a candidate', () => {
    const t = assembleTable([
      row('02 Mar', 'A', '1.00', '2.00', '3.00'),
      row('03 Mar', 'B', '4.00'),
      row('04 Mar', 'C', '5.00'),
      row('05 Mar', 'D', '1', '2', '3', '4'),
    ]);
    expect(t?.rows[0]).toMatchObject({ candidates: ['1.00', '2.00'], balanceText: '3.00' });
    expect(t?.rows[1]).toMatchObject({ candidates: ['4.00'], balanceText: null });
    expect(t?.rows[3]).toMatchObject({ candidates: ['2', '3'], balanceText: '4', descriptionParts: ['D', '1'] });
    expect(t?.roles).toContain('balance');
  });

  it('has no balance role when no balances are seen, joins wrapped text, and ignores strays', () => {
    const t = assembleTable([
      ln([c('Intro text', 40, 100)]),
      row('02 Mar', 'A', '1.00'),
      ln([c('wrapped bit', 94, 150)]),
      ln([c('03 Mar', 40, 70), c('dated no numbers', 94, 200)]),
      ln([c('9.99', 300, 340), c('with number', 94, 150)]),
      row('03 Mar', 'B', '2.00'),
      row('04 Mar', 'C', '3.00'),
      ln([c('Opening balance', 40, 100), c('5.00', 300, 340)]),
      ln([c('CURRENT ACCOUNT', 40, 100)]),
    ]);
    expect(t?.roles).toEqual(['date', 'description', 'amount']);
    expect(t?.rows).toHaveLength(3);
    expect(t?.rows[0]).toMatchObject({ descriptionParts: ['A', 'wrapped bit'], flags: ['wrapped'] });
    expect(t?.summary.openingText).toBe('5.00');
  });

  it('returns null with no header and fewer than 3 usable lines', () => {
    expect(assembleTable([row('02 Mar', 'A', '1.00'), row('03 Mar', 'B', '2.00')])).toBeNull();
    expect(assembleTable([])).toBeNull();
  });
});

describe('findSections', () => {
  const dated = (): PdfLine => ln([date(), desc(), out('1.00')]);
  it('splits at section lines', () => {
    const lines = [ln([c('CURRENT ACCOUNT', 40, 140)], 1), dated(), dated(), ln([c('Savings   Account', 40, 140)], 2), dated(), ln([c('Credit card', 40, 100)], 3), dated()];
    expect(findSections(lines)).toEqual([
      { label: 'checking', fromLine: 0, toLine: 2 },
      { label: 'savings', fromLine: 3, toLine: 4 },
      { label: 'card', fromLine: 5, toLine: 6 },
    ]);
  });
  it.each([['CHECKING ACCOUNT', 'checking'], ['Checking', 'checking'], ['SAVINGS', 'savings']] as const)('labels %s as %s', (name, label) => {
    const spans = findSections([ln([c(name, 40, 100)]), dated(), ln([c('Credit Card', 40, 100)])]);
    expect(spans[0]!.label).toBe(label);
  });
  it('needs at least two section lines and ignores dated lines', () => {
    expect(findSections([ln([c('CURRENT ACCOUNT', 40, 100)]), dated()])).toEqual([]);
    expect(findSections([ln([c('CHECKING', 40, 100), c('02 Mar', 200, 240)]), ln([c('SAVINGS', 40, 100), c('03 Mar', 200, 240)])])).toEqual([]);
    expect(findSections([])).toEqual([]);
  });
});
