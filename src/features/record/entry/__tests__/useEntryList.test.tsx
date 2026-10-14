import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ListItem } from '@/engine/entryList';
import { entryDraftKey, saveEntryDraft } from '../useEntryDraft';
import { useEntryList } from '../useEntryList';

jest.setTimeout(30000);

const item = (id: string, over: Partial<ListItem> = {}): ListItem => ({
  id,
  type: 'out',
  amountMinor: 1250,
  currency: 'GBP',
  accountId: 'a1',
  localDate: '2026-09-20',
  name: 'Tesco',
  categoryId: null,
  paymentType: null,
  status: 'paid',
  statusTouched: false,
  note: '',
  automatic: false,
  refund: false,
  repeat: { freq: 'never' },
  toAccountId: null,
  toCurrency: null,
  amountInMinor: null,
  ...over,
});

const KEY = entryDraftKey('u1', 'h1');
const ids = new Set(['a1', 'a2']);
const mount = async (over: Partial<Parameters<typeof useEntryList>[0]> = {}) =>
  await renderHook(() =>
    useEntryList({ userId: 'u1', householdId: 'h1', enabled: true, activeAccountIds: ids, ...over }),
  );

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(async () => {
  // let an unmount flush from the test that just ended land, and drop any spies
  await new Promise((r) => setTimeout(r, 50));
});

describe('useEntryList remove and restore', () => {
  const three = async () => {
    const m = await mount();
    await act(async () => {});
    await act(async () => {
      m.result.current.add(item('c'));
      m.result.current.add(item('b'));
      m.result.current.add(item('a'));
    });
    return m;
  };

  it('restores a removed item at its original index and keeps the draft in step', async () => {
    const { result } = await three();
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    let gone: ReturnType<typeof result.current.remove> = null;
    await act(async () => {
      gone = result.current.remove('b');
    });
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'c']);
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}')).toBeTruthy());
    await act(async () => {
      expect(result.current.restore(gone!)).toBe(true);
    });
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    await waitFor(async () => expect(((await AsyncStorage.getItem(KEY)) ?? '').match(/"id":"[abc]"/g)).toHaveLength(3));
  });

  it('does nothing once the list has been cleared', async () => {
    const { result } = await three();
    let gone: ReturnType<typeof result.current.remove> = null;
    await act(async () => {
      gone = result.current.remove('b');
    });
    await act(async () => {
      result.current.clearAll();
    });
    await act(async () => {
      expect(result.current.restore(gone!)).toBe(false);
    });
    expect(result.current.items).toEqual([]);
  });

  it('refuses a restore that would break the 30-per-type cap', async () => {
    const { result } = await mount();
    await act(async () => {});
    await act(async () => {
      result.current.add(item('x'));
    });
    let gone: ReturnType<typeof result.current.remove> = null;
    await act(async () => {
      gone = result.current.remove('x');
    });
    await act(async () => {
      for (let n = 0; n < 30; n += 1) result.current.add(item(`f${n}`));
    });
    await act(async () => {
      expect(result.current.restore(gone!)).toBe(false);
    });
    expect(result.current.items).toHaveLength(30);
  });

  it('does nothing after the sheet unmounts', async () => {
    const { result, unmount } = await three();
    let gone: ReturnType<typeof result.current.remove> = null;
    await act(async () => {
      gone = result.current.remove('b');
    });
    const restore = result.current.restore;
    await unmount();
    expect(restore(gone!)).toBe(false);
  });
});

describe('useEntryList', () => {
  it('starts empty with no stored draft', async () => {
    const { result } = await mount();
    await act(async () => {});
    expect(result.current.resumeCount).toBe(0);
    expect(result.current.items).toEqual([]);
  });

  it('offers a stored draft and loads it only on continue', async () => {
    await saveEntryDraft('u1', 'h1', [item('i1'), item('i2')]);
    const { result } = await mount();
    await waitFor(() => expect(result.current.resumeCount).toBe(2));
    expect(result.current.items).toEqual([]);
    await act(() => result.current.continueDraft());
    expect(result.current.items).toHaveLength(2);
    expect(result.current.resumeCount).toBe(0);
  });

  it('discard empties the list and removes the key', async () => {
    await saveEntryDraft('u1', 'h1', [item('i1')]);
    const { result } = await mount();
    await waitFor(() => expect(result.current.resumeCount).toBe(1));
    await act(() => result.current.discardDraft());
    expect(result.current.items).toEqual([]);
    await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBeNull());
  });

  it('drops and counts items whose account is gone', async () => {
    await saveEntryDraft('u1', 'h1', [item('i1'), item('i2', { accountId: 'gone' })]);
    const { result } = await mount();
    await waitFor(() => expect(result.current.resumeCount).toBe(2));
    await act(() => result.current.continueDraft());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.dropped).toBe(1);
  });

  it('persists adds after the debounce and enforces the per-type cap', async () => {
    const { result } = await mount();
    await act(async () => {});
    let ok = false;
    await act(() => {
      ok = result.current.add(item('n0'));
    });
    expect(ok).toBe(true);
    await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).not.toBeNull());
    for (let n = 1; n < 30; n += 1) {
      await act(() => {
        result.current.add(item(`n${n}`));
      });
    }
    expect(result.current.items).toHaveLength(30);
    await act(() => {
      ok = result.current.add(item('over'));
    });
    expect(ok).toBe(false);
    expect(result.current.items).toHaveLength(30);
    expect(result.current.canAdd('out')).toBe(false);
    expect(result.current.canAdd('in')).toBe(true);
  });

  it('remove, take and clearAll update the list and storage', async () => {
    const { result } = await mount();
    await act(async () => {});
    await act(() => {
      result.current.add(item('i1'));
      result.current.add(item('i2'));
      result.current.add(item('i3'));
    });
    await act(() => result.current.remove('i1'));
    expect(result.current.items.map((i) => i.id)).toEqual(['i3', 'i2']);
    let taken: ListItem | null = null;
    await act(() => {
      taken = result.current.take('i2');
    });
    expect(taken).toMatchObject({ id: 'i2' });
    expect(result.current.items.map((i) => i.id)).toEqual(['i3']);
    await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toContain('i3'));
    await act(() => result.current.clearAll());
    expect(result.current.items).toEqual([]);
    await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toBeNull());
  });

  it('writes nothing while a resume answer is pending', async () => {
    await saveEntryDraft('u1', 'h1', [item('i1')]);
    const { result } = await mount();
    await waitFor(() => expect(result.current.resumeCount).toBe(1));
    const spy = jest.spyOn(AsyncStorage, 'setItem');
    spy.mockClear();
    await act(() => {
      result.current.add(item('new'));
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(spy).not.toHaveBeenCalled();
  });

  it('flushes a pending save on unmount', async () => {
    const { result, unmount } = await mount();
    await act(async () => {});
    await act(() => {
      result.current.add(item('i1'));
    });
    await unmount();
    await waitFor(async () => expect(await AsyncStorage.getItem(KEY)).toContain('i1'));
  });

  it('never reads or writes storage when disabled', async () => {
    const get = jest.spyOn(AsyncStorage, 'getItem');
    const set = jest.spyOn(AsyncStorage, 'setItem');
    get.mockClear();
    set.mockClear();
    const { result, unmount } = await mount({ enabled: false });
    await act(() => {
      result.current.add(item('i1'));
    });
    await new Promise((r) => setTimeout(r, 400));
    await unmount();
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});

describe('useEntryList form keeping (D-25)', () => {
  const form = {
    direction: 'out' as const,
    amountText: '7',
    name: '',
    categoryId: null,
    accountId: 'a1',
    currency: 'GBP',
    localDate: '2026-09-20',
    status: 'paid' as const,
    statusTouched: false,
    paymentType: null,
    note: '',
    toAccountId: null,
    toCurrency: null,
    amountInText: '',
    automatic: false,
    refund: false,
  };

  it('counts a stored form as one unsaved entry', async () => {
    await saveEntryDraft('u1', 'h1', [], form);
    const { result } = await mount();
    await waitFor(() => expect(result.current.resumeCount).toBe(1));
  });

  it('counts 2 items + form as 3, and Continue restores the form once', async () => {
    await saveEntryDraft('u1', 'h1', [item('i1'), item('i2')], form);
    const onRestoreForm = jest.fn();
    const { result } = await mount({ onRestoreForm });
    await waitFor(() => expect(result.current.resumeCount).toBe(3));
    await act(() => {
      result.current.continueDraft();
    });
    expect(onRestoreForm).toHaveBeenCalledTimes(1);
    expect(onRestoreForm).toHaveBeenCalledWith(form);
    expect(result.current.items).toHaveLength(2);
    await waitFor(async () => {
      const raw = JSON.parse((await AsyncStorage.getItem(KEY)) as string);
      expect(raw.form).toBeNull();
      expect(raw.items).toHaveLength(2);
    });
  });

  it('keepForm writes items and form at once', async () => {
    const { result } = await mount();
    await act(async () => {});
    await act(() => {
      result.current.add(item('i1'));
      result.current.keepForm(form);
    });
    await waitFor(async () => {
      const raw = JSON.parse((await AsyncStorage.getItem(KEY)) as string);
      expect(raw.form.amountText).toBe('7');
      expect(raw.items).toHaveLength(1);
    });
  });

  it('keepForm merges with the stored draft while the resume answer is pending (L5)', async () => {
    await saveEntryDraft('u1', 'h1', [item('i1')]);
    const { result, unmount } = await mount();
    await waitFor(() => expect(result.current.resumeCount).toBe(1));
    await act(() => {
      result.current.add(item('i2'));
      result.current.keepForm(form);
    });
    await unmount();
    await new Promise((r) => setTimeout(r, 400));
    const raw = JSON.parse((await AsyncStorage.getItem(KEY)) as string);
    expect(raw.form.amountText).toBe('7');
    expect(raw.items.map((i: ListItem) => i.id)).toEqual(['i1', 'i2']);
  });

  it('keepForm before the stored draft has loaded keeps the stored items and the live ones (L5)', async () => {
    await saveEntryDraft('u1', 'h1', [item('i1')]);
    const { result, unmount } = await mount();
    await act(() => {
      result.current.add(item('i2'));
      result.current.keepForm(form);
    });
    await unmount();
    await new Promise((r) => setTimeout(r, 400));
    const raw = JSON.parse((await AsyncStorage.getItem(KEY)) as string);
    expect(raw.form.amountText).toBe('7');
    expect(raw.items.map((i: ListItem) => i.id)).toEqual(['i1', 'i2']);
  });

  it('an oversized merge keeps the stored items with the live form (L5)', async () => {
    const stored = Array.from({ length: 30 }, (_, n) => item(`s${n}`));
    await saveEntryDraft('u1', 'h1', stored);
    const { result, unmount } = await mount();
    await waitFor(() => expect(result.current.resumeCount).toBe(30));
    await act(() => {
      result.current.add(item('extra'));
      result.current.keepForm(form);
    });
    await unmount();
    await new Promise((r) => setTimeout(r, 400));
    const raw = JSON.parse((await AsyncStorage.getItem(KEY)) as string);
    expect(raw.form.amountText).toBe('7');
    expect(raw.items).toHaveLength(30);
  });

  it('an oversized merge still keeps live items of a type that has room (WR-02)', async () => {
    const stored = Array.from({ length: 30 }, (_, n) => item(`s${n}`));
    await saveEntryDraft('u1', 'h1', stored);
    const { result, unmount } = await mount();
    await waitFor(() => expect(result.current.resumeCount).toBe(30));
    await act(() => {
      result.current.add(item('inc', { type: 'in' }));
      result.current.keepForm(form);
    });
    await unmount();
    await new Promise((r) => setTimeout(r, 400));
    const raw = JSON.parse((await AsyncStorage.getItem(KEY)) as string);
    expect(raw.items.map((i: ListItem) => i.id)).toContain('inc');
  });

  it('a discard after keepForm is not resurrected by the late merge write (WR-02)', async () => {
    await saveEntryDraft('u1', 'h1', [item('i1')]);
    const { result, unmount } = await mount();
    await waitFor(() => expect(result.current.resumeCount).toBe(1));
    await act(() => {
      result.current.keepForm(form);
      result.current.clearAll();
    });
    await unmount();
    await new Promise((r) => setTimeout(r, 400));
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('the unmount flush after keepForm keeps the saved form', async () => {
    const { result, unmount } = await mount();
    await act(async () => {});
    await act(() => {
      result.current.add(item('i1'));
    });
    await act(() => {
      result.current.keepForm(form);
    });
    await unmount();
    await new Promise((r) => setTimeout(r, 400));
    expect(JSON.parse((await AsyncStorage.getItem(KEY)) as string).form.amountText).toBe('7');
  });
});
