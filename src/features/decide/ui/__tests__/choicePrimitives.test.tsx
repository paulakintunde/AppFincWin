import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { StepBar } from '../StepBar';
import { ChoiceCard } from '../ChoiceCard';
import { hapticSelection } from '@/ui/haptics';

jest.setTimeout(30000);

jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const haptic = hapticSelection as jest.Mock;
const BODY = 'Detail';
const TITLES = ['Item', 'Price', 'Impact', 'Alternatives', 'Decision'] as const;

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

beforeEach(() => {
  haptic.mockClear();
});

describe('StepBar', () => {
  it('disables unreached segments and ignores presses on them', async () => {
    const onJump = jest.fn();
    const onBlocked = jest.fn();
    const { getByLabelText } = await wrap(
      <StepBar current={2} furthest={2} titles={TITLES} canEnter={() => true} onJump={onJump} onBlocked={onBlocked} />,
    );
    const step4 = getByLabelText('Step 4, Alternatives');
    expect(step4.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(step4);
    expect(onJump).not.toHaveBeenCalled();
    expect(onBlocked).not.toHaveBeenCalled();
    expect(haptic).not.toHaveBeenCalled();
  });

  it('jumps to a reached step that can be entered, with a haptic tick', async () => {
    const onJump = jest.fn();
    const { getByLabelText } = await wrap(
      <StepBar current={3} furthest={3} titles={TITLES} canEnter={() => true} onJump={onJump} />,
    );
    await fireEvent.press(getByLabelText('Step 1, Item'));
    expect(onJump).toHaveBeenCalledWith(1);
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it('D-08: a reached step 3+ that cannot be entered reports blocked and does not jump', async () => {
    const onJump = jest.fn();
    const onBlocked = jest.fn();
    const { getByLabelText } = await wrap(
      <StepBar
        current={1}
        furthest={4}
        titles={TITLES}
        canEnter={(s) => s < 3}
        onJump={onJump}
        onBlocked={onBlocked}
      />,
    );
    await fireEvent.press(getByLabelText('Step 4, Alternatives'));
    expect(onJump).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledWith(4);
    await fireEvent.press(getByLabelText('Step 2, Price'));
    expect(onJump).toHaveBeenCalledWith(2);
  });

  it('colours reached segments ink and unreached line3', async () => {
    const { getByTestId } = await wrap(
      <StepBar current={1} furthest={2} titles={TITLES} canEnter={() => true} onJump={jest.fn()} />,
    );
    const flat = (id: string) => JSON.stringify(getByTestId(id).props.style);
    expect(flat('step-segment-1')).toContain('#14150F');
    expect(flat('step-segment-5')).toContain('#E5E2D7');
  });
});

describe('ChoiceCard', () => {
  it('is a radio with checked state and ticks on press', async () => {
    const onPress = jest.fn();
    const { getByRole, getByText } = await wrap(
      <ChoiceCard selected title="Cash" flag="Pay now" accessibilityLabel="Cash, pay now" onPress={onPress}>
        <Text>{BODY}</Text>
      </ChoiceCard>,
    );
    const card = getByRole('radio');
    expect(card.props.accessibilityState).toMatchObject({ checked: true });
    expect(getByText('Pay now')).toBeTruthy();
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalled();
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it('reports unchecked when not selected', async () => {
    const { getByRole } = await wrap(
      <ChoiceCard selected={false} title="Cash" accessibilityLabel="Cash" onPress={jest.fn()} />,
    );
    expect(getByRole('radio').props.accessibilityState).toMatchObject({ checked: false });
  });
});
