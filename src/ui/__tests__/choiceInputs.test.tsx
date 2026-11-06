// 05.4-39 (D-156): CheckRow and SegmentedToggle tests, split from decide's choicePrimitives.test.tsx when the parts moved to src/ui.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { CheckRow } from '../CheckRow';
import { SegmentedToggle } from '../SegmentedToggle';
import { hapticSelection } from '@/ui/haptics';

jest.setTimeout(30000);

jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const haptic = hapticSelection as jest.Mock;

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

beforeEach(() => {
  haptic.mockClear();
});

describe('CheckRow', () => {
  it('is a checkbox that toggles and removes through separate 44px targets', async () => {
    const onToggle = jest.fn();
    const onRemove = jest.fn();
    const { getByRole, getByLabelText } = await wrap(
      <CheckRow
        checked
        onToggle={onToggle}
        name="Rent"
        source="Recurring"
        amount="£900"
        onRemove={onRemove}
        removeA11yLabel="Remove Rent"
      />,
    );
    const box = getByRole('checkbox');
    expect(box.props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(box);
    expect(onToggle).toHaveBeenCalledTimes(1);
    const remove = getByLabelText('Remove Rent');
    expect(JSON.stringify(remove.props.style)).toContain('44');
    await fireEvent.press(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('ignores toggles when disabled', async () => {
    const onToggle = jest.fn();
    const { getByRole } = await wrap(
      <CheckRow checked={false} disabled onToggle={onToggle} name="Rent" amount="£900" removeA11yLabel="Remove" />,
    );
    await fireEvent.press(getByRole('checkbox'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('SegmentedToggle', () => {
  const options = [
    { key: 'quick', label: 'Quick' },
    { key: 'full', label: 'Full', a11yLabel: 'Full check' },
  ];

  it('is a radiogroup of radios with checked state and ticks on change only', async () => {
    const onChange = jest.fn();
    const { getAllByRole, getByLabelText } = await wrap(
      <SegmentedToggle options={options} value="quick" onChange={onChange} accessibilityLabel="Check type" />,
    );
    expect(getByLabelText('Check type').props.accessibilityRole).toBe('radiogroup');
    const radios = getAllByRole('radio');
    expect(radios[0]!.props.accessibilityState).toMatchObject({ checked: true });
    expect(radios[1]!.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(radios[0]!);
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(getByLabelText('Full check'));
    expect(onChange).toHaveBeenCalledWith('full');
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it('swaps ink and surface when dark', async () => {
    const { getAllByRole } = await wrap(
      <SegmentedToggle dark options={options} value="quick" onChange={jest.fn()} accessibilityLabel="Check type" />,
    );
    expect(JSON.stringify(getAllByRole('radio')[0]!.props.style)).toContain('#FFFFFF');
  });
});
