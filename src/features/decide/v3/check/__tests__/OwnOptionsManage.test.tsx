/** Plan 05.3-84: rename, re-base and remove the user's own kinds and purposes. */
import React from 'react';
import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { emptyCheck } from '../../model/checkEdits';
import { PurposeBlock } from '../../layers/PurposeBlock';
import { Wrap } from '../../layers/__tests__/harness';
import { ItemTypeChips } from '../ItemTypeChips';
import { useOwnOptions } from '../useOwnOptions';

jest.setTimeout(90000);

const mockSave = jest.fn();
const mockToast = jest.fn();
let mockRow: Record<string, unknown> | null = null;
let mockUser: string | null = 'u1';

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: mockUser, householdId: 'h1', homeCurrency: 'USD', showCents: false, ready: true, today: '2026-10-31' }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: mockRow }) }));
jest.mock('@/data/mutations/decideSetup', () => ({ useSaveSetupStep: () => ({ save: mockSave }) }));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));

const LONG = 'A'.repeat(40);
const kinds = () => ({
  v: 1,
  itemTypes: [
    { id: 'a', name: 'Bike', base: 'vehicle', questionIds: [], ownQuestions: [], deletedAt: null },
    { id: 'b', name: LONG, base: 'general', questionIds: [], ownQuestions: [], deletedAt: null },
  ],
  purposes: [{ id: 'p', name: 'Kids', deletedAt: null }],
});

beforeEach(() => {
  mockSave.mockReset().mockReturnValue({ stepId: 's1' });
  mockToast.mockReset();
  mockRow = { custom_options: kinds() };
  mockUser = 'u1';
});

describe('useOwnOptions manage actions', () => {
  it('rename saves only the name with Undo and a toast', async () => {
    const { result } = await renderHook(() => useOwnOptions());
    expect(result.current.rename('itemType', 'a', ' Road bike ')).toEqual({ ok: true });
    const call = mockSave.mock.calls[0][0];
    expect(call.labelKey).toBe('ownOptionRenamed'); // 05.3-120 (UAT gap 37)
    expect(call.stepTitle).toBe('Road bike');
    expect(call.patch.custom_options.itemTypes[0]).toMatchObject({ id: 'a', name: 'Road bike', base: 'vehicle' });
    expect(call.patch.custom_options.itemTypes[1].name).toBe(LONG);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ordinary', stepId: 's1', text: { key: 'decide.v3.ui.ownOptions.renamedToast', params: { name: 'Road bike' } } }));
  });

  it('rename can change the base in the same save; a purpose rename ignores base', async () => {
    const { result } = await renderHook(() => useOwnOptions());
    expect(result.current.rename('itemType', 'a', 'Bike', 'electronics').ok).toBe(true);
    expect(mockSave.mock.calls[0][0].patch.custom_options.itemTypes[0].base).toBe('electronics');
    expect(result.current.rename('purpose', 'p', 'Children', 'electronics').ok).toBe(true);
    expect(mockSave.mock.calls[1][0].patch.custom_options.purposes[0].name).toBe('Children');
  });

  it('05.3-120 removing an own kind names it in the undo step', async () => {
    const { result } = await renderHook(() => useOwnOptions());
    expect(result.current.remove('itemType', 'a')).toEqual({ ok: true });
    expect(mockSave.mock.calls[0][0]).toMatchObject({ labelKey: 'ownOptionRemoved', stepTitle: 'Bike' });
  });

  it('remove marks the entry deleted with today and moves it to retired', async () => {
    const { result } = await renderHook(() => useOwnOptions());
    expect(result.current.remove('purpose', 'p')).toEqual({ ok: true });
    expect(mockSave.mock.calls[0][0].patch.custom_options.purposes[0]).toMatchObject({ id: 'p', deletedAt: '2026-10-31' });
    expect(mockSave.mock.calls[0][0]).toMatchObject({ labelKey: 'ownOptionRemoved', stepTitle: 'Kids' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'destructive', text: { key: 'decide.v3.ui.ownOptions.removedToast', params: { name: 'Kids' } } }));
    mockRow = { custom_options: mockSave.mock.calls[0][0].patch.custom_options };
    const again = await renderHook(() => useOwnOptions());
    expect(again.result.current.purposes).toEqual([]);
    expect(again.result.current.retired.get('p')).toBe('Kids');
  });

  it('setBase swaps the base and its questions; a toast without a step id still shows', async () => {
    mockSave.mockReturnValue(null);
    const { result } = await renderHook(() => useOwnOptions());
    expect(result.current.setBase('itemType', 'a', 'electronics')).toEqual({ ok: true });
    expect(mockSave.mock.calls[0][0].patch.custom_options.itemTypes[0].base).toBe('electronics');
    expect(mockSave.mock.calls[0][0]).toMatchObject({ labelKey: 'ownOptionRenamed', stepTitle: 'Bike' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: null }));
  });

  it('refusals write nothing', async () => {
    const { result } = await renderHook(() => useOwnOptions());
    expect(result.current.rename('itemType', 'a', 'bike ')).toEqual({ ok: true });
    mockSave.mockClear();
    expect(result.current.rename('itemType', 'a', LONG)).toEqual({ ok: false, reason: 'name_taken' });
    expect(result.current.rename('itemType', 'a', '  ')).toEqual({ ok: false, reason: 'name_length' });
    expect(result.current.rename('itemType', 'zz', 'X')).toEqual({ ok: false, reason: 'not_found' });
    expect(result.current.rename('itemType', 'a', 'Dup', 'nope' as never).ok).toBe(true);
    mockSave.mockClear();
    expect(result.current.remove('purpose', 'zz')).toEqual({ ok: false, reason: 'not_found' });
    expect(result.current.setBase('itemType', 'zz', 'general')).toEqual({ ok: false, reason: 'not_found' });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('no row or no user: everything is not_found', async () => {
    mockRow = null;
    const a = await renderHook(() => useOwnOptions());
    expect(a.result.current.rename('purpose', 'p', 'X')).toEqual({ ok: false, reason: 'not_found' });
    expect(a.result.current.remove('purpose', 'p')).toEqual({ ok: false, reason: 'not_found' });
    expect(a.result.current.setBase('itemType', 'a', 'general')).toEqual({ ok: false, reason: 'not_found' });
    expect(a.result.current.itemRows).toEqual([]);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('itemRows lists live kinds with their base', async () => {
    const { result } = await renderHook(() => useOwnOptions());
    expect(result.current.itemRows).toEqual([
      { id: 'a', name: 'Bike', base: 'vehicle' },
      { id: 'b', name: LONG, base: 'general' },
    ]);
  });
});

describe('Edit your own', () => {
  it('is hidden with no own kinds, and when read-only', async () => {
    mockRow = { custom_options: null };
    await render(<Wrap><ItemTypeChips selected={{ kind: 'preset', value: 'general' }} onSelect={jest.fn()} /></Wrap>);
    expect(screen.queryByText('Edit your own')).toBeNull();
  });

  it('read-only hides the link', async () => {
    await render(<Wrap><ItemTypeChips selected={{ kind: 'preset', value: 'general' }} onSelect={jest.fn()} readOnly /></Wrap>);
    expect(screen.queryByText('Edit your own')).toBeNull();
  });

  it('kinds: lists rows with Counts like, renames and re-bases in one save', async () => {
    await render(<Wrap><ItemTypeChips selected={{ kind: 'preset', value: 'general' }} onSelect={jest.fn()} /></Wrap>);
    await fireEvent.press(screen.getByText('Edit your own'));
    expect(screen.getByText('Your own kinds of purchase')).toBeTruthy();
    expect(screen.getByText('Counts like Vehicle')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Rename Bike'));
    expect(screen.getByText('Rename kind of purchase')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Road bike');
    await fireEvent.press(screen.getAllByText('Electronics').at(-1) as never);
    await fireEvent.press(screen.getByText('Save'));
    const saved = mockSave.mock.calls[0][0].patch.custom_options.itemTypes[0];
    expect(saved).toMatchObject({ name: 'Road bike', base: 'electronics' });
  });

  it('a taken name keeps the rename sheet open with the reason; Cancel closes it', async () => {
    await render(<Wrap><ItemTypeChips selected={{ kind: 'preset', value: 'general' }} onSelect={jest.fn()} /></Wrap>);
    await fireEvent.press(screen.getByText('Edit your own'));
    await fireEvent.press(screen.getByLabelText('Rename Bike'));
    await fireEvent.changeText(screen.getByLabelText('Name'), LONG);
    await fireEvent.press(screen.getByText('Save'));
    expect(screen.getByText('That name is already in your list.')).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByText('Rename kind of purchase')).toBeNull();
  });

  it('Remove asks first, says past checks keep it, and Keep it saves nothing', async () => {
    await render(<Wrap><ItemTypeChips selected={{ kind: 'preset', value: 'general' }} onSelect={jest.fn()} /></Wrap>);
    await fireEvent.press(screen.getByText('Edit your own'));
    await fireEvent.press(screen.getByLabelText('Remove Bike'));
    expect(screen.getByText('Remove Bike?')).toBeTruthy();
    expect(screen.getByText('It leaves this list. Checks that already use it keep it, and recorded decisions do not change.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep it'));
    expect(mockSave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Remove Bike'));
    await fireEvent.press(screen.getAllByText('Remove').at(-1) as never);
    expect(mockSave.mock.calls[0][0].patch.custom_options.itemTypes[0].deletedAt).toBe('2026-10-31');
  });

  it('purposes: renames and removes', async () => {
    await render(<Wrap><PurposeBlock check={emptyCheck()} edit={jest.fn()} /></Wrap>);
    await fireEvent.press(screen.getByText('Edit your own'));
    expect(screen.getByText('Your own purposes')).toBeTruthy();
    expect(screen.queryByText(/Counts like/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Rename Kids'));
    expect(screen.getByText('Rename purpose')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Family');
    await fireEvent.press(screen.getByText('Save'));
    expect(mockSave.mock.calls[0][0].patch.custom_options.purposes[0].name).toBe('Family');
    await fireEvent.press(screen.getByLabelText('Remove Kids'));
    await fireEvent.press(screen.getAllByText('Remove').at(-1) as never);
    expect(mockSave.mock.calls[1][0].patch.custom_options.purposes[0].deletedAt).toBe('2026-10-31');
  });

  it('the link is hidden when only purposes exist and the kind chips are shown', async () => {
    mockRow = { custom_options: { v: 1, itemTypes: [], purposes: [{ id: 'p', name: 'Kids', deletedAt: null }] } };
    await render(<Wrap><ItemTypeChips selected={{ kind: 'preset', value: 'general' }} onSelect={jest.fn()} /></Wrap>);
    expect(screen.queryByText('Edit your own')).toBeNull();
  });
});

describe.each([320, 402])('list sheet fit at %i dp', () => {
  it.each([1, 2])('scale %i with a 40-character name', async (scale) => {
    await render(<Wrap scale={scale}><ItemTypeChips selected={{ kind: 'preset', value: 'general' }} onSelect={jest.fn()} /></Wrap>);
    await fireEvent.press(screen.getByText('Edit your own'));
    expect(screen.getAllByText(LONG).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByLabelText(`Remove ${LONG}`));
    expect(screen.getByText(`Remove ${LONG}?`)).toBeTruthy();
  });
});
