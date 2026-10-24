// 05-101 (D-87, R16.3): running-cost rows show where the amount goes and what counts.
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { Step2PriceAndPay, type Step2Props } from '../Step2PriceAndPay';
import { computeCheck } from '../../../snapshot/computeCheck';
import type { CheckInputs } from '../../../snapshot/types';
import { loggedSource } from '../../../snapshot/__tests__/helpers/snapshotFixtures';
import { buy, stepProps, wrap } from './helpers/stepProps';

jest.setTimeout(30000);
const mockFocus = jest.fn();
// A TextInput whose focus() is observable: the jest host input has no native focus to watch.
jest.mock('@/ui/TextInput', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { TextInput: RNTextInput } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    TextInput: R.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      R.useImperativeHandle(ref, () => ({ focus: mockFocus }));
      return R.createElement(RNTextInput, props);
    }),
  };
});
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('../../useEstimateBias', () => ({ useEstimateBias: () => ({ running: null, payment: null, dayOne: null }) }));

const source = loggedSource();

function Harness({ initial, onUpdate }: { initial: CheckInputs; onUpdate?: (p: Partial<CheckInputs>) => void }) {
  const [inputs, setInputs] = useState(initial);
  const update = (patch: Partial<CheckInputs>) => {
    onUpdate?.(patch);
    setInputs((cur) => ({ ...cur, ...patch }));
  };
  const props: Step2Props = { ...stepProps(inputs, { update }, source), computation: computeCheck(source, inputs), onSaveCardRate: jest.fn(), onSaveCardTerms: jest.fn() };
  return <Step2PriceAndPay {...props} />;
}

const EMPTY = 'Insurance, not counted yet; counted once an amount is typed.';

describe('running-cost rows (D-87)', () => {
  it('D-87 an empty row shows the dashed Amount field and counts nothing', async () => {
    const updates: Partial<CheckInputs>[] = [];
    await wrap(<Harness initial={buy({ itemType: 'vehicle' })} onUpdate={(p) => updates.push(p)} />);
    expect(screen.getByLabelText(EMPTY)).toBeTruthy();
    expect(screen.getAllByText('Counted once an amount is typed').length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText('Add amount')).toBeNull();
    expect(screen.queryByText('Type an amount to count it')).toBeNull();
    const field = screen.getByLabelText('Insurance amount');
    expect(field.props.placeholder).toBe('Amount');
    const pill = StyleSheet.flatten(field.parent?.props.style);
    expect(pill).toMatchObject({ borderWidth: 1.5, borderStyle: 'dashed', backgroundColor: 'transparent' });
    expect(updates).toHaveLength(0);
  });

  it('D-87 typing an amount checks the reserved checkbox without moving the field', async () => {
    await wrap(<Harness initial={buy({ itemType: 'vehicle' })} />);
    const column = () => screen.getByLabelText(EMPTY).parent?.children[0];
    expect(column()).toBeTruthy(); // the 44-wide column exists while empty
    await fireEvent.changeText(screen.getByLabelText('Insurance amount'), '120');
    const checkbox = screen.getByRole('checkbox', { name: 'Insurance, $120.00 a month, counted' });
    expect(checkbox.props.accessibilityState).toMatchObject({ checked: true });
    const pill = StyleSheet.flatten(screen.getByLabelText('Insurance amount').parent?.props.style);
    expect(pill).toMatchObject({ borderStyle: 'solid', backgroundColor: expect.any(String) });
    expect(pill.borderStyle).toBe('solid');
    // the field is the same mounted input (it kept focus and its text)
    expect(screen.getByLabelText('Insurance amount').props.value).toBe('120');
    // unchecking keeps the amount and reads Not counted
    await fireEvent.press(checkbox);
    expect(screen.getByRole('checkbox', { name: 'Insurance, $120.00, Not counted' }).props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByLabelText('Insurance amount').props.value).toBe('120');
    expect(screen.getAllByText('Not counted').length).toBeGreaterThan(0);
  });

  it('D-87 tapping the row focuses the field', async () => {
    mockFocus.mockClear();
    await wrap(<Harness initial={buy({ itemType: 'vehicle' })} />);
    await fireEvent.press(screen.getByText('Insurance'));
    expect(mockFocus).toHaveBeenCalledTimes(1);
  });

  it('D-87 loss of value has no checkbox', async () => {
    await wrap(<Harness initial={buy({ itemType: 'vehicle' })} />);
    expect(screen.getByText('Loss of value')).toBeTruthy();
    expect(screen.getByText('Not a monthly cash cost')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /^Loss of value/ })).toBeNull();
    const pill = StyleSheet.flatten(screen.getByLabelText('Loss of value, amount a month').parent?.props.style);
    expect(pill).toMatchObject({ borderStyle: 'dashed', borderWidth: 1.5 });
    await fireEvent.press(screen.getByLabelText('% a year'));
    const rate = StyleSheet.flatten(screen.getByLabelText('Loss of value, percent a year').parent?.props.style);
    expect(rate).toMatchObject({ borderStyle: 'dashed' });
  });
});
