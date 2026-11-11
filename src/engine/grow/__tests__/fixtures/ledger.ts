/**
 * LEDGER.md figures (all minor units, ISO dates) shared by the engine, connect and screen tests.
 * Plain numbers on purpose: no imports, so any layer's tests can use them.
 */
export const LEDGER_TODAY = '2026-11-05';

export const accounts = { checking: 316268, savings: 194000, cash: 6000, visa: -39768 } as const;

export const goals = {
  safetyNet: { target: 230000, saved: 130000, monthly: 10000, locked: true },
  lisbon: { target: 180000, saved: 64000, opening: 54000, monthly: 5000, firstDeposit: '2026-11-16', locked: true },
  laptop: { target: 350000, saved: 0 },
} as const;

export const holdings = {
  retirement: { value: 645000, putIn: 580000, monthly: 15000, asOf: '2026-11-01', type: 'retirement' },
  index: { value: 124000, putIn: 120000, monthly: 5000, asOf: '2026-11-01', type: 'brokerage' },
} as const;

export const autoLoan = { balance: 842000, apr: '6.9', payment: 31200, dueDay: 15, startedBalance: 1450000 } as const;

export const calcDebts = {
  card: { balance: 420000, apr: '21.9', payment: 12000 },
  loan: { balance: 150000, apr: '9.5', payment: 7500 },
} as const;

export const netWorth = 403500;
