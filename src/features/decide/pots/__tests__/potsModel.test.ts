import type { SavingsGoalRow } from '@/db/savingsGoals';
import { buildPotRow, buildPotsModel, checkPotMonth, lastDayOfMonth, lineThreeKey, maxPotMonth } from '../potsModel';
import { goal } from '../../past/__tests__/helpers/pastFixtures';

const TODAY = '2026-10-15';

function pot(id: string, over: Partial<SavingsGoalRow> = {}): SavingsGoalRow {
  return goal('', { id, check_id: null, kind: 'pot', name: `Pot ${id}`, target: 60_000, monthly_amount: null, ready_by: '2027-03-31', ...over });
}
const amounts = (row: SavingsGoalRow, saved = row.opening_saved) => ({ saved, target: row.target });

describe('lastDayOfMonth', () => {
  it('D-101 gives the last day, including leap February', () => {
    expect(lastDayOfMonth('2027-02')).toBe('2027-02-28');
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31');
    expect(lastDayOfMonth('2027-04')).toBe('2027-04-30');
  });
});

describe('checkPotMonth', () => {
  it('D-101 allows this month to 50 years out and refuses the rest', () => {
    expect(checkPotMonth('2026-10', TODAY)).toBe('ok');
    expect(checkPotMonth('2026-09', TODAY)).toBe('past');
    expect(checkPotMonth(maxPotMonth(TODAY), TODAY)).toBe('ok');
    expect(maxPotMonth(TODAY)).toBe('2076-10');
    expect(checkPotMonth('2076-11', TODAY)).toBe('far');
  });
  it('D-101 keeps a pot own earlier month valid when unchanged', () => {
    expect(checkPotMonth('2026-08', TODAY, '2026-08')).toBe('ok');
  });
});

describe('buildPotRow', () => {
  it('D-101 an active pot spreads what remains over the whole months left, rounded up', () => {
    const row = pot('a');
    const m = buildPotRow(row, amounts(row), TODAY);
    expect(m.state).toBe('active');
    expect(m.monthly).toBe(12_000); // 5 whole months
    expect(m.pct).toBe(0);
    expect(m.month).toBe('2027-03');
    expect(lineThreeKey(m)).toBe('decide.pots.stateActive');
  });
  it('D-101 a reached pot sets aside nothing', () => {
    const row = pot('a', { opening_saved: 60_000 });
    const m = buildPotRow(row, amounts(row), TODAY);
    expect(m.state).toBe('reached');
    expect(m.monthly).toBe(0);
    expect(m.pct).toBe(100);
    expect(lineThreeKey(m)).toBe('decide.pots.stateReached');
  });
  it('D-101 a past-due pot reports what is still to save', () => {
    const row = pot('a', { ready_by: '2026-09-30', opening_saved: 10_000 });
    const m = buildPotRow(row, amounts(row), TODAY);
    expect(m.state).toBe('past_due');
    expect(m.monthly).toBe(0);
    expect(m.remaining).toBe(50_000);
    expect(m.pct).toBe(16);
  });
  it('D-101 a pot with no usable rate waits for one', () => {
    const row = pot('a', { currency: 'EUR' });
    const m = buildPotRow(row, { saved: null, target: null }, TODAY);
    expect(m.state).toBe('no_rate');
    expect(m.monthly).toBe(0);
    expect(lineThreeKey(m)).toBe('decide.pots.stateNoRate');
  });
  it('D-101 a Wait pot reads From a check, bare without an amount or date', () => {
    const wait = goal('c1');
    const m = buildPotRow(wait, amounts(wait), TODAY);
    expect(m.kind).toBe('wait');
    expect(m.monthly).toBe(20_000);
    expect(lineThreeKey(m)).toBe('decide.pots.stateWait');
    const bare = goal('c1', { monthly_amount: null, ready_by: null });
    expect(lineThreeKey(buildPotRow(bare, amounts(bare), TODAY))).toBe('decide.pots.stateWaitBare');
  });
  it('D-101 a done pot is dimmed state and sets aside nothing', () => {
    const row = pot('a', { done_at: '2026-10-01T00:00:00Z' });
    const m = buildPotRow(row, amounts(row), TODAY);
    expect(m.state).toBe('done');
    expect(m.monthly).toBe(0);
    expect(lineThreeKey(m)).toBe('decide.pots.doneLine');
  });
});

describe('buildPotsModel', () => {
  it('D-101 totals the monthly set-aside, counts live pots and splits done', () => {
    const a = pot('a');
    const b = pot('b', { target: 30_000 });
    const d = pot('d', { done_at: '2026-10-01T00:00:00Z' });
    const model = buildPotsModel([a, b], [d], (r) => amounts(r), TODAY);
    expect(model.summary).toEqual({ total: 12_000 + 6_000, count: 2 });
    expect(model.live).toHaveLength(2);
    expect(model.done).toHaveLength(1);
    expect(model.addDisabled).toBe(false);
  });
  it('D-101 the add limit is 50 pots the user creates, Wait pots not counted', () => {
    const plain = Array.from({ length: 50 }, (_, i) => pot(`p${i}`));
    expect(buildPotsModel(plain, [], (r) => amounts(r), TODAY).addDisabled).toBe(true);
    expect(buildPotsModel(plain.slice(0, 49), [], (r) => amounts(r), TODAY).addDisabled).toBe(false);
    expect(buildPotsModel([...plain.slice(0, 49), goal('c')], [], (r) => amounts(r), TODAY).addDisabled).toBe(false);
  });
});
