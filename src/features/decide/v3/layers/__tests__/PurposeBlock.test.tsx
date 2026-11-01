/** Plan 05.3-40: D-10 purpose block: six labels in order, nothing selected, emergency follow-up. */
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { CheckV2 } from '@/engine/decide/v3';
import { emptyCheck, withPurpose } from '../../model/checkEdits';
import { PurposeBlock } from '../PurposeBlock';
import { Wrap } from './harness';

jest.setTimeout(60000);

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: false, ready: true }),
}));
const mockAdd = jest.fn();
let mockPurposes: { id: string; label: string }[] = [];
jest.mock('@/features/decide/v3/check/useOwnOptions', () => ({
  useOwnOptions: () => ({ itemTypes: [], purposes: mockPurposes, retired: new Map(), liveCount: { itemTypes: 0, purposes: 0 }, add: mockAdd }),
}));

beforeEach(() => {
  mockPurposes = [];
  mockAdd.mockReset();
});
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));

const ORDER = ['An investment in me', 'For work or income', 'A necessity', 'Nice to have', 'A treat', 'A luxury'];

function mount(check: CheckV2, edit = jest.fn()) {
  return { edit, ui: <Wrap><PurposeBlock check={check} edit={edit} /></Wrap> };
}

describe('PurposeBlock', () => {
  it('lists the six presets in the D-10 order with nothing selected', async () => {
    const { ui } = mount(emptyCheck());
    await render(ui);
    expect(screen.getByText('What is this for you?')).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.props.accessibilityLabel)).toEqual(ORDER);
    for (const r of radios) expect(r.props.accessibilityState.checked).toBe(false);
    expect(screen.queryByTestId('emergency-tile')).toBeNull();
  });

  it('selecting A treat stores the purpose and clears any emergency', async () => {
    const { ui, edit } = mount(emptyCheck());
    await render(ui);
    await fireEvent.press(screen.getByLabelText('A treat'));
    const next = edit.mock.calls[0][0] as CheckV2;
    expect(next.purpose).toEqual({ kind: 'preset', value: 'treat' });
    expect(next.emergency).toBe(false);
  });

  it('A necessity reveals the emergency question; Yes sets it and No is its own answer', async () => {
    const necessity = withPurpose(emptyCheck(), { kind: 'preset', value: 'necessity' });
    const { ui, edit } = mount(necessity);
    await render(ui);
    expect(screen.getByText('Is this an emergency, or replacing something broken?')).toBeTruthy();
    expect(screen.getByText('Only emergencies can use your emergency fund.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Yes, it’s an emergency'));
    expect((edit.mock.calls[0][0] as CheckV2).emergency).toBe(true);
    await fireEvent.press(screen.getByLabelText('No'));
    const no = edit.mock.calls[1][0] as CheckV2;
    expect(no.emergency).toBe(false);
    expect(no.layerAnswers['L1e.no']).toBe(true);
  });

  it('shows No selected after it was answered and the work purpose also asks', async () => {
    const base = withPurpose(emptyCheck(), { kind: 'preset', value: 'for_work' });
    const answered: CheckV2 = { ...base, layerAnswers: { 'L1e.no': true } };
    await render(mount(answered).ui);
    expect(screen.getByLabelText('No').props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText('For work or income').props.accessibilityState.checked).toBe(true);
  });

  it('a selected choice uses the ink fill and an unselected one does not', async () => {
    await render(mount(withPurpose(emptyCheck(), { kind: 'preset', value: 'luxury' })).ui);
    const bg = (label: string): unknown => {
      const style = screen.getByLabelText(label).props.style;
      const flat = StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) as { backgroundColor?: string };
      return flat.backgroundColor;
    };
    expect(bg('A luxury')).not.toBe(bg('A treat'));
  });
});

describe('05.3-118 (UAT gap 35): a just-added own purpose shows its own name', () => {
  function Host(): React.JSX.Element {
    const [check, setCheck] = useState<CheckV2>(emptyCheck());
    return <Wrap><PurposeBlock check={check} edit={setCheck} /></Wrap>;
  }

  async function addKids(): Promise<void> {
    await fireEvent.press(screen.getByText('+ Your own'));
    await fireEvent.changeText(screen.getByLabelText('Name'), '  For the kids ');
    await fireEvent.press(screen.getByText('Save'));
  }

  it('reads For the kids, selected, while the purposes list is not yet updated; then the cache takes over', async () => {
    mockAdd.mockReturnValue({ ok: true, id: 'kids' });
    const view = await render(<Host />);
    await addKids();
    expect(mockAdd).toHaveBeenCalledWith('purpose', { name: 'For the kids' });
    expect(screen.getByLabelText('For the kids').props.accessibilityState.checked).toBe(true);
    expect(screen.queryByText('A removed option')).toBeNull();
    mockPurposes = [{ id: 'kids', label: 'For the kids' }];
    await view.rerender(<Host />);
    expect(screen.getAllByLabelText('For the kids')).toHaveLength(1);
  });

  it('a refused add sets no local label', async () => {
    mockAdd.mockReturnValue({ ok: false, reason: 'name_taken' });
    await render(<Host />);
    await addKids();
    expect(screen.queryByLabelText('For the kids')).toBeNull();
    expect(screen.queryByText('A removed option')).toBeNull();
  });
});
