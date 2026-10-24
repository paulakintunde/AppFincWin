/**
 * Literal fixtures for the copy tests (05-09). Same-wave rule: nothing here calls computeCheck / computeQuick or imports the
 * snapshot fixtures; the objects are written out and typed against the engine barrel. Only the fields the copy layer reads are
 * populated on the nested context, so the Assessment is cast once, here.
 */
import { percent, ZERO_PERCENT } from '@/engine/decide';
import type { Assessment, BuyCheck, FirstRead, Plan, Warning } from '@/engine/decide';
import type { Fmt } from '../../types';

export const fmt: Fmt = (n) => `$${n}`;
export const fmtCents: Fmt = (n) => `$${(n / 100).toFixed(2)}`;
export const fmtDate = (d: string): string => `on ${d}`;

export const BASE_PLAN = {
  price: 1_000_000,
  dayOne: 0,
  monthly: 85_000,
  months: 12,
  financed: 1_000_000,
  total: 1_020_000,
  interest: 20_000,
  dayFees: 0,
  card: null,
  finalMonthly: 85_000,
  impliedAnnualRate: null,
  paymentSteps: [],
  promo: null,
  lateFees: null,
} as unknown as Plan;

const BASE = {
  state: 'fits',
  basisMarker: 'logged_months',
  warnings: [],
  facts: [],
  size: 'from_savings',
  plan: BASE_PLAN,
  mineDayOne: 0,
  mineMonthly: 85_000,
  mineRunning: 0,
  newMonthly: 85_000,
  left: 40_000,
  cashAfter: 500_000,
  debtServiceAfter: 85_000,
  unsecuredAfter: 1_000_000,
  debtServiceRatioBefore: percent('10'),
  debtServiceRatioAfter: percent('22.99'),
  housingAfter: 120_000,
  housingRatioAfter: percent('30'),
  investingAtRisk: 0,
  investingAfter: 20_000,
  savingAtRisk: 0,
  savingAfter: 30_000,
  pauseNeeded: 0,
  monthTable: {
    now: { income: 400_000, living: 200_000, debtPayments: 0, savingInvesting: 50_000, thisPurchase: 0, outgoings: 250_000, left: 150_000 },
    after: { income: 400_000, living: 200_000, debtPayments: 0, savingInvesting: 50_000, thisPurchase: 85_000, outgoings: 335_000, left: 65_000 },
  },
  cashPath: { status: 'unavailable', code: 'cash_path_unavailable' },
  cashDip: null,
  context: {
    leftBefore: 150_000,
    annualIncome: 4_800_000,
    money: { basis: 'average', incomeBasis: 400_000 },
    limits: {
      reserve: 100_000,
      dsrLine: percent('36'),
      housingLine: percent('28'),
      investingFloor: 10_000,
      savingFloor: 10_000,
      unsecuredIncomeMultiple: 12,
    },
  },
} as unknown as Assessment;

// overrides are loose (plain numbers for the branded MinorUnits) because the fixture is a literal
export const assessmentOf = (over: { [K in keyof Assessment]?: unknown }): Assessment => ({ ...BASE, ...over }) as Assessment;

export const w = (code: Warning['code'], shortfall: number): Warning => ({ code, shortfall }) as Warning;

export const withContext = (over: Record<string, unknown>): { context: unknown } => ({
  context: { ...BASE.context, ...over },
});

export const loanCheck = (apr: ReturnType<typeof percent>, termMonths: number | null): BuyCheck =>
  ({
    kind: 'buy',
    currency: 'USD',
    price: 1_000_000,
    dayFees: 0,
    itemType: 'general',
    runningCostsNet: 0,
    payment: { method: 'loan', deposit: 0, termMonths, apr },
  }) as unknown as BuyCheck;

export const cashCheck: BuyCheck = { ...loanCheck(ZERO_PERCENT, null), payment: { method: 'cash' } };

export const FIRST_READ = {
  state: 'fits',
  basisMarker: 'first_read_rough_figures',
  size: 'from_savings',
  plan: BASE_PLAN,
  dayOne: 0,
  monthly: 85_000,
  cashAfter: 500_000,
  leftAfter: 40_000,
  roughCushion: 100_000,
  cashCovers: true,
  monthCloses: true,
  aboveCushion: true,
  warnings: [],
  confidence: { level: 'rough', reasons: ['first_read'] },
} as unknown as Extract<FirstRead, { state: 'fits' | 'adjust' | 'no' }>;
