// Defensive path: needsInput and oneOffPart agree today (both ask for unspent exactly when day one is above this
// month's room), so judge's own fallback key can only be reached if they ever drift apart. Pin that it still
// answers needs_input with the unspent key rather than a bare code with nothing missing.
import { minorUnits, type MinorUnits } from '../../../../money/types';
import { SOLE_SHARE } from '../../../share';
import { inputsOf } from '../../__tests__/helpers/fixtures';
import type { Funds, MonthModel, Purchase } from '../../types';
import { judge, oneOffPart, type JudgeInput } from '../judge';

jest.mock('../needsInput', () => ({ needsInput: () => [] }));

const mu = (n: number): MinorUnits => minorUnits(n);

const month = {
  month: '2026-10', day: 3, daysInMonth: 31, monthLeft: mu(10_000), typicalLeft: mu(10_000), typicalIncome: mu(500_000),
  confidence: { level: 'firm', reasons: [] }, notices: [], reasons: [], categoryMonthly: [], housingMonthly: mu(0),
} as unknown as MonthModel;
const funds = { unspent: null, suggested: mu(0), ownEnvelope: mu(0), emergency: mu(0) } as unknown as Funds;
const purchase = {
  whole: mu(120_000), dayOne: mu(120_000), monthly: mu(0), runningMonthly: mu(0), schedule: null, share: SOLE_SHARE,
  itemType: 'general', purpose: null, emergency: false, canUseEmergency: false, band: 4, layers: ['L0'], financed: false,
  secured: false, categoryId: null, envelopeId: null,
} as unknown as Purchase;

const input: JudgeInput = {
  inputs: inputsOf({}), month, funds, purchase, purchaseMissing: [], purchaseFacts: [], purchaseReasons: [],
  cash: { kind: 'ok', lowest: { date: '2026-10-03', balance: mu(1_000_000) } },
};

describe('judge defensive fallback', () => {
  it('oneOffPart without a confirmed unspent figure above this month asks for input', () => {
    expect(oneOffPart(input, { unspent: null, envelope: mu(0) }).code).toBe('needs_input');
  });

  it('judge names unspent_not_confirmed when nothing else is missing', () => {
    const r = judge(input);
    expect(r.code).toBe('needs_input');
    expect(r.missing).toEqual(['unspent_not_confirmed']);
  });
});
