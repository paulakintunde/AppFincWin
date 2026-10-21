import { act, renderHook } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import { DRAFT_DEBOUNCE_MS, useCheckDraft } from '../useCheckDraft';

const mockCreate = jest.fn();
const mockSave = jest.fn();
const mockTrack = jest.fn();
let mockChecks: { data: DecideCheckRow[] | undefined } = { data: [] };
let mockResult: { currency: string } | null = { currency: 'GBP' };

let mockRc: { ready: boolean; userId: string | null; householdId: string | null; today: string } = {
  ready: true,
  userId: 'u1',
  householdId: 'h1',
  today: '2026-10-17',
};
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => mockRc,
}));
jest.mock('@/data/queries/decide', () => ({
  useDecideChecks: () => mockChecks,
  useDecideSnapshot: () => ({ result: mockResult }),
}));
jest.mock('@/data/mutations/decideChecks', () => ({
  useCreateCheck: () => ({ create: (...a: unknown[]) => mockCreate(...a) }),
  useSaveCheckDraft: () => ({ save: (...a: unknown[]) => mockSave(...a) }),
}));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));

const TODAY = '2026-10-17';

function row(over: Partial<DecideCheckRow> = {}): DecideCheckRow {
  return {
    id: 'c1',
    household_id: 'h1',
    created_by: 'u1',
    kind: 'buy',
    name: 'Sofa',
    inputs: { ...emptyCheckInputs('buy', TODAY), name: 'Sofa', currency: 'GBP', advertised: 90000 },
    status: 'open',
    furthest_step: 2,
    version: 3,
    ...over,
  } as unknown as DecideCheckRow;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockChecks = { data: [] };
  mockResult = { currency: 'GBP' };
  mockRc = { ready: true, userId: 'u1', householdId: 'h1', today: '2026-10-17' };
});
afterEach(() => {
  jest.useRealTimers();
});

describe('useCheckDraft', () => {
  it('loads an open row with its parsed inputs', async () => {
    mockChecks = { data: [row()] };
    const { result } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    expect(result.current.status).toBe('ready');
    expect(result.current.isNew).toBe(false);
    expect(result.current.inputs.name).toBe('Sofa');
    expect(result.current.inputs.advertised).toBe(90000);
  });

  it('is loading until the checks query has data', async () => {
    mockChecks = { data: undefined };
    const { result } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    expect(result.current.status).toBe('loading');
  });

  it('creates nothing on open and is new', async () => {
    const { result } = await renderHook(() => useCheckDraft('c9', 'buy', TODAY));
    expect(result.current.status).toBe('ready');
    expect(result.current.isNew).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('creates on the first edit and fires check_started once across several edits', async () => {
    const { result } = await renderHook(() => useCheckDraft('c9', 'buy', TODAY));
    await act(async () => result.current.update({ name: 'Bike' }));
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      userId: 'u1',
      id: 'c9',
      householdId: 'h1',
      kind: 'buy',
      name: 'Bike',
      furthestStep: 1,
    });
    await act(async () => result.current.update({ advertised: 1000 }));
    await act(async () => result.current.update({ advertised: 2000 }));
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('check_started', {});
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('a first edit made before the household is known is created once it arrives', async () => {
    mockRc = { ready: true, userId: 'u1', householdId: null, today: TODAY };
    const hook = await renderHook(() => useCheckDraft('c9', 'buy', TODAY));
    await act(async () => hook.result.current.update({ name: 'Bike' }));
    expect(mockCreate).not.toHaveBeenCalled();
    mockRc = { ready: true, userId: 'u1', householdId: 'h1', today: TODAY };
    await hook.rerender({});
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ id: 'c9', householdId: 'h1', name: 'Bike' });
    await hook.rerender({});
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('a new check records its currency', async () => {
    const { result } = await renderHook(() => useCheckDraft('c9', 'buy', TODAY));
    await act(async () => result.current.update({ name: 'Bike' }));
    expect(mockCreate.mock.calls[0][0].inputs.currency).toBe('GBP');
  });

  it('never changes a recorded currency', async () => {
    mockChecks = { data: [row()] };
    mockResult = { currency: 'USD' };
    const { result } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    await act(async () => result.current.update({ advertised: 1 }));
    await act(async () => {
      jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });
    expect(mockSave.mock.calls[0][0].inputs.currency).toBe('GBP');
  });

  it('IN-A01: an unstamped sample check is stamped USD, not the home currency', async () => {
    mockChecks = { data: [row({ is_sample: true, inputs: { ...emptyCheckInputs('buy', TODAY), name: 'Sofa' } as never })] };
    const { result } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    await act(async () => result.current.update({ advertised: 5 }));
    await act(async () => {
      jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });
    expect(mockSave.mock.calls[0][0].inputs.currency).toBe('USD');
  });

  it('CR-C06: the first stamp is kept for the session even if the home currency changes', async () => {
    const { result, rerender } = await renderHook(() => useCheckDraft('c9', 'buy', TODAY));
    await act(async () => result.current.update({ name: 'Bike' }));
    expect(mockCreate.mock.calls[0][0].inputs.currency).toBe('GBP');
    expect(result.current.inputs.currency).toBe('GBP');
    mockResult = { currency: 'CAD' };
    mockChecks = { data: [row({ id: 'c9', inputs: mockCreate.mock.calls[0][0].inputs })] };
    await rerender({});
    await act(async () => result.current.update({ advertised: 7 }));
    await act(async () => {
      jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });
    expect(mockSave.mock.calls.at(-1)?.[0].inputs.currency).toBe('GBP');
  });

  it('stamps the currency on an old draft that has none', async () => {
    mockChecks = { data: [row({ inputs: { ...emptyCheckInputs('buy', TODAY), name: 'Sofa' } as never })] };
    const { result } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    await act(async () => result.current.update({ advertised: 5 }));
    await act(async () => {
      jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });
    expect(mockSave.mock.calls[0][0].inputs.currency).toBe('GBP');
  });

  it('debounces edits of an existing row into one save and raises furthest_step', async () => {
    mockChecks = { data: [row()] };
    const { result } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    await act(async () => result.current.update({ advertised: 1 }));
    await act(async () => result.current.update({ advertised: 2 }, { step: 4 }));
    expect(mockSave).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0]).toMatchObject({ id: 'c1', name: 'Sofa', furthestStep: 4 });
    expect(mockSave.mock.calls[0][0].inputs.advertised).toBe(2);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('never lowers furthest_step', async () => {
    mockChecks = { data: [row({ furthest_step: 3 })] };
    const { result } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    await act(async () => result.current.update({ advertised: 1 }, { step: 1 }));
    await act(async () => result.current.saveNow());
    expect(mockSave.mock.calls[0][0].furthestStep).toBe(3);
  });

  it('saveNow flushes immediately', async () => {
    mockChecks = { data: [row()] };
    const { result } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    await act(async () => result.current.update({ advertised: 7 }));
    await act(async () => result.current.saveNow());
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('flushes a pending save on unmount', async () => {
    mockChecks = { data: [row()] };
    const { result, unmount } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    await act(async () => result.current.update({ advertised: 9 }));
    expect(mockSave).not.toHaveBeenCalled();
    await unmount();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0].inputs.advertised).toBe(9);
  });

  it('a decided check is read-only', async () => {
    mockChecks = { data: [row({ status: 'bought' })] };
    const { result } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    await act(async () => result.current.update({ advertised: 1 }));
    await act(async () => {
      jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS * 2);
    });
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.current.inputs.advertised).toBe(90000);
  });

  it('CR-C01: an update kept from an earlier render (a toast Undo) keeps every later edit', async () => {
    mockChecks = { data: [row()] };
    const { result } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    await act(async () => result.current.update({ name: 'Sofa bed' }));
    const heldByToast = result.current.update;
    await act(async () => {
      jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });
    await act(async () => result.current.update({ advertised: 123_00 }));
    await act(async () => {
      jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });
    await act(async () => heldByToast({ adjustments: [] }));
    expect(result.current.inputs.advertised).toBe(123_00);
    expect(result.current.inputs.name).toBe('Sofa bed');
    await act(async () => {
      jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });
    expect(mockSave.mock.calls.at(-1)?.[0].inputs.advertised).toBe(123_00);
  });

  it('CR-C01: an update kept from before the check was decided changes nothing', async () => {
    mockChecks = { data: [row()] };
    const { result, rerender } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    const heldByToast = result.current.update;
    mockChecks = { data: [row({ status: 'passed' })] };
    await rerender({});
    await act(async () => heldByToast({ advertised: 5 }));
    await act(async () => {
      jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS * 2);
    });
    expect(result.current.inputs.advertised).toBe(90000);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('a row that disappears resolves to not_found', async () => {
    mockChecks = { data: [row()] };
    const { result, rerender } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    expect(result.current.status).toBe('ready');
    mockChecks = { data: [] };
    await rerender({});
    expect(result.current.status).toBe('not_found');
  });
});
