import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { CustomValueChips } from '../CustomValueChips';
import { SegmentedToggle } from '../SegmentedToggle';
import { SliderWithField } from '../SliderWithField';
import { RateInput } from '../RateInput';

jest.setTimeout(30000);

let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }),
}));
beforeEach(() => {
  mockWidth = 402;
});
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
    announce.mockClear();
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

const RANGE_WORDS = 'From $1.00 to $5,000.00';

function SliderHarness({ onValue }: { onValue?: (n: number) => void }) {
  const [value, setValue] = React.useState(50_000);
  return (
    <SliderWithField
      label="Deposit"
      value={value}
      sliderMin={0}
      sliderMax={100_000}
      step={5_000}
      typedMin={100}
      typedMax={500_000}
      rangeText={RANGE_WORDS}
      currency="USD"
      wholeUnits
      onChange={(n) => {
        onValue?.(n);
        setValue(n);
      }}
      sliderA11y="Deposit slider"
      fieldA11y="Deposit amount"
    />
  );
}

describe('SliderWithField', () => {
  it('D-71 a typed slider value is used exactly, not snapped', async () => {
    const onValue = jest.fn();
    const view = await wrap(<SliderHarness onValue={onValue} />);
    await fireEvent.changeText(view.getByLabelText('Deposit amount'), '123.45');
    expect(onValue).toHaveBeenLastCalledWith(12_345);
    expect(view.getByLabelText('Deposit slider').props.accessibilityValue).toMatchObject({ now: 12_345 });
    expect(view.queryByText('Above the slider’s range')).toBeNull();
  });

  it('D-71 beyond the track pins the thumb and says Above the slider’s range', async () => {
    const onValue = jest.fn();
    const view = await wrap(<SliderHarness onValue={onValue} />);
    await fireEvent.changeText(view.getByLabelText('Deposit amount'), '1500');
    expect(onValue).toHaveBeenLastCalledWith(150_000);
    expect(view.getByLabelText('Deposit slider').props.accessibilityValue).toMatchObject({ now: 100_000 });
    expect(view.getByText('Above the slider’s range')).toBeTruthy();
  });

  it('D-71 below the track says Below the slider’s range', async () => {
    const view = await wrap(
      <SliderWithField
        label="Wait"
        value={500}
        sliderMin={2_500}
        sliderMax={60_000}
        step={2_500}
        typedMin={100}
        typedMax={60_000}
        rangeText={RANGE_WORDS}
        currency="USD"
        wholeUnits={false}
        onChange={() => {}}
        sliderA11y="Wait slider"
        fieldA11y="Wait amount"
      />,
    );
    expect(view.getByText('Below the slider’s range')).toBeTruthy();
    expect(view.getByLabelText('Wait slider').props.accessibilityValue).toMatchObject({ now: 2_500 });
  });

  it('D-71 a typed value outside the range is not applied', async () => {
    const onValue = jest.fn();
    const view = await wrap(<SliderHarness onValue={onValue} />);
    await fireEvent.changeText(view.getByLabelText('Deposit amount'), '9999');
    expect(onValue).not.toHaveBeenCalled();
    expect(view.getByText(RANGE_WORDS).props.style.color).toBe('#8A5A1B');
    await fireEvent.changeText(view.getByLabelText('Deposit amount'), '400');
    expect(onValue).toHaveBeenLastCalledWith(40_000);
    expect(view.queryByText(RANGE_WORDS)).toBeNull();
    await fireEvent.changeText(view.getByLabelText('Deposit amount'), '');
    expect(view.queryByText(RANGE_WORDS)).toBeNull();
  });

  it('D-71 a drag snaps to whole currency units and clears the range warning', async () => {
    const onValue = jest.fn();
    const view = await wrap(<SliderHarness onValue={onValue} />);
    await fireEvent.changeText(view.getByLabelText('Deposit amount'), '9999');
    await fireEvent(view.getByLabelText('Deposit slider'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onValue).toHaveBeenLastCalledWith(55_000);
    expect(view.queryByText(RANGE_WORDS)).toBeNull();
  });

  it('D-76 the slider field stacks below 360 wide', async () => {
    const wide = await wrap(<SliderHarness />);
    expect(wide.getByLabelText('Deposit slider').parent?.props.style).toEqual(expect.objectContaining({ flex: 1 }));
    mockWidth = 320;
    const narrow = await wrap(<SliderHarness />);
    expect(narrow.getByLabelText('Deposit slider').parent?.props.style).toEqual(expect.objectContaining({ alignSelf: 'stretch' }));
  });
});

describe('RateInput bounds', () => {
  function RateHarness({ onValue }: { onValue?: (t: string) => void }) {
    const [text, setText] = React.useState('');
    return (
      <RateInput
        value={text}
        onChange={(n) => {
          onValue?.(n);
          setText(n);
        }}
        label="Rate"
        accessibilityLabel="APR"
        max="999.99"
        rangeText="0 to 999.99% a year"
      />
    );
  }

  it('R4 a rate keystroke above the max is refused and shows the range line', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    announce.mockClear();
    const onValue = jest.fn();
    const view = await wrap(<RateHarness onValue={onValue} />);
    await fireEvent.changeText(view.getByLabelText('APR'), '999');
    onValue.mockClear();
    await fireEvent.changeText(view.getByLabelText('APR'), '9999');
    expect(onValue).not.toHaveBeenCalled();
    expect(view.getByLabelText('APR').props.value).toBe('999');
    expect(view.getByText('0 to 999.99% a year').props.style.color).toBe('#8A5A1B');
    await fireEvent.changeText(view.getByLabelText('APR'), '9998');
    expect(announce).toHaveBeenCalledTimes(1);
    announce.mockRestore();
  });

  it('R4 the rate range line clears on the next valid keystroke', async () => {
    const view = await wrap(<RateHarness />);
    await fireEvent.changeText(view.getByLabelText('APR'), '1000');
    expect(view.queryByText('0 to 999.99% a year')).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('APR'), '99');
    expect(view.queryByText('0 to 999.99% a year')).toBeNull();
  });

  it('R4 without a max the field behaves as before', async () => {
    const onValue = jest.fn();
    const view = await wrap(<RateInput value="" onChange={onValue} label="Rate" accessibilityLabel="APR" />);
    await fireEvent.changeText(view.getByLabelText('APR'), '1000');
    expect(onValue).toHaveBeenCalledWith('1000');
  });
});

describe('CustomValueChips dark tone', () => {
  const SURFACE = '#FFFFFF';
  const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

  function DarkHarness({ initial }: { initial: number | null }) {
    const [value, setValue] = React.useState<number | null>(initial);
    return (
      <CustomValueChips tone="dark" presets={PRESETS} value={value} onChange={setValue} groupLabel="Over how many months" min={1} max={120} rangeText={RANGE} unitWord="months" />
    );
  }

  it('D-95 dark chips and toggles use the ink-card tokens', async () => {
    const view = await wrap(<DarkHarness initial={12} />);
    expect(flat(view.getByLabelText('12 months')).backgroundColor).toBe(SURFACE);
    expect(view.getAllByTestId('dark-tint').length).toBe(3); // 6, 24 and Custom
    expect(view.queryByTestId('accent-tint')).toBeNull();
    const toggle = await wrap(
      <SegmentedToggle dark options={[{ key: 'cash', label: 'Cash' }, { key: 'credit', label: 'Credit' }]} value="cash" onChange={jest.fn()} accessibilityLabel="Pay with" />
    );
    expect(toggle.getByTestId('dark-track')).toBeTruthy();
    expect(flat(toggle.getByLabelText('Cash')).backgroundColor).toBe(SURFACE);
    expect(flat(toggle.getByText('Cash')).color).toBe('#14150F');
    expect(flat(toggle.getByText('Credit')).color).toBe('#BFBEB4');
  });

  it('D-95 the dark out-of-range line is surface text', async () => {
    const view = await wrap(<DarkHarness initial={600} />);
    expect(flat(view.getByText(RANGE)).color).toBe(SURFACE);
    await fireEvent.press(view.getByText('600 months'));
    await fireEvent.changeText(view.getByLabelText(FIELD), '181');
    expect(flat(view.getByText(RANGE)).color).toBe(SURFACE);
  });
});
