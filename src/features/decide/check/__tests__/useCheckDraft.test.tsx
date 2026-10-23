import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
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

  it('a first edit that switches Buy/Invest creates the check with the kind its inputs now carry', async () => {
    const { result } = await renderHook(() => useCheckDraft('c9', 'buy', TODAY));
    await act(async () => result.current.update({ kind: 'invest' }));
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ kind: 'invest' });
    expect(mockCreate.mock.calls[0][0].inputs.kind).toBe('invest');
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

  it('WR-C09: saveNow says whether there is a saved check, nothing, or an edit waiting for the account', async () => {
    const fresh = await renderHook(() => useCheckDraft('c9', 'buy', TODAY));
    expect(await fresh.result.current.saveNow()).toBe('nothing');
    mockRc = { ready: true, userId: 'u1', householdId: null, today: TODAY };
    const waiting = await renderHook(() => useCheckDraft('c8', 'buy', TODAY));
    await act(async () => waiting.result.current.update({ name: 'Bike' }));
    expect(await waiting.result.current.saveNow()).toBe('waiting');
    mockRc = { ready: true, userId: 'u1', householdId: 'h1', today: TODAY };
    mockChecks = { data: [row()] };
    const existing = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
    expect(await existing.result.current.saveNow()).toBe('saved');
    await act(async () => existing.result.current.update({ advertised: 3 }));
    expect(await existing.result.current.saveNow()).toBe('saved');
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

  describe('D-77 draft and save contract', () => {
    function captureAppState() {
      const handlers: ((s: string) => void)[] = [];
      const remove = jest.fn();
      jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, h: (s: string) => void) => {
        handlers.push(h);
        return { remove };
      }) as never);
      return { handlers, remove };
    }
    afterEach(() => jest.restoreAllMocks());

    it('D-77 the app going to background flushes the pending edit', async () => {
      const cap = captureAppState();
      mockChecks = { data: [row()] };
      const { result, unmount } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
      await act(async () => result.current.update({ advertised: 5 }));
      expect(mockSave).not.toHaveBeenCalled();
      expect(result.current.pendingEdit).toBe(true);
      await act(async () => cap.handlers.forEach((h) => h('background')));
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(result.current.pendingEdit).toBe(false);
      await act(async () => cap.handlers.forEach((h) => h('active')));
      await unmount();
      expect(cap.remove).toHaveBeenCalled();
    });

    it('D-77 inactive flushes too', async () => {
      const cap = captureAppState();
      mockChecks = { data: [row()] };
      const { result } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
      await act(async () => result.current.update({ advertised: 5 }));
      await act(async () => cap.handlers.forEach((h) => h('inactive')));
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    it('D-77 discard disarms the draft: no unmount save to a cleared id', async () => {
      const cap = captureAppState();
      mockChecks = { data: [row()] };
      const { result, unmount } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
      await act(async () => result.current.update({ advertised: 5 }));
      await act(async () => result.current.discard());
      expect(result.current.pendingEdit).toBe(false);
      await act(async () => {
        jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS * 2);
      });
      await act(async () => result.current.update({ advertised: 6 }));
      await act(async () => cap.handlers.forEach((h) => h('background')));
      expect(await result.current.saveNow()).toBe('nothing');
      await unmount();
      expect(mockSave).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('D-77 the 600 ms debounce coalesces edits into one save', async () => {
      mockChecks = { data: [row()] };
      const { result } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
      await act(async () => result.current.update({ advertised: 1 }));
      await act(async () => {
        jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS - 100);
      });
      await act(async () => result.current.update({ advertised: 2 }));
      await act(async () => {
        jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS - 100);
      });
      expect(mockSave).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockSave.mock.calls[0][0].inputs.advertised).toBe(2);
    });

    it('D-77 the first edit creates the check at once', async () => {
      const { result } = await renderHook(() => useCheckDraft('c9', 'buy', TODAY));
      await act(async () => result.current.update({ name: 'Bike' }));
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('D-77 the currency stamp is written once', async () => {
      const { result } = await renderHook(() => useCheckDraft('c9', 'buy', TODAY));
      await act(async () => result.current.update({ name: 'Bike' }));
      expect(mockCreate.mock.calls[0][0].inputs.currency).toBe('GBP');
      mockResult = { currency: 'USD' };
      await act(async () => result.current.update({ advertised: 3 }));
      await act(async () => result.current.saveNow());
      expect(mockSave.mock.calls.at(-1)?.[0].inputs.currency).toBe('GBP');
    });

    it('D-77 editedOffline is set when an edit is made offline', async () => {
      jest.spyOn(onlineManager, 'isOnline').mockReturnValue(false);
      mockChecks = { data: [row()] };
      const { result } = await renderHook(() => useCheckDraft('c1', 'buy', TODAY));
      expect(result.current.editedOffline).toBe(false);
      await act(async () => result.current.update({ advertised: 5 }));
      expect(result.current.editedOffline).toBe(true);
    });
  });
});
