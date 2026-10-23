import { act, renderHook } from '@testing-library/react-native';
import { EMPTY_STACK, type StackSelection } from '../../snapshot/types';
import { loggedSource, noneSource, roughSource, unconvertedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { MAX_INPUT_MINOR } from '../../snapshot/checkInputs';
import * as computeModule from '../../snapshot/computeCheck';
import { useQuickCheck } from '../useQuickCheck';

jest.setTimeout(30000);

const mockTrack = jest.fn();
let mockStack: StackSelection = EMPTY_STACK;
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/data/queries/decide', () => ({ useOtherChecks: () => mockStack }));

const logged = loggedSource();
const STATES = ['fits', 'adjust', 'no', 'missing'];

beforeEach(() => {
  mockTrack.mockClear();
  mockStack = EMPTY_STACK;
});

describe('useQuickCheck', () => {
  it('starts on the defaults with an incomplete computation', async () => {
    const { result } = await renderHook(() => useQuickCheck(logged, 'home'));
    expect(result.current.state.inputs).toEqual({ name: '', price: null, mode: 'cash', aprText: '0', termMonths: 12, taxText: '', fees: null });
    expect(result.current.state.computation).toEqual({ kind: 'incomplete' });
    expect(result.current.state.submitted).toBe(false);
  });

  it('submit parses the name and price, fires quick_check_run once with the state only', async () => {
    const { result } = await renderHook(() => useQuickCheck(logged, 'home'));
    let r: { ok: boolean } = { ok: false };
    await act(async () => {
      r = result.current.submit('car 14500');
    });
    expect(r.ok).toBe(true);
    expect(result.current.state.inputs.name).toBe('Car');
    expect(result.current.state.inputs.price).toBe(1_450_000);
    expect(mockTrack).toHaveBeenCalledTimes(1);
    const [event, props] = mockTrack.mock.calls[0] as [string, { state: string }];
    expect(event).toBe('quick_check_run');
    expect(Object.keys(props)).toEqual(['state']);
    expect(STATES).toContain(props.state);
    expect(JSON.stringify(mockTrack.mock.calls)).not.toMatch(/Car|1450000/);
  });

  it('unparseable text returns not ok and fires nothing', async () => {
    const { result } = await renderHook(() => useQuickCheck(logged, 'home'));
    let r: { ok: boolean } = { ok: true };
    await act(async () => {
      r = result.current.submit('car');
    });
    expect(r.ok).toBe(false);
    expect(mockTrack).not.toHaveBeenCalled();
    expect(result.current.state.submitted).toBe(false);
  });

  it('submitFields sets the fields directly and does not fire on the first-read surface', async () => {
    const { result } = await renderHook(() => useQuickCheck(roughSource(), 'firstRead'));
    let ok = false;
    await act(async () => {
      ok = result.current.submitFields('Laptop', 150_000).ok;
    });
    expect(ok).toBe(true);
    expect(result.current.state.inputs).toMatchObject({ name: 'Laptop', price: 150_000 });
    expect(result.current.state.computation.kind).toBe('first_read');
    expect(mockTrack).not.toHaveBeenCalled();
    await act(async () => {
      ok = result.current.submitFields('Laptop', null).ok;
    });
    expect(ok).toBe(false);
  });

  it('every edit after a submit recomputes without firing analytics again', async () => {
    const { result } = await renderHook(() => useQuickCheck(logged, 'home'));
    await act(async () => {
      result.current.submit('car 14500');
    });
    await act(async () => {
      result.current.setMode('credit');
      result.current.setApr('9');
      result.current.setTerm(36);
      result.current.setTax('5');
      result.current.setFees(20_000);
    });
    expect(result.current.state.inputs).toMatchObject({ mode: 'credit', aprText: '9', termMonths: 36, taxText: '5', fees: 20_000 });
    expect(result.current.state.computation.kind).toBe('logged');
    expect(mockTrack).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.current.setText('car 9000');
    });
    expect(result.current.state.inputs.price).toBe(900_000);
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('tryCredit flips to Credit at 0% and 12 months, keeping the amount, tax and fees', async () => {
    const { result } = await renderHook(() => useQuickCheck(logged, 'home'));
    await act(async () => {
      result.current.submit('car 14500');
    });
    await act(async () => {
      result.current.setTax('7');
      result.current.setFees(5_000);
      result.current.setTerm(48);
      result.current.setApr('9');
    });
    await act(async () => {
      result.current.tryCredit();
    });
    expect(result.current.state.inputs).toMatchObject({ mode: 'credit', aprText: '0', termMonths: 12, price: 1_450_000, taxText: '7', fees: 5_000 });
  });

  it('clear resets to the defaults and hides the result', async () => {
    const { result } = await renderHook(() => useQuickCheck(logged, 'home'));
    await act(async () => {
      result.current.submit('car 14500');
    });
    await act(async () => {
      result.current.clear();
    });
    expect(result.current.state.submitted).toBe(false);
    expect(result.current.state.inputs.price).toBeNull();
    expect(result.current.state.computation.kind).toBe('incomplete');
  });

  it('toCheckInputs carries every field (D-23)', async () => {
    const { result } = await renderHook(() => useQuickCheck(logged, 'home'));
    await act(async () => {
      result.current.submit('car 14500');
    });
    await act(async () => {
      result.current.setMode('credit');
    });
    const ci = result.current.toCheckInputs('2026-10-15');
    expect(ci).toMatchObject({ name: 'Car', advertised: 1_450_000, method: 'loan' });
    expect(ci.loan.aprText).toBe('0');
  });

  it('a none source: home gives kind none and fires missing; first read gives cash_only and fires nothing', async () => {
    const home = await renderHook(() => useQuickCheck(noneSource(), 'home'));
    await act(async () => {
      home.result.current.submit('car 14500');
    });
    expect(home.result.current.state.computation.kind).toBe('none');
    expect(mockTrack).toHaveBeenCalledWith('quick_check_run', { state: 'missing' });
    mockTrack.mockClear();
    const first = await renderHook(() => useQuickCheck(noneSource(), 'firstRead'));
    await act(async () => {
      first.result.current.submitFields('Car', 1_450_000);
    });
    expect(first.result.current.state.computation.kind).toBe('cash_only');
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('a missing rate computes unconverted and fires the missing state', async () => {
    const { result } = await renderHook(() => useQuickCheck(unconvertedSource(), 'home'));
    await act(async () => {
      result.current.submit('car 14500');
    });
    expect(result.current.state.computation.kind).toBe('unconverted');
    expect(mockTrack).toHaveBeenCalledWith('quick_check_run', { state: 'missing' });
  });

  it('a null source stays incomplete', async () => {
    const { result } = await renderHook(() => useQuickCheck(null, 'home'));
    await act(async () => {
      result.current.submit('car 14500');
    });
    expect(result.current.state.computation.kind).toBe('incomplete');
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('an over-long price, even edited after submit, never reaches the engine', async () => {
    const spy = jest.spyOn(computeModule, 'computeQuick');
    const { result } = await renderHook(() => useQuickCheck(logged, 'home'));
    let r: { ok: boolean } = { ok: true };
    await act(async () => {
      r = result.current.submit(`car ${'9'.repeat(16)}`);
    });
    expect(r.ok).toBe(false);
    await act(async () => {
      result.current.submit('car 14500');
    });
    spy.mockClear();
    await act(async () => {
      result.current.setText(`car ${'9'.repeat(16)}`);
    });
    expect(result.current.state.computation.kind).toBe('incomplete');
    await act(async () => {
      result.current.setFees(MAX_INPUT_MINOR + 1);
    });
    expect(result.current.state.inputs.fees).toBeNull();
    for (const call of spy.mock.calls) {
      const q = call[1];
      expect(q.price === null || q.price <= MAX_INPUT_MINOR).toBe(true);
    }
    await act(async () => {
      result.current.clear();
    });
    let ok = true;
    await act(async () => {
      ok = result.current.submitFields('x', MAX_INPUT_MINOR + 1).ok;
    });
    expect(ok).toBe(false);
    expect(result.current.state.inputs.price).toBeNull();
    spy.mockRestore();
  });

  it('combines every open check by default and the pill state is session only', async () => {
    mockStack = { otherChecks: [], openCount: 2, leftOutIncomplete: 0, leftOutCurrency: 0 };
    const { result } = await renderHook(() => useQuickCheck(logged, 'home'));
    expect(result.current.combine).toBe(true);
    expect(result.current.stack.openCount).toBe(2);
    await act(async () => {
      result.current.setCombine(false);
    });
    expect(result.current.combine).toBe(false);
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('D-71 the quick duration accepts 1 to 120 months', async () => {
    const { result } = await renderHook(() => useQuickCheck(logged, 'home'));
    for (const n of [1, 90, 120]) {
      await act(async () => {
        result.current.setTerm(n);
      });
      expect(result.current.state.inputs.termMonths).toBe(n);
    }
    await act(async () => {
      result.current.setTerm(36);
    });
    for (const bad of [0, 121, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await act(async () => {
        result.current.setTerm(bad);
      });
      expect(result.current.state.inputs.termMonths).toBe(36);
    }
  });

  it('D-71 a custom duration carries to the full check', async () => {
    const { result } = await renderHook(() => useQuickCheck(logged, 'home'));
    await act(async () => {
      result.current.submit('car 14500');
    });
    await act(async () => {
      result.current.setMode('credit');
      result.current.setTerm(90);
    });
    expect(result.current.toCheckInputs('2026-10-15').loan.termMonths).toBe(90);
  });
});
