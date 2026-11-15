// 06.2-22 (D-20, D-23): answer haptics by meaning. Every answer shown gives one light tap; a short answer, or one that crosses a
// money rule, also gives a warning; a fit never gives the Success haptic; an ask (needs_input) and a not-ready answer give
// nothing; a re-render of the same answer gives nothing. Results are real engine runs (fixtures.ts).
import { renderHook } from '@testing-library/react-native';
import type { Result } from '@/engine/decide/v3';
import type { DecideCheckRow } from '@/db/decideChecks';
import { hapticFailed, hapticLight, hapticMilestone, hapticSuccess, hapticTap, hapticTick, hapticWarn, hapticWarning } from '@/ui/haptics';
import { useAnswerEffects, type AnswerEffectWrites } from '../useAnswerEffects';
import { ledgerRun } from './fixtures';

jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/ui/haptics', () => ({
  hapticTap: jest.fn(),
  hapticWarn: jest.fn(),
  hapticMilestone: jest.fn(),
  hapticFailed: jest.fn(),
  hapticTick: jest.fn(),
  hapticLight: jest.fn(),
  hapticWarning: jest.fn(),
  hapticSuccess: jest.fn(),
}));

const ROW = { id: 'c1' } as unknown as DecideCheckRow;
const base = ledgerRun('N02').evaluation.result;
const as = (over: Partial<Result>): Result => ({ ...base, facts: [...base.facts], ...over }) as Result;
const fits = as({ code: 'fits_month', variant: null } as Partial<Result>);
const crossed = (r: Result): Result => ({ ...r, facts: [{ code: 'line_crossed', values: { lineId: 'l1', unit: 'money', value: 50000, limit: 40000 } }, ...r.facts] }) as Result;

function writes(): AnswerEffectWrites {
  return { markSeen: jest.fn(() => true), recordHistory: jest.fn(() => true), saveAnswer: jest.fn(() => true) };
}

async function show(result: Result | null) {
  const w = writes();
  return renderHook(({ r }: { r: Result | null }) => useAnswerEffects({ row: ROW, result: r, writes: w, inputsKey: 'k1' }), { initialProps: { r: result } });
}

function expectNoOtherHaptics(): void {
  expect(hapticMilestone).not.toHaveBeenCalled();
  expect(hapticSuccess).not.toHaveBeenCalled();
  expect(hapticFailed).not.toHaveBeenCalled();
  expect(hapticTick).not.toHaveBeenCalled();
  expect(hapticLight).not.toHaveBeenCalled();
  expect(hapticWarning).not.toHaveBeenCalled();
}

beforeEach(() => jest.clearAllMocks());

describe('answer haptics (06.2-22, D-20, D-23)', () => {
  it('a fit gives one light tap and nothing else: never Success, never a warning', async () => {
    await show(fits);
    expect(hapticTap).toHaveBeenCalledTimes(1);
    expect(hapticWarn).not.toHaveBeenCalled();
    expectNoOtherHaptics();
  });

  it('a tight answer gives one light tap and no warning', async () => {
    expect(base.code).toBe('fits_month');
    expect(base.variant).toBe('small_net');
    await show(base);
    expect(hapticTap).toHaveBeenCalledTimes(1);
    expect(hapticWarn).not.toHaveBeenCalled();
  });

  it('a short answer gives one light tap and one warning', async () => {
    const short = ledgerRun('N09').evaluation.result;
    expect(short.code).toBe('monthly_short');
    await show(short);
    expect(hapticTap).toHaveBeenCalledTimes(1);
    expect(hapticWarn).toHaveBeenCalledTimes(1);
    expectNoOtherHaptics();
  });

  it('a month already short (D-63) reads as short and warns', async () => {
    await show(as({ code: 'fits_month', variant: 'month_already_short' } as Partial<Result>));
    expect(hapticTap).toHaveBeenCalledTimes(1);
    expect(hapticWarn).toHaveBeenCalledTimes(1);
  });

  it('a fit that crosses a money rule warns once', async () => {
    await show(crossed(fits));
    expect(hapticTap).toHaveBeenCalledTimes(1);
    expect(hapticWarn).toHaveBeenCalledTimes(1);
    expect(hapticMilestone).not.toHaveBeenCalled();
  });

  it('a short answer that also crosses a rule still warns only once', async () => {
    await show(crossed(ledgerRun('N09').evaluation.result));
    expect(hapticTap).toHaveBeenCalledTimes(1);
    expect(hapticWarn).toHaveBeenCalledTimes(1);
  });

  it('re-renders of the same answer give nothing more', async () => {
    const { rerender } = await show(fits);
    for (let i = 0; i < 4; i += 1) await rerender({ r: as({ code: 'fits_month', variant: null } as Partial<Result>) });
    expect(hapticTap).toHaveBeenCalledTimes(1);
  });

  it('a changed answer gives one more tap', async () => {
    const { rerender } = await show(fits);
    await rerender({ r: ledgerRun('N09').evaluation.result });
    await rerender({ r: ledgerRun('N09').evaluation.result });
    expect(hapticTap).toHaveBeenCalledTimes(2);
    expect(hapticWarn).toHaveBeenCalledTimes(1);
  });

  it('an ask (needs_input) is a question, not an answer: no tap, no warning', async () => {
    await show(crossed(as({ code: 'needs_input', variant: null } as Partial<Result>)));
    expect(hapticTap).not.toHaveBeenCalled();
    expect(hapticWarn).not.toHaveBeenCalled();
    expectNoOtherHaptics();
  });

  it('a not-ready answer and a loading answer give nothing', async () => {
    await show(as({ readiness: { ...(base.readiness ?? {}), ready: false } } as Partial<Result>));
    await show(null);
    expect(hapticTap).not.toHaveBeenCalled();
    expect(hapticWarn).not.toHaveBeenCalled();
    expectNoOtherHaptics();
  });
});
