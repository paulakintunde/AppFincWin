import { renderHook, act, waitFor } from '@testing-library/react-native';
import { wipeDeviceData } from '@/services/storage/wipe';
import {
  showToast,
  queueToast,
  dismissToast,
  getToast,
  useToast,
  resetToastForTests,
  toastDurationMs,
  TOAST_MS_DESTRUCTIVE,
  TOAST_MS_ORDINARY,
} from '../undoToast';

describe('undoToast', () => {
  afterEach(() => {
    resetToastForTests();
  });

  it('exposes the D-31 timing constants', () => {
    expect(TOAST_MS_ORDINARY).toBe(3200);
    expect(TOAST_MS_DESTRUCTIVE).toBe(6000);
  });

  // C-CR-02 / D-31: with a screen reader running there is no auto-dismiss.
  it('toastDurationMs gives the D-31 timings, and no auto-dismiss under a screen reader', () => {
    expect(toastDurationMs('ordinary', false)).toBe(TOAST_MS_ORDINARY);
    expect(toastDurationMs('info', false)).toBe(TOAST_MS_ORDINARY);
    expect(toastDurationMs('destructive', false)).toBe(TOAST_MS_DESTRUCTIVE);
    expect(toastDurationMs('refusal', false)).toBe(TOAST_MS_DESTRUCTIVE);
    for (const kind of ['ordinary', 'destructive', 'refusal', 'info'] as const) {
      expect(toastDurationMs(kind, true)).toBeNull();
    }
  });

  it('showToast replaces any current toast with a new id', () => {
    showToast({ kind: 'ordinary', text: { key: 'undo.added' }, stepId: 'step-1' });
    const first = getToast();
    expect(first).toMatchObject({ kind: 'ordinary', stepId: 'step-1' });

    showToast({ kind: 'destructive', text: { key: 'undo.deleted' }, stepId: 'step-2' });
    const second = getToast();
    expect(second).toMatchObject({ kind: 'destructive', stepId: 'step-2' });
    expect(second?.id).not.toBe(first?.id);
  });

  it('dismissToast clears the current toast', () => {
    showToast({ kind: 'ordinary', stepId: 'step-1' });
    expect(getToast()).not.toBeNull();

    dismissToast();
    expect(getToast()).toBeNull();
  });

  it('dismissToast(staleId) is a no-op', () => {
    showToast({ kind: 'ordinary', stepId: 'step-1' });
    const current = getToast();

    dismissToast((current?.id ?? 0) - 1);

    expect(getToast()).toEqual(current);
  });

  it('dismissToast() on an already-empty toast is a no-op', () => {
    expect(getToast()).toBeNull();
    dismissToast();
    expect(getToast()).toBeNull();
  });

  it('useToast re-renders subscribers when the toast changes', async () => {
    const { result } = await renderHook(() => useToast());
    expect(result.current).toBeNull();

    act(() => {
      showToast({ kind: 'ordinary', stepId: 'step-1' });
    });
    await waitFor(() => expect(result.current).toMatchObject({ stepId: 'step-1' }));

    act(() => {
      dismissToast();
    });
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('refusal and info kinds carry the UndoConflict payload through unchanged', () => {
    const refusal = { entity: 'transactions' as const, id: 'tx-1', updatedBy: 'Sam', recordName: 'Groceries', builtinKey: null, reason: 'changed' as const };
    showToast({ kind: 'refusal', text: null, refusal });
    expect(getToast()).toMatchObject({ kind: 'refusal', text: null, refusal });
  });

  it('T-02-15-04: the sign-out wipe clears the toast', async () => {
    showToast({ kind: 'ordinary', stepId: 'step-1' });
    expect(getToast()).not.toBeNull();

    await wipeDeviceData();

    expect(getToast()).toBeNull();
  });

  describe('queueToast', () => {
    it('shows immediately when no toast is up', () => {
      queueToast({ kind: 'ordinary', text: { key: 'a' } });
      expect(getToast()?.text?.key).toBe('a');
    });

    it('waits behind the current toast and shows after it is dismissed, never stacking', () => {
      showToast({ kind: 'ordinary', text: { key: 'first' } });
      queueToast({ kind: 'ordinary', text: { key: 'second' } });
      queueToast({ kind: 'ordinary', text: { key: 'third' } });
      expect(getToast()?.text?.key).toBe('first');

      dismissToast();
      expect(getToast()?.text?.key).toBe('second');
      dismissToast();
      expect(getToast()?.text?.key).toBe('third');
      dismissToast();
      expect(getToast()).toBeNull();
    });
  });
});
