import { findHeaders, groupLines, looksNumeric, matchHeaderCell, placeCell } from '../layout';
import type { ColumnAnchor, PdfCell, PdfLine } from '../layout';
import type { PdfPageText, PdfTextItem } from '../types';

const item = (str: string, x: number, y: number, w = 40): PdfTextItem => ({ str, x, y, w });
const page = (n: number, items: PdfTextItem[]): PdfPageText => ({ n, width: 600, height: 800, items });
const cell = (text: string, x0: number, x1: number): PdfCell => ({ text, x0, x1 });
const line = (cells: PdfCell[], y = 700, p = 1): PdfLine => ({ page: p, y, cells });

describe('groupLines', () => {
  it('puts baselines within tolerance on one line', () => {
    const lines = groupLines([page(1, [item('A', 50, 700), item('B', 200, 701.5)])]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.cells.map((c) => c.text)).toEqual(['A', 'B']);
  });

  it('splits distant baselines, higher first, and keeps page order', () => {
    const lines = groupLines([
      page(1, [item('low', 50, 686), item('high', 50, 700)]),
      page(2, [item('p2', 50, 700)]),
    ]);
    expect(lines.map((l) => [l.page, l.cells[0]!.text])).toEqual([
      [1, 'high'],
      [1, 'low'],
      [2, 'p2'],
    ]);
  });

  it('joins close runs into one cell and splits wide gaps', () => {
    const joined = groupLines([page(1, [item('GROCERS', 152, 700), item('ACME', 110, 700)])]);
    expect(joined[0]!.cells).toEqual([{ text: 'ACME GROCERS', x0: 110, x1: 192 }]);
    const apart = groupLines([page(1, [item('ACME', 110, 700), item('GROCERS', 170, 700)])]);
    expect(apart[0]!.cells.map((c) => c.text)).toEqual(['ACME', 'GROCERS']);
  });

  it('joins touching runs without a space and drops blanks', () => {
    const lines = groupLines([page(1, [item('AC', 100, 700, 10), item('ME', 110, 700, 10), item('  ', 300, 700), item('  ', 100, 650)])]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.cells).toEqual([{ text: 'ACME', x0: 100, x1: 120 }]);
  });

  it('collapses internal whitespace and handles an empty page', () => {
    expect(groupLines([page(1, [item('A   B', 10, 10)]), page(2, [])])[0]!.cells[0]!.text).toBe('A B');
  });

  it('keeps the widest right edge when runs overlap', () => {
    const lines = groupLines([page(1, [item('LONG', 100, 700, 100), item('IN', 110, 700, 10)])]);
    expect(lines[0]!.cells[0]!.x1).toBe(200);
  });
});

describe('looksNumeric', () => {
  it.each(['1,245.60', '120.40 OD', '500.00 CR', '-250.00', '(12.50)', '£35.38', '1.234,56', '45', '12.50-', '3 000,00', '5.00dr'])('accepts %s', (t) => {
    expect(looksNumeric(t)).toBe(true);
  });
  it.each(['02 Mar', 'ACME', '20-30-40', '', '1,245', '1234567890123', '12 34'])('rejects %s', (t) => {
    expect(looksNumeric(t)).toBe(false);
  });
});

describe('matchHeaderCell', () => {
  it.each([
    ['Date', 'date'],
    ['Transaction date', 'date'],
    ['Details', 'description'],
    ['Paid out', 'debit'],
    ['Money in', 'credit'],
    ['Debits', 'debit'],
    ['Credits', 'credit'],
    ['Amount (£)', 'amount'],
    ['Balance', 'balance'],
    ['Available balance', 'balance'],
    ['Balance:', 'balance'],
    ['Amount £', 'amount'],
  ])('%s -> %s', (t, role) => {
    expect(matchHeaderCell(t)).toBe(role);
  });
  it.each(['Reference no.', 'Payments', 'Charges'])('%s -> null', (t) => {
    expect(matchHeaderCell(t)).toBeNull();
  });
});

const headerLine = (y = 700, p = 1): PdfLine =>
  line([cell('Date', 40, 70), cell('Description', 94, 160), cell('Paid out', 340, 380), cell('Paid in', 420, 460), cell('Balance', 510, 545)], y, p);

describe('findHeaders', () => {
  it('anchors roles in order with x positions', () => {
    const h = findHeaders([headerLine()])[0]!;
    expect(h.line).toBe(0);
    expect(h.span).toBe(1);
    expect(h.anchors.map((a) => a.role)).toEqual(['date', 'description', 'debit', 'credit', 'balance']);
    expect(h.anchors[2]).toEqual({ role: 'debit', x0: 340, x1: 380 });
    expect(h.availableLabel).toBe(false);
  });

  it('turns an unrecognised cell into an other anchor', () => {
    const l = line([cell('Date', 40, 70), cell('Description', 94, 160), cell('Foreign amount', 250, 320), cell('Amount', 340, 380), cell('Balance', 510, 545)]);
    const h = findHeaders([l])[0]!;
    expect(h.anchors.map((a) => a.role)).toEqual(['date', 'description', 'other', 'amount', 'balance']);
    expect(Object.keys(h.anchors[2]!).sort()).toEqual(['role', 'x0', 'x1']);
  });

  it('merges a header split over two lines', () => {
    const top = line([cell('Date', 40, 70), cell('Description', 94, 160), cell('Paid', 340, 380), cell('Paid in', 420, 460), cell('Balance', 510, 545)], 700);
    const bottom = line([cell('out', 350, 370)], 688);
    const lines = [top, bottom, line([cell('02 Mar', 40, 70)], 676)];
    const hs = findHeaders(lines);
    expect(hs).toHaveLength(1);
    expect(hs[0]!.span).toBe(2);
    expect(hs[0]!.anchors.map((a) => a.role)).toEqual(['date', 'description', 'debit', 'credit', 'balance']);
  });

  it('merges when the top line alone is not a header and keeps leftover bottom cells', () => {
    const top = line([cell('Date', 40, 70), cell('Paid', 340, 380), cell('Balance', 510, 545)], 700);
    const bottom = line([cell('out', 350, 370), cell('note', 200, 230)], 688);
    const hs = findHeaders([top, bottom]);
    expect(hs[0]!.span).toBe(2);
    expect(hs[0]!.anchors.map((a) => a.role)).toEqual(['date', 'other', 'debit', 'balance']);
  });

  it('does not merge a header with the data line below it', () => {
    const data = line([cell('02 Mar', 40, 70), cell('ACME', 94, 130), cell('45.23', 340, 380), cell('1,200.37', 500, 545)], 688);
    const hs = findHeaders([headerLine(), data]);
    expect(hs).toHaveLength(1);
    expect(hs[0]!.span).toBe(1);
  });

  it('does not merge across pages or distant lines', () => {
    const top = line([cell('Date', 40, 70), cell('Paid', 340, 380), cell('Balance', 510, 545)], 700);
    expect(findHeaders([top, line([cell('out', 350, 370)], 688, 2)])).toEqual([]);
    expect(findHeaders([top, line([cell('out', 350, 370)], 600)])).toEqual([]);
  });

  it('rejects a header without a money column, with a repeated role, or without a date', () => {
    expect(findHeaders([line([cell('Date', 40, 70), cell('Description', 94, 160)])])).toEqual([]);
    expect(findHeaders([line([cell('Date', 40, 70), cell('Details', 94, 160), cell('Description', 200, 260), cell('Amount', 340, 380)])])).toEqual([]);
    expect(findHeaders([line([cell('Description', 94, 160), cell('Paid out', 340, 380), cell('Balance', 510, 545)])])).toEqual([]);
  });

  it('finds a header repeated on page 2', () => {
    const hs = findHeaders([headerLine(700, 1), line([cell('x', 1, 2)], 600, 1), headerLine(700, 2)]);
    expect(hs.map((h) => h.line)).toEqual([0, 2]);
  });

  it('flags an available balance header', () => {
    const l = line([cell('Date', 40, 70), cell('Description', 94, 160), cell('Amount', 340, 380), cell('Available balance', 480, 545)]);
    expect(findHeaders([l])[0]!.availableLabel).toBe(true);
  });
});

describe('placeCell', () => {
  const anchors: ColumnAnchor[] = [
    { role: 'date', x0: 40, x1: 70 },
    { role: 'description', x0: 94, x1: 160 },
    { role: 'debit', x0: 340, x1: 380 },
    { role: 'credit', x0: 420, x1: 460 },
    { role: 'balance', x0: 510, x1: 545 },
  ];
  it('places numeric cells by right edge', () => {
    expect(placeCell(cell('10.00', 430, 460), anchors)).toEqual({ kind: 'column', role: 'credit' });
    expect(placeCell(cell('10.00', 340, 380), anchors)).toEqual({ kind: 'column', role: 'debit' });
    expect(placeCell(cell('1,200.00', 500, 545), anchors)).toEqual({ kind: 'column', role: 'balance' });
  });
  it('reports a midway value as between', () => {
    expect(placeCell(cell('10.00', 380, 420), anchors)).toEqual({ kind: 'between', roles: ['debit', 'credit'] });
  });
  it('does not call a debit/balance near-tie between', () => {
    const a: ColumnAnchor[] = [
      { role: 'debit', x0: 340, x1: 380 },
      { role: 'balance', x0: 420, x1: 460 },
    ];
    expect(placeCell(cell('10.00', 380, 420), a).kind).toBe('column');
  });
  it('places text cells by left edge', () => {
    expect(placeCell(cell('ACME', 110, 140), anchors)).toEqual({ kind: 'column', role: 'description' });
    expect(placeCell(cell('02 Mar', 50, 80), anchors)).toEqual({ kind: 'column', role: 'date' });
  });
  it('has sensible fallbacks without matching anchors', () => {
    expect(placeCell(cell('10.00', 1, 2), [{ role: 'date', x0: 0, x1: 1 }])).toEqual({ kind: 'column', role: 'other' });
    expect(placeCell(cell('ACME', 1, 2), [])).toEqual({ kind: 'column', role: 'description' });
  });
  it('a single numeric anchor wins without a pair check', () => {
    expect(placeCell(cell('10.00', 1, 2), [{ role: 'amount', x0: 0, x1: 5 }])).toEqual({ kind: 'column', role: 'amount' });
  });
});
