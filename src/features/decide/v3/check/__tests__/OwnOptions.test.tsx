/** Plan 05.3-83: own item types and purposes on Check a purchase (hook, sheet, chips, purpose block). */
import React from 'react';
import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { emptyCheck, withPurpose } from '../../model/checkEdits';
import { PurposeBlock } from '../../layers/PurposeBlock';
import { Wrap } from '../../layers/__tests__/harness';
import { ItemTypeChips } from '../ItemTypeChips';
import { useOwnOptions } from '../useOwnOptions';
import { i18n } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';

jest.setTimeout(60000);

const mockSave = jest.fn();
const mockToast = jest.fn();
let mockRow: Record<string, unknown> | null = null;
let mockUser: string | null = 'u1';

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: mockUser, householdId: 'h1', homeCurrency: 'USD', showCents: false, ready: true }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: mockRow }) }));
jest.mock('@/data/mutations/decideSetup', () => ({ useSaveSetupStep: () => ({ save: mockSave }) }));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));

const live = (n: number, kind: 'itemTypes' | 'purposes') =>
  Array.from({ length: n }, (_, i) =>
    kind === 'itemTypes'
      ? { id: `i${i}`, name: `Kind ${i}`, base: 'general', questionIds: [], ownQuestions: [], deletedAt: null }
      : { id: `p${i}`, name: `Purpose ${i}`, deletedAt: null },
  );

beforeEach(() => {
  mockSave.mockReset().mockReturnValue({ stepId: 's1' });
  mockToast.mockReset();
  mockRow = { custom_options: null };
  mockUser = 'u1';
});

describe('useOwnOptions', () => {
  it('lists live labels, keeps deleted names as retired, and counts live ones', async () => {
    mockRow = {
      custom_options: {
        v: 1,
        itemTypes: [{ id: 'a', name: 'Bike', base: 'vehicle', questionIds: [], ownQuestions: [], deletedAt: null }, { id: 'b', name: 'Old', base: 'general', questionIds: [], ownQuestions: [], deletedAt: '2026-01-01' }],
        purposes: [{ id: 'c', name: 'Kids', deletedAt: null }],
      },
    };
    const { result } = await renderHook(() => useOwnOptions());
    expect(result.current.itemTypes).toEqual([{ id: 'a', label: 'Bike' }]);
    expect(result.current.purposes).toEqual([{ id: 'c', label: 'Kids' }]);
    expect(result.current.retired.get('b')).toBe('Old');
    expect(result.current.liveCount).toEqual({ itemTypes: 1, purposes: 1 });
  });

  it('adds an item type with Undo and a toast', async () => {
    const { result } = await renderHook(() => useOwnOptions());
    const r = result.current.add('itemType', { name: ' Bike ', base: 'vehicle' });
    expect(r).toEqual({ ok: true, id: 'new-id' });
    const call = mockSave.mock.calls[0][0];
    // 05.3-120 (UAT gap 37): History names the option, not "Setup answer saved".
    expect(call.labelKey).toBe('ownOptionAdded');
    expect(call.stepTitle).toBe('Bike');
    expect(call.patch.custom_options.itemTypes[0]).toMatchObject({ id: 'new-id', name: 'Bike', base: 'vehicle' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 's1', text: { key: 'decide.v3.ui.ownOptions.savedToast', params: { name: 'Bike' } } }));
  });

  it('05.3-120 the own-option History labels name the option, and fall back without a name', () => {
    const text = (l: { key: string; params: Record<string, string | number> }): string =>
      (i18n.t as (k: string, o?: Record<string, string | number>) => string)(l.key, l.params);
    const named = undoLabelText('ownOptionAdded', { name: 'Bike' });
    expect(named.key).toBe('undo.label.ownOptionAdded');
    expect(text(named)).toBe('Your own option added · Bike');
    const unnamed = undoLabelText('ownOptionAdded', {});
    expect(unnamed.key).toBe('undo.labelUnnamed.ownOptionAdded');
    expect(text(unnamed)).toBe('Your own option added');
    expect(text(undoLabelText('ownOptionRenamed', { name: 'Road bike' }))).toBe('Your own option renamed · Road bike');
    expect(text(undoLabelText('ownOptionRenamed', {}))).toBe('Your own option renamed');
    expect(text(undoLabelText('ownOptionRemoved', { name: 'Bike' }))).toBe('Your own option removed · Bike');
    expect(text(undoLabelText('ownOptionRemoved', {}))).toBe('Your own option removed');
  });

  it('adds a purpose, and an item type with no base counts like General', async () => {
    const { result } = await renderHook(() => useOwnOptions());
    expect(result.current.add('purpose', { name: 'For the kids' }).ok).toBe(true);
    expect(mockSave.mock.calls[0][0].patch.custom_options.purposes[0]).toMatchObject({ name: 'For the kids' });
    expect(result.current.add('itemType', { name: 'Boat' }).ok).toBe(true);
    expect(mockSave.mock.calls[1][0].patch.custom_options.itemTypes[0].base).toBe('general');
  });

  it('a save that returns no step still toasts without a step id', async () => {
    mockSave.mockReturnValue(null);
    const { result } = await renderHook(() => useOwnOptions());
    result.current.add('purpose', { name: 'X' });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: null }));
  });

  it('a refused add writes nothing', async () => {
    const { result } = await renderHook(() => useOwnOptions());
    expect(result.current.add('purpose', { name: '   ' })).toEqual({ ok: false, reason: 'name_length' });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('no settings row or no user: empty lists and not_found', async () => {
    mockRow = null;
    const a = await renderHook(() => useOwnOptions());
    expect(a.result.current.itemTypes).toEqual([]);
    expect(a.result.current.add('purpose', { name: 'X' })).toEqual({ ok: false, reason: 'not_found' });
    mockRow = { custom_options: null };
    mockUser = null;
    const b = await renderHook(() => useOwnOptions());
    expect(b.result.current.add('purpose', { name: 'X' })).toEqual({ ok: false, reason: 'not_found' });
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('ItemTypeChips with own kinds', () => {
  it('shows own kinds after the presets and selects one', async () => {
    mockRow = { custom_options: { v: 1, itemTypes: live(1, 'itemTypes'), purposes: [] } };
    const onSelect = jest.fn();
    await render(<Wrap><ItemTypeChips selected={{ kind: 'preset', value: 'general' }} onSelect={onSelect} /></Wrap>);
    await fireEvent.press(screen.getByText('Kind 0'));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'custom', id: 'i0' });
  });

  it('adds Bike counting like Vehicle and selects it at once', async () => {
    const onSelect = jest.fn();
    await render(<Wrap><ItemTypeChips selected={{ kind: 'preset', value: 'general' }} onSelect={onSelect} /></Wrap>);
    await fireEvent.press(screen.getByText('+ Your own'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Bike');
    await fireEvent.press(screen.getAllByText('Vehicle').at(-1) as never);
    await fireEvent.press(screen.getByText('Save'));
    expect(mockSave.mock.calls[0][0].patch.custom_options.itemTypes[0]).toMatchObject({ name: 'Bike', base: 'vehicle' });
    expect(onSelect).toHaveBeenCalledWith({ kind: 'custom', id: 'new-id' });
  });

  it('Save is inert for an empty name; a taken name keeps the sheet open with the reason', async () => {
    mockRow = { custom_options: { v: 1, itemTypes: live(1, 'itemTypes'), purposes: [] } };
    const onSelect = jest.fn();
    await render(<Wrap><ItemTypeChips selected={{ kind: 'preset', value: 'general' }} onSelect={onSelect} /></Wrap>);
    await fireEvent.press(screen.getByText('+ Your own'));
    await fireEvent.press(screen.getByText('Save'));
    expect(mockSave).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'kind 0');
    await fireEvent.press(screen.getByText('Save'));
    expect(screen.getByText('That name is already in your list.')).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Other');
    expect(screen.queryByText('That name is already in your list.')).toBeNull();
    await fireEvent.press(screen.getByText('Cancel'));
  });

  it('at 10 own kinds the chip says the limit and opens no sheet', async () => {
    mockRow = { custom_options: { v: 1, itemTypes: live(10, 'itemTypes'), purposes: [] } };
    await render(<Wrap><ItemTypeChips selected={{ kind: 'preset', value: 'general' }} onSelect={jest.fn()} /></Wrap>);
    await fireEvent.press(screen.getByText('+ Your own'));
    expect(screen.getByText('You have 10 of your own. Remove one to add another.')).toBeTruthy();
    expect(screen.queryByText('Your own kind of purchase')).toBeNull();
  });

  it('read-only hides the add chip; a deleted own kind shows as a read-only selected chip', async () => {
    mockRow = { custom_options: { v: 1, itemTypes: [{ id: 'gone', name: 'Canoe', base: 'general', questionIds: [], ownQuestions: [], deletedAt: '2026-01-01' }], purposes: [] } };
    const onSelect = jest.fn();
    await render(<Wrap><ItemTypeChips selected={{ kind: 'custom', id: 'gone' }} onSelect={onSelect} readOnly /></Wrap>);
    expect(screen.queryByText('+ Your own')).toBeNull();
    await fireEvent.press(screen.getByText('Canoe'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a caller-supplied list is used as given', async () => {
    await render(<Wrap><ItemTypeChips selected={{ kind: 'preset', value: 'general' }} custom={[{ id: 'z', label: 'Zed' }]} onSelect={jest.fn()} /></Wrap>);
    expect(screen.getByText('Zed')).toBeTruthy();
  });
});

describe('PurposeBlock with own purposes', () => {
  it('lists own purposes, adds one and selects it; no emergency follow-up for it', async () => {
    mockRow = { custom_options: { v: 1, itemTypes: [], purposes: live(1, 'purposes') } };
    const edit = jest.fn();
    const check = emptyCheck();
    await render(<Wrap><PurposeBlock check={check} edit={edit} /></Wrap>);
    await fireEvent.press(screen.getByLabelText('Purpose 0'));
    expect(edit.mock.calls[0][0].purpose).toEqual({ kind: 'custom', id: 'p0' });
    await fireEvent.press(screen.getByLabelText('+ Your own'));
    await fireEvent.changeText(screen.getByLabelText('Name'), 'For the kids');
    await fireEvent.press(screen.getByText('Save'));
    expect(mockSave.mock.calls[0][0].patch.custom_options.purposes[1]).toMatchObject({ name: 'For the kids' });
    expect(edit.mock.calls[1][0].purpose).toEqual({ kind: 'custom', id: 'new-id' });
  });

  it('an own purpose is selected without the emergency tile', async () => {
    mockRow = { custom_options: { v: 1, itemTypes: [], purposes: live(1, 'purposes') } };
    const check = withPurpose(emptyCheck(), { kind: 'custom', id: 'p0' });
    await render(<Wrap><PurposeBlock check={check} edit={jest.fn()} /></Wrap>);
    expect(screen.queryByTestId('emergency-tile')).toBeNull();
    expect(screen.getByLabelText('Purpose 0').props.accessibilityState.checked).toBe(true);
  });

  it('at 10 own purposes the chip says the limit', async () => {
    mockRow = { custom_options: { v: 1, itemTypes: [], purposes: live(10, 'purposes') } };
    await render(<Wrap><PurposeBlock check={emptyCheck()} edit={jest.fn()} /></Wrap>);
    await fireEvent.press(screen.getByLabelText('+ Your own'));
    expect(screen.getByText('You have 10 of your own. Remove one to add another.')).toBeTruthy();
  });

  it('read-only hides the add chip; a deleted own purpose is a disabled selected chip', async () => {
    mockRow = { custom_options: { v: 1, itemTypes: [], purposes: [{ id: 'gone', name: 'Old purpose', deletedAt: '2026-01-01' }] } };
    const check = withPurpose(emptyCheck(), { kind: 'custom', id: 'gone' });
    await render(<Wrap><PurposeBlock check={check} edit={jest.fn()} readOnly /></Wrap>);
    expect(screen.queryByLabelText('+ Your own')).toBeNull();
    expect(screen.getByLabelText('Old purpose').props.accessibilityState).toMatchObject({ checked: true, disabled: true });
  });
});
