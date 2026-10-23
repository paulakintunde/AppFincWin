/**
 * D-70 / R1 (review fix): a decided check keeps its inputs read-only through ReadOnlyScope, not through a region-level
 * pointerEvents="none" (which also blocked the ⓘ). The ⓘ stays active; every input, chip, slider and button stays inert.
 */
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Step1Item } from '../Step1Item';
import { Step2PriceAndPay } from '../Step2PriceAndPay';
import { Step4Alternatives } from '../Step4Alternatives';
import { Lock } from '../stepUi';
import { StepSlider } from '../../../ui/StepSlider';
import { buy, stepProps, wrap } from './helpers/stepProps';
import type { InputLine } from '../../../snapshot/types';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticLight: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('../../useEstimateBias', () => ({ useEstimateBias: () => ({ running: null, payment: null, dayOne: null }) }));

const REPLACED: InputLine = { id: 'rp-1', name: 'Parking', amount: 12_000, note: '', counted: true, seriesId: null, category: null };
const mockUpdate = (p: { update: unknown }) => p.update as jest.Mock;

async function opensSheetFor(term: string) {
  await act(async () => {
    fireEvent.press(screen.getAllByRole('button', { name: `About ${term}` })[0]!);
  });
  const close = await screen.findByRole('button', { name: 'Close' });
  await act(async () => {
    fireEvent.press(close);
  });
}

describe('a decided check (D-70)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ⓘ stays active on a decided check', async () => {
    const p1 = stepProps(buy({ replaces: [REPLACED] }), { readOnly: true });
    const view = await wrap(<Step1Item {...p1} recurringBills={[]} />);
    await opensSheetFor('Expenses it replaces');
    await view.unmount();

    const p2 = stepProps(buy({ runningCosts: [] }), { readOnly: true });
    await wrap(<Step2PriceAndPay {...p2} onSaveCardRate={jest.fn()} onSaveCardTerms={jest.fn()} />);
    await opensSheetFor('Net monthly change');
    expect(mockUpdate(p2)).not.toHaveBeenCalled();
  });

  it('the Lock itself does not block touch', async () => {
    const onPress = jest.fn();
    const { Pressable } = jest.requireActual('react-native') as typeof import('react-native');
    await wrap(
      <Lock locked>
        <Pressable accessibilityRole="button" accessibilityLabel="plain button" onPress={onPress} />
      </Lock>,
    );
    await fireEvent.press(screen.getByLabelText('plain button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('locked inputs stay read-only without region pointer blocking', async () => {
    // Step 1: a text input, a chip, a pill and a remove control
    const p1 = stepProps(buy({ replaces: [REPLACED] }), { readOnly: true });
    const view = await wrap(<Step1Item {...p1} recurringBills={[]} />);
    const name = screen.getByLabelText('What it is');
    expect(name.props.editable).toBe(false);
    await fireEvent.changeText(name, 'Sofa');
    await fireEvent.press(screen.getByText('An investment'));
    await fireEvent.press(screen.getByLabelText('Remove Parking'));
    expect(screen.getByLabelText('A purchase').props.accessibilityState).toMatchObject({ disabled: true });
    expect(mockUpdate(p1)).not.toHaveBeenCalled();
    await view.unmount();

    // Step 2: the Edit link, the add pill and a method card do nothing
    const p2 = stepProps(buy(), { readOnly: true });
    const view2 = await wrap(<Step2PriceAndPay {...p2} onSaveCardRate={jest.fn()} onSaveCardTerms={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Edit'));
    expect(p2.goToStep).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Edit').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByLabelText('On a card'));
    expect(mockUpdate(p2)).not.toHaveBeenCalled();
    await view2.unmount();

    // Step 4: the add-rate link does not open the rate field
    const p4 = stepProps(buy(), { readOnly: true });
    await wrap(<Step4Alternatives {...p4} />);
    await fireEvent.press(screen.getByLabelText('+ Add a rate'));
    expect(screen.queryByLabelText('Return, percent')).toBeNull();
    expect(mockUpdate(p4)).not.toHaveBeenCalled();
  });

  it('a locked slider cannot be moved', async () => {
    const onChange = jest.fn();
    await wrap(
      <Lock locked>
        <StepSlider value={50} min={0} max={100} step={10} onChange={onChange} accessibilityLabel="Amount" />
      </Lock>,
    );
    const slider = screen.getByLabelText('Amount');
    expect(slider.props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
