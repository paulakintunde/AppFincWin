import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_PREFIX, wipeDeviceData } from '@/services/storage/wipe';
import type { ListItem } from '@/engine/entryList';
import { clearEntryDraft, entryDraftKey, loadEntryDraft, saveEntryDraft } from '../useEntryDraft';

const item = (id: string): ListItem => ({
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
});

const EMPTY = { items: [], form: null };

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('entry draft store', () => {
  it('keys under the wiped prefix, per user and household', () => {
    expect(entryDraftKey('u1', 'h1')).toBe('fincwin:entry-draft:v1:u1:h1');
    expect(entryDraftKey('u1', 'h1').startsWith(STORAGE_PREFIX)).toBe(true);
  });

  it('round-trips and removes the key when saving an empty list', async () => {
    await saveEntryDraft('u1', 'h1', [item('i1'), item('i2')]);
    expect((await loadEntryDraft('u1', 'h1')).items.map((i) => i.id)).toEqual(['i1', 'i2']);
    await saveEntryDraft('u1', 'h1', []);
    expect(await AsyncStorage.getItem(entryDraftKey('u1', 'h1'))).toBeNull();
  });

  it('loads a corrupt value as empty and never reads another household or user', async () => {
    await AsyncStorage.setItem(entryDraftKey('u1', 'h1'), '{nope');
    expect(await loadEntryDraft('u1', 'h1')).toEqual(EMPTY);
    await saveEntryDraft('u1', 'h1', [item('i1')]);
    expect(await loadEntryDraft('u1', 'h2')).toEqual(EMPTY);
    expect(await loadEntryDraft('u2', 'h1')).toEqual(EMPTY);
  });

  it('is gone after wipeDeviceData', async () => {
    await saveEntryDraft('u1', 'h1', [item('i1')]);
    await wipeDeviceData();
    expect(await loadEntryDraft('u1', 'h1')).toEqual(EMPTY);
  });

  it('clearEntryDraft removes it', async () => {
    await saveEntryDraft('u1', 'h1', [item('i1')]);
    await clearEntryDraft('u1', 'h1');
    expect(await loadEntryDraft('u1', 'h1')).toEqual(EMPTY);
  });

  it('never throws on storage errors', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('x'));
    await expect(saveEntryDraft('u1', 'h1', [item('i1')])).resolves.toBeUndefined();
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('x'));
    await expect(loadEntryDraft('u1', 'h1')).resolves.toEqual(EMPTY);
  });
});

const FORM = {
  direction: 'out' as const,
  amountText: '12.50',
  name: 'Tesco',
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

describe('entry draft store: form (D-25)', () => {
  it('stores a form-only v2 draft and removes the key only when both are empty', async () => {
    await saveEntryDraft('u1', 'h1', [], FORM);
    const raw = JSON.parse((await AsyncStorage.getItem(entryDraftKey('u1', 'h1'))) as string);
    expect(raw.v).toBe(2);
    expect(raw.items).toEqual([]);
    expect(await loadEntryDraft('u1', 'h1')).toEqual({ items: [], form: FORM });
    await saveEntryDraft('u1', 'h1', [], null);
    expect(await AsyncStorage.getItem(entryDraftKey('u1', 'h1'))).toBeNull();
  });

  it('loads a stored v1 draft as items with no form', async () => {
    await AsyncStorage.setItem(
      entryDraftKey('u1', 'h1'),
      JSON.stringify({ v: 1, savedAt: '2026-09-20T00:00:00Z', items: [item('i1')] }),
    );
    const d = await loadEntryDraft('u1', 'h1');
    expect(d.items.map((i) => i.id)).toEqual(['i1']);
    expect(d.form).toBeNull();
  });
});
