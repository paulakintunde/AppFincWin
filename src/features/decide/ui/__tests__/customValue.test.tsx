import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { CustomValueChips } from '../CustomValueChips';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const PRESETS = [6, 12, 24];
const RANGE = '1 to 120 months';

function Harness({ initial = 12, readOnly = false, onValue }: { initial?: number | null; readOnly?: boolean; onValue?: (n: number) => void }) {
  const [value, setValue] = React.useState<number | null>(initial);
  return (
    <CustomValueChips
      presets={PRESETS}
      value={value}
      onChange={(n) => {
        onValue?.(n);
        setValue(n);
      }}
      groupLabel="Over how many months"
      min={1}
      max={120}
      rangeText={RANGE}
      unitWord="months"
      readOnly={readOnly}
    />
  );
}

const FIELD = 'Over how many months, custom, months';

describe('CustomValueChips', () => {
  it('D-71 Custom opens an inline field with the range line', async () => {
    const view = await wrap(<Harness />);
    expect(view.queryByLabelText(FIELD)).toBeNull();
    await fireEvent.press(view.getByText('Custom'));
    expect(view.getByLabelText(FIELD)).toBeTruthy();
    expect(view.getByText(RANGE)).toBeTruthy();
    expect(view.getByText('months')).toBeTruthy();
  });

  it('D-71 a valid keystroke applies at once', async () => {
    const onValue = jest.fn();
    const view = await wrap(<Harness onValue={onValue} />);
    await fireEvent.press(view.getByText('Custom'));
    await fireEvent.changeText(view.getByLabelText(FIELD), '18');
    expect(onValue).toHaveBeenLastCalledWith(18);
    expect(view.getByText('18 months')).toBeTruthy();
  });

  it('D-71 an out-of-range value keeps the last value and warns', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const onValue = jest.fn();
    const view = await wrap(<Harness onValue={onValue} />);
    await fireEvent.press(view.getByText('Custom'));
    await fireEvent.changeText(view.getByLabelText(FIELD), '18');
    onValue.mockClear();
    await fireEvent.changeText(view.getByLabelText(FIELD), '181');
    expect(onValue).not.toHaveBeenCalled();
    expect(view.getByText('18 months')).toBeTruthy();
    expect(view.getByText(RANGE).props.style.color).toBe('#8A5A1B');
    expect(announce).toHaveBeenCalledTimes(1);
    // a further refused keystroke does not announce again; the next valid one clears the warning
    await fireEvent.changeText(view.getByLabelText(FIELD), '1810');
    expect(announce).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(view.getByLabelText(FIELD), '19');
    expect(view.getByText(RANGE).props.style.color).not.toBe('#8A5A1B');
    announce.mockRestore();
  });

  it('D-71 a typed preset selects the preset chip', async () => {
    const view = await wrap(<Harness initial={18} />);
    await fireEvent.press(view.getByText('18 months'));
    await fireEvent.changeText(view.getByLabelText(FIELD), '24');
    expect(view.getByText('24 months').props.style).toBeDefined();
    const chip = view.getByLabelText('24 months');
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
    expect(view.getByLabelText('Custom').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('D-71 a stored 600-month term shows under Custom with the range line', async () => {
    const onValue = jest.fn();
    const view = await wrap(<Harness initial={600} onValue={onValue} />);
    expect(view.getByLabelText('Custom, 600 months').props.accessibilityState).toMatchObject({ selected: true });
    expect(view.getByText(RANGE).props.style.color).toBe('#8A5A1B');
    expect(onValue).not.toHaveBeenCalled();
    await fireEvent.press(view.getByText('600 months'));
    expect(view.getByLabelText(FIELD).props.value).toBe('600');
    expect(onValue).not.toHaveBeenCalled();
  });

  it('D-71 a decimal mark is refused for months', async () => {
    const onValue = jest.fn();
    const view = await wrap(<Harness onValue={onValue} />);
    await fireEvent.press(view.getByText('Custom'));
    await fireEvent.changeText(view.getByLabelText(FIELD), '1');
    onValue.mockClear();
    await fireEvent.changeText(view.getByLabelText(FIELD), '1.5');
    expect(onValue).not.toHaveBeenCalled();
    expect(view.getByLabelText(FIELD).props.value).toBe('1');
  });

  it('D-71 an empty entry is dropped on close', async () => {
    const view = await wrap(<Harness initial={18} />);
    await fireEvent.press(view.getByText('18 months'));
    await fireEvent.changeText(view.getByLabelText(FIELD), '');
    await fireEvent(view.getByLabelText(FIELD), 'blur');
    expect(view.queryByLabelText(FIELD)).toBeNull();
    expect(view.getByText('18 months')).toBeTruthy();
  });

  it('D-71 an invalid entry is dropped on submit and the draft follows an outside change', async () => {
    const view = await wrap(<Harness initial={18} />);
    await fireEvent.press(view.getByText('18 months'));
    await fireEvent.changeText(view.getByLabelText(FIELD), '999');
    await fireEvent(view.getByLabelText(FIELD), 'submitEditing');
    expect(view.queryByLabelText(FIELD)).toBeNull();
    await fireEvent.press(view.getByText('6 months'));
    expect(view.getByLabelText('6 months').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(view.getByText('Custom'));
    await fireEvent.press(view.getByText('12 months'));
    expect(view.getByLabelText(FIELD).props.value).toBe('12');
  });

  it('D-71 read-only chips do not open the field', async () => {
    const view = await wrap(<Harness readOnly />);
    await fireEvent.press(view.getByText('Custom'));
    expect(view.queryByLabelText(FIELD)).toBeNull();
    expect(view.getByLabelText('6 months').props.accessibilityState).toMatchObject({ disabled: true });
  });
});
