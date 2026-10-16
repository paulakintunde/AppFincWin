// Scenario definitions for the D-22 golden fixtures (engine-neutral schema; money in minor units).
//
// Neutralisation rules -- they are why parity against the prototype is meaningful:
//  1. Every scenario has 3-6 FULL months with IDENTICAL `spending` in every month
//     (engine average = worst = prototype current-month `exp`; neutralises D-08/D-09/D-10).
//  2. limits.reserve, limits.investingFloor and limits.dsr are explicit (neutralises
//     D-01/D-02/D-05 defaults); `return` is explicit "6.5" (neutralises D-06).
//  3. Card scenarios give an explicit apr and US-prototype minimumTerms
//     { minimumPercent "1", interestAdded true, floor 2500 } and dealerCap 500000
//     (neutralises D-07/D-16).
//  4. No vehicle-over-cap card scenario and no card-minimum scenario that the prototype
//     reports `never` (D-17/D-18 are named deviation tests). Instalment scenarios compare
//     plan numbers only (the prototype's unconditional `miss: true` is a named deviation).
//  5. Every non-card debt rate is < 15 and `revolving: false`.
//  6. No two warnings share an equal shortfall (tie order is an engine rule tested separately).

const months = (incomes, spending) => incomes.map((income) => ({ income, spending }));
const flat = (income, spending, n = 3) => months(Array(n).fill(income), spending);

const MIN_TERMS = { minimumPercent: '1', interestAdded: true, floor: 2500 };

function scn(name, over) {
  return {
    name,
    months: flat(520000, 310000),
    cash: 1500000,
    debts: [],
    saving: 30000,
    investing: 100000,
    limits: { reserve: 600000, dsr: '36', investingFloor: 100000 },
    return: '6.5',
    scope: { kind: 'personal' },
    ...over,
  };
}

const buy = (price, payment, extra = {}) => ({
  kind: 'buy',
  price,
  dayFees: 0,
  runningCostsNet: 0,
  itemType: 'general',
  payment,
  ...extra,
});

const loanPay = (deposit, termMonths, apr) => ({ method: 'loan', deposit, termMonths, apr });
const cardPay = (payoff, apr, months) => ({
  method: 'card',
  payoff,
  months,
  apr,
  minimumTerms: MIN_TERMS,
  dealerCap: 500000,
});

const unsec = (balance, minimumPayment) => ({
  id: 'd1',
  balance,
  minimumPayment,
  secured: false,
  rate: '9.9',
  revolving: false,
});

export const PAYOFF_CASES = {
  dpmt: [
    [200000, 6, 360],
    [100000, 6, 360],
    [20000, 7, 60],
    [1000, 12, 12],
    [11500, 9.4, 48],
    [5000, 0, 12],
    [5000, 9.4, 1],
    [100000, 22.9, 600],
    [14500, 0, 600],
  ].map((args) => ({ name: 'dpmt-' + args.join('-'), args })),
  dfv: [
    [100, 12, 12, 0],
    [0, 12, 12, 1000],
    [100, 12, 12, 1000],
    [250, 0, 24, 500],
    [100, 6.5, 0, 700],
    [500, 6.5, 120, 0],
    [300, 6.5, 600, 2000],
  ].map((args) => ({ name: 'dfv-' + args.join('-'), args })),
  dSimMin: [
    [5000, 22.9],
    [1000, 22.9],
    [20, 22.9],
    [5000, 29.99],
    [800, 0],
    [12000, 18.5],
  ].map((args) => ({ name: 'dSimMin-' + args.join('-'), args })),
};

export const DECIDE_SCENARIOS = [
  // --- cash ---
  scn('cash-fits', { check: buy(300000, { method: 'cash' }) }),
  scn('cash-no', { check: buy(1600000, { method: 'cash' }) }),
  scn('cash-cushion-only', { check: buy(1000000, { method: 'cash' }) }),

  // --- loan ---
  scn('loan-fits', { check: buy(600000, loanPay(300000, 48, '9.4')) }),
  // dsr only: existing unsecured debt min 1000.00; new loan payment pushes dsr over 36% while left stays >= 0
  scn('loan-dsr-only', {
    months: flat(520000, 250000),
    debts: [unsec(1000000, 100000)],
    saving: 20000,
    investing: 50000,
    limits: { reserve: 600000, dsr: '36', investingFloor: 50000 },
    check: buy(4100000, loanPay(500000, 48, '9.4')),
  }),
  // month + inv together: new payment exceeds free monthly money and cuts investing below its floor
  scn('loan-month-and-inv', {
    months: flat(520000, 356000),
    saving: 20000,
    investing: 100000,
    limits: { reserve: 600000, dsr: '36', investingFloor: 90000 },
    check: buy(2000000, loanPay(400000, 24, '9.4')),
  }),
  // owe only: large existing unsecured balance, small minimum so dsr stays under
  scn('loan-owe-only', {
    months: flat(520000, 250000),
    debts: [unsec(5800000, 5000)],
    saving: 20000,
    investing: 50000,
    limits: { reserve: 600000, dsr: '36', investingFloor: 50000 },
    check: buy(1500000, loanPay(800000, 48, '9.4')),
  }),
  scn('loan-seed-car', {
    cash: 1800000,
    months: flat(520000, 250000),
    check: buy(1450000, loanPay(300000, 48, '9.4'), { itemType: 'vehicle' }),
  }),
  scn('loan-zero-apr', { check: buy(600000, loanPay(240000, 36, '0')) }),

  // --- card ---
  scn('card-full', { check: buy(500000, cardPay('full', '22.9')) }),
  scn('card-months-12', { check: buy(600000, cardPay('months', '22.9', 12)) }),
  scn('card-minimum-clears', {
    cash: 2000000,
    check: buy(400000, cardPay('minimum', '22.9')),
  }),
  scn('card-vehicle-under-cap', {
    check: buy(400000, cardPay('months', '22.9', 12), { itemType: 'vehicle' }),
  }),

  // --- instalment ---
  scn('instalment-24', { check: buy(1180000, { method: 'instalment', instalmentAmount: 62000, instalmentCount: 24 }) }),

  // --- household ---
  scn('household-even-2', {
    scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: 'even' },
    check: buy(1400000, loanPay(400000, 36, '9.4')),
  }),
  scn('household-weight-3-1', {
    scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: 'weight', weights: [3, 1] },
    check: buy(1900000, { method: 'cash' }),
  }),

  // --- invest ---
  scn('invest-lump', { check: { kind: 'invest', amount: 500000, payment: { method: 'lump' } } }),
  scn('invest-monthly-24', {
    check: { kind: 'invest', amount: 50000, payment: { method: 'monthly', termMonths: 24 } },
  }),

  // --- income shape (cv < .06 steady, .06-.22 variable, >= .22 volatile) ---
  scn('income-steady', {
    months: months([520000, 530000, 525000, 520000], 310000),
    check: buy(1000000, { method: 'cash' }),
  }),
  scn('income-variable', {
    limits: { reserve: 600000, dsr: '36', investingFloor: 90000 },
    months: months([480000, 560000, 420000, 540000], 310000),
    check: buy(1000000, { method: 'cash' }),
  }),
  scn('income-volatile', {
    limits: { reserve: 600000, dsr: '36', investingFloor: 90000 },
    months: months([200000, 800000, 300000, 700000], 310000),
    check: buy(1000000, { method: 'cash' }),
  }),

  // --- fees and running costs ---
  scn('running-costs-and-day-fees', {
    check: buy(1200000, loanPay(300000, 36, '9.4'), { dayFees: 45000, runningCostsNet: 5500 }),
  }),
];
