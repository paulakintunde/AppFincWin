// 06.1-78 (deferred from 06.1-53): the stepper's draft save moves furthest_step forward to the furthest step visited, and never back.
import { act, renderHook } from '@testing-library/react-native';
import { parseCheckV2, toStoredV2, type CheckV2 } from '@/engine/decide/v3';
import { furthestStepOf, KEY_VISITED, useStepCheck } from '../useStepCheck';

const ID = '22222222-2222-4222-8222-222222222222';
let mockRow: { id: string; name: string; inputs: unknown; furthest_step: number } | null = null;
const mockSave = jest.fn();

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', region: 'US', today: '2026-11-13' }),
}));
jest.mock('@/data/queries/decide', () => ({
  useDecideChecks: () => ({ data: mockRow === null ? [] : [mockRow], isLoading: false }),
  useDebts: () => ({ data: [] }),
}));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ status: 'ready', inputs: null }) }));
jest.mock('@/data/mutations/decideChecks', () => ({ useSaveCheckDraft: () => ({ save: mockSave }) }));

const base = (visited?: unknown): CheckV2 => {
  const c = parseCheckV2({ v: 2 }) as CheckV2;
  return visited === undefined ? c : { ...c, layerAnswers: { ...c.layerAnswers, [KEY_VISITED]: visited } };
};

beforeEach(() => {
  mockSave.mockClear();
  mockRow = { id: ID, name: 'Used car', inputs: toStoredV2(base()), furthest_step: 1 };
});

describe('furthestStepOf', () => {
  it('takes the larger of the stored step and the steps visited', () => {
    expect(furthestStepOf(1, base([2]))).toBe(2);
    expect(furthestStepOf(1, base([2, 3]))).toBe(3);
    expect(furthestStepOf(3, base([2]))).toBe(3);
  });

  it('keeps the stored step when nothing usable was visited, and stays within 1 to 3', () => {
    expect(furthestStepOf(1, base())).toBe(1);
    expect(furthestStepOf(2, base('2'))).toBe(2);
    expect(furthestStepOf(1, base(['3', null, Number.NaN]))).toBe(1);
    expect(furthestStepOf(0, base())).toBe(1);
    expect(furthestStepOf(7, base())).toBe(3);
  });
});

describe('useStepCheck draft save', () => {
  it('writes the furthest step reached, not the stored one (it used to stay at 1)', async () => {
    const { result } = await renderHook(() => useStepCheck(ID));
    await act(() => result.current.markVisited(2));
    await act(() => result.current.flush());
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0]![0]).toMatchObject({ id: ID, furthestStep: 2 });
  });

  it('never moves the step back when an earlier step is saved', async () => {
    mockRow = { id: ID, name: 'Used car', inputs: toStoredV2(base([2, 3])), furthest_step: 3 };
    const { result } = await renderHook(() => useStepCheck(ID));
    await act(() => result.current.update((c) => ({ ...c, taxIncluded: true })));
    await act(() => result.current.flush());
    expect(mockSave.mock.calls[0]![0]).toMatchObject({ furthestStep: 3 });
  });
});
