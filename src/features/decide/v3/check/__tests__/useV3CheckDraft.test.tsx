/** Plan 05.3-24: the Check screen's draft: create once on the first edit, debounce later saves, flush on leaving, answer only on commit. */
import { act, renderHook } from '@testing-library/react-native';
import { toStoredV2 } from '@/engine/decide/v3';
import { emptyCheck, withPrice } from '../../model/checkEdits';
import { saveStatusOf, useV3CheckDraft, V3_DRAFT_DEBOUNCE_MS } from '../useV3CheckDraft';

jest.setTimeout(60000);

const ID = '11111111-1111-4111-8111-111111111111';
const mockCreate = jest.fn();
const mockSaveDraft = jest.fn();
const mockSaveAnswer = jest.fn();
const mockTrack = jest.fn();
let mockRows: unknown[] | undefined = [];
let mockCtx: { userId: string | null; householdId: string | null } = { userId: 'u1', householdId: 'h1' };

jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => mockCtx }));
jest.mock('@/data/queries/decide', () => ({ useDecideChecks: () => ({ data: mockRows }) }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useCreateCheck: () => ({ create: mockCreate, pendingIds: [], pendingRows: [] }),
  useSaveCheckDraft: () => ({ save: mockSaveDraft }),
  useSaveCheckAnswer: () => ({ save: mockSaveAnswer }),
}));
const mockQc = new (jest.requireActual('@tanstack/react-query').QueryClient)();
jest.mock('@tanstack/react-query', () => ({ useMutationState: () => [], useQueryClient: () => mockQc }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: mockTrack }) }));

const RESULT = { code: 'fits_month', variant: null, readyBy: null, facts: [] } as never;

function storedRow(price: number, name: string) {
  return {
    id: ID, name, status: 'open', furthest_step: 1, version: 1, created_by: 'u1', household_id: 'h1',
    inputs: toStoredV2(withPrice(emptyCheck(), price as never)),
  };
}

describe('useV3CheckDraft', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockRows = [];
    mockCtx = { userId: 'u1', householdId: 'h1' };
    mockQc.clear();
  });
  afterEach(() => jest.useRealTimers());

  it('starts from an empty check and creates the row once on the first edit', async () => {
    const { result } = await renderHook(() => useV3CheckDraft(ID));
    expect(result.current.name).toBe('');
    expect(result.current.check.price).toBeNull();
    await act(async () => result.current.setName('Sofa'));
    await act(async () => result.current.edit(withPrice(result.current.check, 120000 as never)));
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]![0]).toMatchObject({ userId: 'u1', id: ID, householdId: 'h1', kind: 'buy', name: 'Sofa', furthestStep: 1 });
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('decide_check_started', {});
  });

  it('debounces later edits into one save with the latest name and inputs', async () => {
    mockRows = [storedRow(5000, 'Lamp')];
    const { result } = await renderHook(() => useV3CheckDraft(ID));
    expect(result.current.name).toBe('Lamp');
    expect(result.current.check.price).toBe(5000);
    await act(async () => result.current.edit(withPrice(result.current.check, 6000 as never)));
    await act(async () => result.current.edit(withPrice(result.current.check, 7000 as never)));
    await act(async () => result.current.setName('Desk lamp'));
    expect(mockSaveDraft).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(V3_DRAFT_DEBOUNCE_MS + 10);
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSaveDraft).toHaveBeenCalledTimes(1);
    const sent = mockSaveDraft.mock.calls[0]![0];
    expect(sent.id).toBe(ID);
    expect(sent.name).toBe('Desk lamp');
    expect(sent.inputs).toEqual(toStoredV2(withPrice(emptyCheck(), 7000 as never)));
  });

  it('flushes a pending save when the screen unmounts', async () => {
    mockRows = [storedRow(5000, 'Lamp')];
    const { result, unmount } = await renderHook(() => useV3CheckDraft(ID));
    await act(async () => result.current.setName('Lamp 2'));
    expect(mockSaveDraft).not.toHaveBeenCalled();
    await unmount();
    expect(mockSaveDraft).toHaveBeenCalledTimes(1);
    expect(mockSaveDraft.mock.calls[0]![0].name).toBe('Lamp 2');
  });

  it('holds the first edit until the account ids arrive', async () => {
    mockCtx = { userId: null, householdId: null };
    const { result, rerender } = await renderHook(() => useV3CheckDraft(ID));
    await act(async () => result.current.edit(withPrice(result.current.check, 100 as never)));
    expect(mockCreate).not.toHaveBeenCalled();
    mockCtx = { userId: 'u1', householdId: 'h1' };
    await rerender({});
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('writes the stored answer only on commit, exactly once, never on an edit', async () => {
    mockRows = [storedRow(5000, 'Lamp')];
    const { result } = await renderHook(() => useV3CheckDraft(ID));
    await act(async () => result.current.edit(withPrice(result.current.check, 6000 as never)));
    await act(async () => {
      jest.advanceTimersByTime(V3_DRAFT_DEBOUNCE_MS + 10);
    });
    expect(mockSaveAnswer).not.toHaveBeenCalled();
    let ok = false;
    await act(async () => {
      ok = result.current.commit(RESULT);
    });
    expect(ok).toBe(true);
    expect(mockSaveAnswer).toHaveBeenCalledTimes(1);
    expect(mockSaveAnswer.mock.calls[0]![0].id).toBe(ID);
    expect(mockSaveAnswer.mock.calls[0]![1]).toMatchObject({ v: 3, code: 'fits_month' });
  });

  it('commit returns false when no row exists yet', async () => {
    const { result } = await renderHook(() => useV3CheckDraft(ID));
    expect(result.current.commit(RESULT)).toBe(false);
    expect(mockSaveAnswer).not.toHaveBeenCalled();
  });

  it('ignores edits to a decided check', async () => {
    mockRows = [{ ...storedRow(5000, 'Lamp'), status: 'bought' }];
    const { result } = await renderHook(() => useV3CheckDraft(ID));
    expect(result.current.readOnly).toBe(true);
    await act(async () => result.current.setName('x'));
    await act(async () => {
      jest.advanceTimersByTime(V3_DRAFT_DEBOUNCE_MS + 10);
    });
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });

  describe('commit patches the checks cache first (05.3-85, UAT step 22)', () => {
    const KEY = ['decide-checks', 'u1', 'h1'];
    it('holds the typed price in the cache right after commit, marked pending, with one draft save and one answer save', async () => {
      const row = storedRow(0, 'Lamp');
      const other = { ...storedRow(100, 'Other'), id: '22222222-2222-4222-8222-222222222222' };
      mockRows = [row];
      mockQc.setQueryData(KEY, [row, other]);
      const { result } = await renderHook(() => useV3CheckDraft(ID));
      await act(async () => result.current.edit(withPrice(result.current.check, 3000 as never)));
      await act(async () => {
        result.current.commit(RESULT);
      });
      const cached = mockQc.getQueryData(KEY) as Array<Record<string, unknown>>;
      expect(cached[0]).toMatchObject({ id: ID, pending: true, inputs: toStoredV2(withPrice(emptyCheck(), 3000 as never)) });
      expect(cached[1]).toBe(other);
      expect(mockSaveDraft).toHaveBeenCalledTimes(1);
      expect(mockSaveAnswer).toHaveBeenCalledTimes(1);
    });

    it('returns a cache that does not hold the id unchanged', async () => {
      const other = { ...storedRow(100, 'Other'), id: '22222222-2222-4222-8222-222222222222' };
      const list = [other];
      mockQc.setQueryData(KEY, list);
      mockRows = [storedRow(5000, 'Lamp')];
      const { result } = await renderHook(() => useV3CheckDraft(ID));
      await act(async () => result.current.edit(withPrice(result.current.check, 3000 as never)));
      await act(async () => {
        result.current.commit(RESULT);
      });
      expect(mockQc.getQueryData(KEY)).toBe(list);
    });

    it('patches nothing when the row is not created yet', async () => {
      const list: unknown[] = [];
      mockQc.setQueryData(KEY, list);
      const { result } = await renderHook(() => useV3CheckDraft(ID));
      let ok = true;
      await act(async () => {
        ok = result.current.commit(RESULT);
      });
      expect(ok).toBe(false);
      expect(mockQc.getQueryData(KEY)).toBe(list);
    });
  });
});

describe('saveStatusOf', () => {
  const m = (status: 'pending' | 'success' | 'error', isPaused: boolean, submittedAt: number) => ({ status, isPaused, submittedAt });
  it('maps pending to saved, paused to offline and error to notSaved', () => {
    expect(saveStatusOf([])).toBe('saved');
    expect(saveStatusOf([m('pending', false, 1)])).toBe('saved');
    expect(saveStatusOf([m('pending', true, 1)])).toBe('offline');
    expect(saveStatusOf([m('success', false, 1), m('error', false, 2)])).toBe('notSaved');
    expect(saveStatusOf([m('error', false, 1), m('success', false, 2)])).toBe('saved');
  });
});
