/** Plan 05.3-108 (UAT gap 28 re-check): a fresh '+ Your own' add with Vehicle chosen saves base 'vehicle' and selects the new kind. */
import React, { useEffect, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ItemTypeRef } from '@/engine/decide/v3';
import { Wrap } from '../../layers/__tests__/harness';
import { ItemTypeChips } from '../ItemTypeChips';

jest.setTimeout(60000);

const mockSave = jest.fn();
let mockRow: Record<string, unknown> | null = null;
let mockIds = 0;

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: false, ready: true }),
}));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: mockRow }) }));
jest.mock('@/data/mutations/decideSetup', () => ({
  // Mirrors the real onMutate: the settings cache is patched at once, even when the write itself is queued.
  useSaveSetupStep: () => ({ save: (args: { patch: { custom_options: unknown } }) => mockSave(args) }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockIds}` }));

let selectedRef: ItemTypeRef = { kind: 'preset', value: 'vehicle' };

function Host(): React.JSX.Element {
  const [sel, setSel] = useState<ItemTypeRef>({ kind: 'preset', value: 'vehicle' });
  useEffect(() => {
    selectedRef = sel;
  }, [sel]);
  return <ItemTypeChips selected={sel} onSelect={setSel} />;
}

beforeEach(() => {
  mockIds = 0;
  mockRow = { custom_options: null };
  mockSave.mockReset().mockImplementation((args: { patch: { custom_options: unknown } }) => {
    mockRow = { custom_options: args.patch.custom_options };
    return { stepId: 's1' };
  });
});

async function addBike(): Promise<void> {
  await fireEvent.press(screen.getByText('+ Your own'));
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Bike');
  // The sheet's Vehicle chip is the last one in the tree (the check's own chip is behind the sheet).
  await fireEvent.press(screen.getAllByText('Vehicle').at(-1) as never);
  await fireEvent.press(screen.getByText('Save'));
}

describe('fresh own kind with Vehicle', () => {
  it('saves base vehicle and selects the new kind', async () => {
    await render(<Wrap><Host /></Wrap>);
    await addBike();
    const items = mockSave.mock.calls[0][0].patch.custom_options.itemTypes;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Bike', base: 'vehicle' });
    expect(selectedRef).toEqual({ kind: 'custom', id: items[0].id });
    expect(screen.getByText('Bike')).toBeTruthy();
  });

  it('still selects it when the write is queued (no step returned)', async () => {
    mockSave.mockImplementation((args: { patch: { custom_options: unknown } }) => {
      mockRow = { custom_options: args.patch.custom_options };
      return null;
    });
    await render(<Wrap><Host /></Wrap>);
    await addBike();
    expect(mockSave.mock.calls[0][0].patch.custom_options.itemTypes[0]).toMatchObject({ name: 'Bike', base: 'vehicle' });
    expect(selectedRef).toEqual({ kind: 'custom', id: 'id-1' });
  });

  it('a second open starts as a new add (empty name, General), and Cancel resets', async () => {
    await render(<Wrap><Host /></Wrap>);
    await addBike();
    await fireEvent.press(screen.getByText('+ Your own'));
    expect(screen.getByLabelText('Name').props.value).toBe('');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Scooter');
    await fireEvent.press(screen.getAllByText('Vehicle').at(-1) as never);
    await fireEvent.press(screen.getByText('Cancel'));
    await fireEvent.press(screen.getByText('+ Your own'));
    expect(screen.getByLabelText('Name').props.value).toBe('');
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Boat');
    await fireEvent.press(screen.getByText('Save'));
    const last = mockSave.mock.calls.at(-1)?.[0].patch.custom_options.itemTypes.find((i: { name: string }) => i.name === 'Boat');
    expect(last.base).toBe('general');
  });
});
