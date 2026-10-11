// Test-fixture tooling only. Never imported by app or Edge Function code.
//
// Generates the synthetic statement PDFs and their machine-readable expected
// ledgers. Every figure, name and address here is fictional ("Example Bank").
// One ledger object renders both the PDF and its expected JSON, so downstream
// tests never hand-copy numbers.
//
//   node scripts/fixtures/make-statement-pdfs.mjs [--out <dir>]
//   node scripts/fixtures/make-statement-pdfs.mjs --worst-case <scratch dir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePdf } from './pdf-writer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const DEFAULT_PDF_DIR = path.join(repoRoot, 'supabase', 'functions', '_fixtures', 'statement-pdfs');
const EXPECTED_DIR = path.join(repoRoot, 'src', 'engine', 'statement', 'pdf', '__tests__', 'fixtures');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December',
];

// ---------------------------------------------------------------- formatting

function money(minor) {
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${whole}.${String(abs % 100).padStart(2, '0')}`;
}

const parts = (iso) => iso.split('-').map(Number);
const dd = (iso) => String(parts(iso)[2]).padStart(2, '0');
const fmtShort = (iso) => `${dd(iso)} ${MONTHS[parts(iso)[1] - 1]}`; // 02 Mar
const fmtShortYear = (iso) => `${fmtShort(iso)} ${parts(iso)[0]}`; // 03 Mar 2026
const fmtSlash = (iso) => `${dd(iso)}/${String(parts(iso)[1]).padStart(2, '0')}/${parts(iso)[0]}`;
const fmtLong = (iso) => `${parseInt(dd(iso), 10)} ${LONG_MONTHS[parts(iso)[1] - 1]} ${parts(iso)[0]}`;

// ------------------------------------------------------------------ geometry

const COL = {
  date: { x: 50, align: 'left' },
  description: { x: 110, align: 'left' },
  out: { x: 380, align: 'right' },
  in: { x: 460, align: 'right' },
  balance: { x: 545, align: 'right' },
  amount: { x: 545, align: 'right' },
};
const ROW_STEP = 14;
const TOP_STEP = 12;
const FIRST_PAGE_HEADER_Y = 700;
const CONT_HEADER_Y = 780;
const MID_EDGE = 420; // midway between Paid out (380) and Paid in (460)

const newPage = () => ({ texts: [], shapes: [] });

function text(page, str, x, y, align = 'left') {
  page.texts.push({ str, x, y, align });
}

function topBlock(page, lines, startY = 812) {
  lines.forEach((line, i) => text(page, line, 50, startY - i * TOP_STEP));
}

/**
 * Draws a table. lines: { cells: [{ col, str, edge? }], keepWithNext? }.
 * Returns the page index the table finished on.
 */
function drawTable(pages, startPageIdx, { headerY, headers, lines, linesPerPage }) {
  let pageIdx = startPageIdx;
  const drawHeader = (page, y) => {
    for (const h of headers) text(page, h.label, COL[h.col].x, y, COL[h.col].align);
  };
  let y = headerY;
  drawHeader(pages[pageIdx], y);
  let used = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const need = line.keepWithNext ? 2 : 1;
    if (used + need > linesPerPage) {
      pageIdx += 1;
      if (!pages[pageIdx]) pages[pageIdx] = newPage();
      y = CONT_HEADER_Y;
      drawHeader(pages[pageIdx], y);
      used = 0;
    }
    y -= ROW_STEP;
    used += 1;
    for (const c of line.cells) {
      const col = COL[c.col];
      text(pages[pageIdx], c.str, c.edge ?? col.x, y, c.edge ? 'right' : col.align);
    }
  }
  return pageIdx;
}

// ------------------------------------------------------------ ledger helpers

function withBalances(opening, rows) {
  let bal = opening;
  return rows.map((r) => {
    bal += r.amount;
    return { ...r, balance: bal };
  });
}

function balanceText(bal) {
  return bal < 0 ? `${money(bal)} OD` : money(bal);
}

/** Rows of a bank table that prints a running balance. */
function bankBalanceLines(opening, rows, closing, dateFmt) {
  const lines = [{ cells: [{ col: 'description', str: 'Balance brought forward' }, { col: 'balance', str: balanceText(opening) }] }];
  for (const r of rows) {
    const cells = [];
    if (!r.print?.noDate) cells.push({ col: 'date', str: dateFmt(r.date) });
    cells.push({ col: 'description', str: r.description });
    const edge = r.print?.edge;
    cells.push({ col: r.amount < 0 ? 'out' : 'in', str: money(r.amount), edge });
    cells.push({ col: 'balance', str: balanceText(r.balance) });
    lines.push({ cells, keepWithNext: Boolean(r.print?.wrap) });
    if (r.print?.wrap) lines.push({ cells: [{ col: 'description', str: r.print.wrap }] });
  }
  lines.push({ cells: [{ col: 'description', str: 'Balance carried forward' }, { col: 'balance', str: balanceText(closing) }] });
  return lines;
}

const BALANCE_HEADERS = [
  { col: 'date', label: 'Date' },
  { col: 'description', label: 'Description' },
  { col: 'out', label: 'Paid out' },
  { col: 'in', label: 'Paid in' },
  { col: 'balance', label: 'Balance' },
];

function expectedRow(r, extra = {}) {
  return {
    date: r.date,
    description: r.print?.wrap ? `${r.description} ${r.print.wrap}` : r.description,
    amount: r.amount,
    balance: r.balance ?? null,
    flags: r.flags ?? [],
    foreign: r.foreign ?? null,
    feeOf: r.feeOf ?? null,
    ...extra,
  };
}

function finish({ name, accountKind, currency, period, opening, closing, rows, sections = null, reconcile }) {
  return {
    name,
    accountKind,
    currency,
    period,
    opening,
    closing,
    rows: rows.map((r) => expectedRow(r)),
    sections,
    expect: {
      reconcile,
      uncertainRows: rows.flatMap((r, i) => ((r.flags ?? []).length > 0 ? [i] : [])),
    },
  };
}

// ----------------------------------------------------------------- fixtures

const IDENT = ['Example Bank', 'ALEX SAMPLE', '1 EXAMPLE STREET'];

function buildCurrentAccount() {
  const spec = [
    [-50000, 'CARD PAYMENT EXAMPLE CARD'],
    [-4520, 'ACME GROCERS'],
    [-8900, 'NORTHWIND ENERGY'],
    [-1275, 'FABRIKAM CAFE'],
    [-3600, 'TAILSPIN TRAVEL'],
    [-2499, 'WINGTIP TOYS'],
    [-1850, 'LITWARE BOOKS'],
    [-5210, 'ACME GROCERS'],
    [-60000, 'ADVENTURE WORKS'],
    [-3345, 'FABRIKAM CAFE'],
    [-7200, 'TAILSPIN TRAVEL'],
    [-1999, 'WINGTIP TOYS'],
    [-4310, 'ACME GROCERS'],
    [-14000, 'NORTHWIND ENERGY'],
    [-2250, 'LITWARE BOOKS'],
    [-6780, 'ADVENTURE WORKS'],
    [-3120, 'FABRIKAM CAFE'],
    [-9900, 'ACME GROCERS'],
    [-1500, 'WINGTIP TOYS'],
    [185000, 'CONTOSO PAYROLL'],
    [-3875, 'ACME GROCERS'],
    [-2100, 'FABRIKAM CAFE'],
    [-5400, 'LITWARE BOOKS'],
    [-1299, 'WINGTIP TOYS'],
    [-8800, 'NORTHWIND ENERGY'],
    [-4150, 'TAILSPIN TRAVEL'],
    [-2760, 'ACME GROCERS'],
    [-1190, 'FABRIKAM CAFE'],
    [-6300, 'ADVENTURE WORKS'],
    [-3050, 'ACME GROCERS'],
  ];
  const day = (i) => (i <= 17 ? 1 + i : i === 18 ? 18 : i);
  const raw = spec.map(([amount, description], i) => {
    const row = {
      date: `2026-03-${String(day(i)).padStart(2, '0')}`,
      description,
      amount,
      flags: [],
      print: {},
    };
    if (i === 5) {
      row.print.wrap = 'REF 88213';
      row.flags = ['pdf-wrapped-description'];
    }
    if (i === 12) row.print.edge = MID_EDGE;
    if (i === 18) {
      row.print.noDate = true;
      row.flags = ['pdf-no-date'];
    }
    return row;
  });
  const opening = 124560;
  const rows = withBalances(opening, raw);
  const closing = rows[rows.length - 1].balance;

  const p1 = newPage();
  const pages = [p1];
  topBlock(p1, [
    ...IDENT,
    'Sort code 20-30-40 Account number 40302010',
    'Statement period 1 March 2026 to 31 March 2026',
  ]);
  drawTable(pages, 0, {
    headerY: FIRST_PAGE_HEADER_Y,
    headers: BALANCE_HEADERS,
    lines: bankBalanceLines(opening, rows, closing, fmtShort),
    linesPerPage: 20,
  });
  return {
    pages,
    expected: finish({
      name: 'current-account', accountKind: 'checking', currency: 'GBP',
      period: { start: '2026-03-01', end: '2026-03-31' }, opening, closing, rows, reconcile: 'partial',
    }),
  };
}

function buildSavings() {
  const opening = 500000;
  const spec = [
    ['2026-03-03', 'TRANSFER IN', 30000],
    ['2026-03-07', 'WITHDRAWAL', -25000],
    ['2026-03-14', 'TRANSFER IN', 15000],
    ['2026-03-15', 'WITHDRAWAL', -8000],
    ['2026-03-21', 'TRANSFER IN', 40000],
    ['2026-03-25', 'WITHDRAWAL', -12000],
    ['2026-03-28', 'TRANSFER IN', 5000],
    ['2026-03-31', 'INTEREST PAID', 1245],
  ];
  const rows = spec.map(([date, description, amount]) => ({ date, description, amount, flags: [] }));
  const closing = opening + rows.reduce((s, r) => s + r.amount, 0);

  const page = newPage();
  topBlock(page, [
    ...IDENT,
    'Sort code 20-30-40 Account number 40302011',
    'Statement period 1 March 2026 to 31 March 2026',
    `Opening balance ${money(opening)}`,
    `Closing balance ${money(closing)}`,
  ]);
  const lines = rows.map((r) => ({
    cells: [
      { col: 'date', str: fmtSlash(r.date) },
      { col: 'description', str: r.description },
      { col: 'amount', str: r.amount < 0 ? `-${money(r.amount)}` : money(r.amount) },
    ],
  }));
  drawTable([page], 0, {
    headerY: FIRST_PAGE_HEADER_Y,
    headers: [
      { col: 'date', label: 'Date' },
      { col: 'description', label: 'Details' },
      { col: 'amount', label: 'Amount' },
    ],
    lines,
    linesPerPage: 40,
  });
  return {
    pages: [page],
    expected: finish({
      name: 'savings', accountKind: 'savings', currency: 'GBP',
      period: { start: '2026-03-01', end: '2026-03-31' }, opening, closing, rows, reconcile: 'all-verified',
    }),
  };
}

function buildCreditCard() {
  // Stored sign: spend negative, payment positive; owed is negative.
  const spec = [
    ['2026-02-05', 'ACME GROCERS', -12430],
    ['2026-02-08', 'FABRIKAM CAFE', -3495],
    ['2026-02-11', 'TAILSPIN TRAVEL', -24500],
    ['2026-02-14', 'WINGTIP TOYS', -8999],
    ['2026-02-17', 'SAMPLE STORE NEW YORK', -3538],
    ['2026-02-17', 'NON-STERLING TRANSACTION FEE', -97],
    ['2026-02-20', 'NORTHWIND ENERGY', -9400],
    ['2026-02-23', 'LITWARE BOOKS', -2750],
    ['2026-02-25', 'ADVENTURE WORKS', -17600],
    ['2026-02-27', 'ACME GROCERS', -6230],
    ['2026-03-01', 'FABRIKAM CAFE', -3921],
    ['2026-03-02', 'PAYMENT - THANK YOU', 50000],
  ];
  const rows = spec.map(([date, description, amount]) => ({ date, description, amount, flags: [], print: {} }));
  rows[4].print.wrap = 'USD 45.00 @ 1.2718';
  rows[4].flags = ['pdf-wrapped-description'];
  rows[4].foreign = { amount: -4500, currency: 'USD' };
  rows[5].feeOf = 4;
  const opening = -82040;
  const closing = -125000;
  if (opening + rows.reduce((s, r) => s + r.amount, 0) !== closing) throw new Error('credit-card ledger does not close');

  const pages = [newPage()];
  topBlock(pages[0], [
    ...IDENT,
    'Card ending 4321',
    'Statement period 05 Feb 2026 - 04 Mar 2026',
    'Previous balance 820.40',
    'New balance 1,250.00',
    'Credit limit 1,000.00',
    'Minimum payment 25.00',
  ]);
  const lines = [];
  for (const r of rows) {
    const amountStr = r.amount > 0 ? `${money(r.amount)} CR` : money(r.amount);
    lines.push({
      cells: [
        { col: 'date', str: fmtShort(r.date) },
        { col: 'description', str: r.description },
        { col: 'amount', str: amountStr },
      ],
      keepWithNext: Boolean(r.print.wrap),
    });
    if (r.print.wrap) lines.push({ cells: [{ col: 'description', str: r.print.wrap }] });
  }
  drawTable(pages, 0, {
    headerY: 660,
    headers: [
      { col: 'date', label: 'Transaction date' },
      { col: 'description', label: 'Description' },
      { col: 'amount', label: 'Amount' },
    ],
    lines,
    linesPerPage: 8,
  });
  return {
    pages,
    expected: finish({
      name: 'credit-card', accountKind: 'credit', currency: 'GBP',
      period: { start: '2026-02-05', end: '2026-03-04' }, opening, closing, rows, reconcile: 'partial',
    }),
  };
}

function buildYearEnd() {
  const spec = [
    ['2025-12-16', 'ACME GROCERS', -6420],
    ['2025-12-18', 'FABRIKAM CAFE', -1850],
    ['2025-12-20', 'TAILSPIN TRAVEL', -12000],
    ['2025-12-22', 'WINGTIP TOYS', -4599],
    ['2025-12-24', 'ACME GROCERS', -9310],
    ['2025-12-27', 'LITWARE BOOKS', -2299],
    ['2025-12-30', 'CONTOSO PAYROLL', 210000],
    ['2026-01-02', 'NORTHWIND ENERGY', -11500],
    ['2026-01-05', 'ADVENTURE WORKS', -7800],
    ['2026-01-07', 'FABRIKAM CAFE', -1475],
    ['2026-01-09', 'ACME GROCERS', -5560],
    ['2026-01-12', 'WINGTIP TOYS', -2999],
    ['2026-01-13', 'LITWARE BOOKS', -1850],
    ['2026-01-13', 'TAILSPIN TRAVEL', -4200],
  ];
  const opening = 98000;
  const rows = withBalances(opening, spec.map(([date, description, amount]) => ({ date, description, amount, flags: [], print: {} })));
  const closing = rows[rows.length - 1].balance;

  const pages = [newPage()];
  topBlock(pages[0], [
    ...IDENT,
    'Sort code 20-30-40 Account number 40302010',
    'Statement period 15 December 2025 to 14 January 2026',
  ]);
  drawTable(pages, 0, {
    headerY: FIRST_PAGE_HEADER_Y,
    headers: BALANCE_HEADERS,
    lines: bankBalanceLines(opening, rows, closing, fmtShort),
    linesPerPage: 40,
  });
  return {
    pages,
    expected: finish({
      name: 'year-end', accountKind: 'checking', currency: 'GBP',
      period: { start: '2025-12-15', end: '2026-01-14' }, opening, closing, rows, reconcile: 'all-verified',
    }),
  };
}

function buildNoBalances() {
  const spec = [
    ['2026-03-03', 'ACME GROCERS', -4520],
    ['2026-03-05', 'FABRIKAM CAFE', -1275],
    ['2026-03-08', 'NORTHWIND ENERGY', -8900],
    ['2026-03-10', 'CONTOSO PAYROLL', 150000],
    ['2026-03-12', 'TAILSPIN TRAVEL', -3600],
    ['2026-03-15', 'WINGTIP TOYS', -2350],
    ['2026-03-18', 'LITWARE BOOKS', -1850],
    ['2026-03-21', 'ACME GROCERS', -5210],
    ['2026-03-26', 'ADVENTURE WORKS', -6780],
    ['2026-03-29', 'FABRIKAM CAFE', -3345],
  ];
  const rows = spec.map(([date, description, amount], i) => ({
    date, description, amount, flags: i === 6 ? ['pdf-ambiguous-column'] : [], print: i === 6 ? { edge: MID_EDGE } : {},
  }));
  const pages = [newPage()];
  topBlock(pages[0], [...IDENT, 'Sort code 20-30-40 Account number 40302010']);
  const lines = rows.map((r) => ({
    cells: [
      { col: 'date', str: fmtShortYear(r.date) },
      { col: 'description', str: r.description },
      { col: r.amount < 0 ? 'out' : 'in', str: money(r.amount), edge: r.print.edge },
    ],
  }));
  drawTable(pages, 0, {
    headerY: FIRST_PAGE_HEADER_Y,
    headers: [
      { col: 'date', label: 'Date' },
      { col: 'description', label: 'Description' },
      { col: 'out', label: 'Money out' },
      { col: 'in', label: 'Money in' },
    ],
    lines,
    linesPerPage: 40,
  });
  return {
    pages,
    expected: finish({
      name: 'no-balances', accountKind: 'checking', currency: 'GBP',
      period: null, opening: null, closing: null, rows, reconcile: 'none-in-file',
    }),
  };
}

function buildMultiAccount() {
  const currentSpec = [
    ['2026-03-02', 'ACME GROCERS', -4520],
    ['2026-03-04', 'CONTOSO PAYROLL', 180000],
    ['2026-03-09', 'NORTHWIND ENERGY', -8900],
    ['2026-03-13', 'FABRIKAM CAFE', -1275],
    ['2026-03-20', 'TAILSPIN TRAVEL', -3600],
    ['2026-03-27', 'WINGTIP TOYS', -2499],
  ];
  const savingsSpec = [
    ['2026-03-05', 'TRANSFER IN', 20000],
    ['2026-03-12', 'WITHDRAWAL', -5000],
    ['2026-03-19', 'TRANSFER IN', 10000],
    ['2026-03-31', 'INTEREST PAID', 812],
  ];
  const mk = (spec) => spec.map(([date, description, amount]) => ({ date, description, amount, flags: [], print: {} }));
  const curOpening = 75000;
  const savOpening = 250000;
  const curRows = withBalances(curOpening, mk(currentSpec));
  const savRows = withBalances(savOpening, mk(savingsSpec));
  const curClosing = curRows[curRows.length - 1].balance;
  const savClosing = savRows[savRows.length - 1].balance;

  const p1 = newPage();
  const p2 = newPage();
  topBlock(p1, [...IDENT, 'Statement period 1 March 2026 to 31 March 2026']);
  text(p1, 'CURRENT ACCOUNT', 50, 764);
  text(p1, 'Account number 40302010', 50, 752);
  drawTable([p1, p2], 0, {
    headerY: FIRST_PAGE_HEADER_Y,
    headers: BALANCE_HEADERS,
    lines: bankBalanceLines(curOpening, curRows, curClosing, fmtShort),
    linesPerPage: 40,
  });
  text(p2, 'Example Bank', 50, 812);
  text(p2, 'SAVINGS ACCOUNT', 50, 780);
  text(p2, 'Account number 40302011', 50, 768);
  drawTable([p1, p2], 1, {
    headerY: 740,
    headers: BALANCE_HEADERS,
    lines: bankBalanceLines(savOpening, savRows, savClosing, fmtShort),
    linesPerPage: 40,
  });
  // drawTable restarts pagination at page 0 header only for startPageIdx; page 2 header drawn at 740.
  const expected = finish({
    name: 'multi-account', accountKind: 'checking', currency: 'GBP',
    period: { start: '2026-03-01', end: '2026-03-31' }, opening: curOpening, closing: curClosing,
    rows: curRows, reconcile: 'all-verified',
    sections: [
      { kind: 'bank', label: 'checking', rowCount: curRows.length },
      { kind: 'bank', label: 'savings', rowCount: savRows.length },
    ],
  });
  // Additive: the second section's own ledger, so tests need not hand-copy it.
  expected.sections[0].opening = curOpening;
  expected.sections[0].closing = curClosing;
  expected.sections[1].opening = savOpening;
  expected.sections[1].closing = savClosing;
  expected.sections[1].rows = savRows.map((r) => expectedRow(r));
  return { pages: [p1, p2], expected };
}

const STATEMENTS = [
  buildCurrentAccount,
  buildSavings,
  buildCreditCard,
  buildYearEnd,
  buildNoBalances,
  buildMultiAccount,
];

// ------------------------------------------------------- edge-case fixtures

function buildScanned() {
  // Shapes only: no text operators at all, like an image-only scan.
  const page = newPage();
  page.shapes.push(
    '0.85 g 50 620 495 150 re f',
    '0 G 1 w 50 600 m 545 600 l S',
    '0 G 1 w 50 560 m 545 560 l S',
    '0 G 1 w 50 520 m 545 520 l S',
    '0 G 1 w 50 480 m 545 480 l S',
    '0 G 1 w 110 600 m 110 480 l S',
    '0 G 1 w 380 600 m 380 480 l S',
    '0.7 g 50 440 200 20 re f',
  );
  return { pages: [page] };
}

function buildEncrypted() {
  const spec = [
    ['2026-03-02', 'ACME GROCERS', -4520],
    ['2026-03-04', 'CONTOSO PAYROLL', 180000],
    ['2026-03-09', 'NORTHWIND ENERGY', -8900],
    ['2026-03-13', 'FABRIKAM CAFE', -1275],
    ['2026-03-17', 'TAILSPIN TRAVEL', -3600],
    ['2026-03-20', 'WINGTIP TOYS', -2499],
    ['2026-03-24', 'LITWARE BOOKS', -1850],
    ['2026-03-27', 'ACME GROCERS', -5210],
  ];
  const opening = 124560;
  const rows = withBalances(opening, spec.map(([date, description, amount]) => ({ date, description, amount, flags: [], print: {} })));
  const closing = rows[rows.length - 1].balance;
  const pages = [newPage()];
  topBlock(pages[0], [
    ...IDENT,
    'Sort code 20-30-40 Account number 40302010',
    'Statement period 1 March 2026 to 31 March 2026',
  ]);
  drawTable(pages, 0, {
    headerY: FIRST_PAGE_HEADER_Y,
    headers: BALANCE_HEADERS,
    lines: bankBalanceLines(opening, rows, closing, fmtShort),
    linesPerPage: 40,
  });
  return { pages };
}

function buildTooManyPages() {
  const pages = [];
  for (let p = 0; p < 26; p++) {
    const page = newPage();
    text(page, `Example Bank page ${p + 1} of 26`, 50, 812);
    const lines = [0, 1, 2].map((i) => ({
      cells: [
        { col: 'date', str: `0${i + 1} Mar` },
        { col: 'description', str: 'ACME GROCERS' },
        { col: 'out', str: money(1000 + i) },
        { col: 'balance', str: money(500000 - i) },
      ],
    }));
    drawTable([page], 0, { headerY: FIRST_PAGE_HEADER_Y, headers: BALANCE_HEADERS, lines, linesPerPage: 40 });
    pages.push(page);
  }
  return { pages };
}

function writeWorstCase(dir) {
  const rows = [];
  let bal = 5000000;
  for (let i = 0; i < 1000; i++) {
    const amount = i % 7 === 0 ? 25000 : -(1000 + ((i * 37) % 9000));
    bal += amount;
    rows.push({ date: `2026-03-${String(1 + (i % 28)).padStart(2, '0')}`, description: 'ACME GROCERS', amount, balance: bal, print: {} });
  }
  const pages = [];
  let rowIdx = 0;
  for (let p = 0; p < 25; p++) {
    const page = newPage();
    pages.push(page);
    if (p === 0) topBlock(page, [...IDENT, 'Statement period 1 March 2026 to 31 March 2026']);
    const lines = rows.slice(rowIdx, rowIdx + 40).map((r) => bankBalanceLines(0, [r], r.balance, fmtShort)[1]);
    rowIdx += 40;
    const headerY = p === 0 ? FIRST_PAGE_HEADER_Y : CONT_HEADER_Y;
    const pageList = [page];
    drawTable(pageList, 0, { headerY, headers: BALANCE_HEADERS, lines, linesPerPage: 40 });
  }
  const base = writePdf(pages, { name: 'worst-case' });
  const target = 10_000_000;
  const filler = target - base.length - 120;
  const buf = writePdf(pages, { name: 'worst-case', fillerBytes: filler });
  if (buf.length < 9_900_000 || buf.length > 10_400_000) throw new Error('worst-case size out of window');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'worst-case-25-pages.pdf');
  fs.writeFileSync(out, buf);
  console.log(`${out} ${buf.length}`);
}

// ---------------------------------------------------------------------- main

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

function main() {
  const argv = process.argv.slice(2);
  const wcIdx = argv.indexOf('--worst-case');
  if (wcIdx >= 0) {
    writeWorstCase(path.resolve(argv[wcIdx + 1]));
    return;
  }
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : DEFAULT_PDF_DIR;
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(EXPECTED_DIR, { recursive: true });

  for (const build of STATEMENTS) {
    const { pages, expected } = build();
    fs.writeFileSync(path.join(outDir, `${expected.name}.pdf`), writePdf(pages, { name: expected.name }));
    writeJson(path.join(EXPECTED_DIR, `${expected.name}.expected.json`), expected);
  }
  const extras = [
    ['scanned', buildScanned().pages, {}],
    ['encrypted', buildEncrypted().pages, { encrypt: { userPassword: 'fincwin-test', ownerPassword: 'fincwin-owner' } }],
    ['too-many-pages', buildTooManyPages().pages, {}],
  ];
  for (const [name, pages, opts] of extras) {
    fs.writeFileSync(path.join(outDir, `${name}.pdf`), writePdf(pages, { name, ...opts }));
  }
  console.log(`wrote ${STATEMENTS.length + extras.length} statements to ${outDir}`);
}

main();
