import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { StyleSheet } from 'react-native';
import { SwipeRow, SWIPE_ACTION_WIDTH, zoneWidthFor } from '../SwipeRow';
import { hapticLight } from '../haptics';

jest.mock('../haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));

const mockCaptured: { props: Record<string, any>; close: jest.Mock } = { props: {}, close: jest.fn() };
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: R.forwardRef((props: any, ref: any) => {
      mockCaptured.props = props;
      R.useImperativeHandle(ref, () => ({ close: mockCaptured.close }));
      return <View>{props.children}</View>;
    }),
  };
});

jest.setTimeout(20000);

const left = { word: 'Pay', a11yLabel: 'Mark paid', tone: 'positive' as const, onCommit: jest.fn() };
const right = { word: 'Delete', a11yLabel: 'Delete entry', tone: 'danger' as const, onCommit: jest.fn() };

async function setup(props: Partial<React.ComponentProps<typeof SwipeRow>> = {}) {
  return render(
    <ThemeProvider>
      <SwipeRow left={left} right={right} onPress={jest.fn()} accessibilityLabel="Rent" {...props}>
        <Text>{'Row body'}</Text>
      </SwipeRow>
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
});

describe('SwipeRow', () => {
  it('renders children and exposes accessibility actions', async () => {
    const { getByText, getByLabelText } = await setup();
    expect(getByText('Row body')).toBeTruthy();
    expect(getByLabelText('Rent').props.accessibilityActions).toEqual([
      { name: 'left', label: 'Mark paid' },
      { name: 'right', label: 'Delete entry' },
      { name: 'activate', label: 'Rent' },
    ]);
  });

  it('accessibility actions commit once each', async () => {
    const { getByLabelText } = await setup();
    const el = getByLabelText('Rent');
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'left' } });
    expect(left.onCommit).toHaveBeenCalledTimes(1);
    await fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: 'right' } });
    expect(right.onCommit).toHaveBeenCalledTimes(1);
  });

  it('disabled omits swipe actions and disables the swipeable', async () => {
    const { getByLabelText } = await setup({ disabled: true });
    expect(mockCaptured.props.enabled).toBe(false);
    expect(getByLabelText('Rent').props.accessibilityActions).toEqual([{ name: 'activate', label: 'Rent' }]);
  });

  describe('long-press (D-63)', () => {
    it('offers a named select action after activate', async () => {
      const { getByLabelText } = await setup({ onLongPress: jest.fn(), longPressLabel: 'Select Rent' });
      expect(getByLabelText('Rent').props.accessibilityActions).toEqual([
        { name: 'left', label: 'Mark paid' },
        { name: 'right', label: 'Delete entry' },
        { name: 'activate', label: 'Rent' },
        { name: 'select', label: 'Select Rent' },
      ]);
    });

    it('the select accessibility action calls onLongPress once', async () => {
      const onLongPress = jest.fn();
      const { getByLabelText } = await setup({ onLongPress, longPressLabel: 'Select Rent' });
      await fireEvent(getByLabelText('Rent'), 'accessibilityAction', { nativeEvent: { actionName: 'select' } });
      expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it('long-press calls onLongPress and not onPress', async () => {
      const onLongPress = jest.fn();
      const onPress = jest.fn();
      const { getByText } = await setup({ onLongPress, onPress });
      await fireEvent(getByText('Row body'), 'longPress');
      expect(onLongPress).toHaveBeenCalledTimes(1);
      expect(onPress).not.toHaveBeenCalled();
    });

    it('disabled offers no select action and ignores long-press', async () => {
      const onLongPress = jest.fn();
      const { getByLabelText } = await setup({ onLongPress, longPressLabel: 'Select Rent', disabled: true });
      expect(getByLabelText('Rent').props.accessibilityActions).toEqual([{ name: 'activate', label: 'Rent' }]);
      // The select action is not offered, so a screen reader cannot trigger it either. (A touch
      // long-press is not asserted here: fireEvent would also find SwipeRow's own prop.)
      await fireEvent(getByLabelText('Rent'), 'accessibilityAction', { nativeEvent: { actionName: 'select' } });
      expect(onLongPress).not.toHaveBeenCalled();
    });

    it('without onLongPress there is no select action', async () => {
      const { getByLabelText } = await setup();
      expect(getByLabelText('Rent').props.accessibilityActions.map((a: { name: string }) => a.name)).not.toContain('select');
    });
  });

  it('renders the action words in the action zones', async () => {
    await setup();
    const l = await render(<ThemeProvider>{mockCaptured.props.renderLeftActions()}</ThemeProvider>);
    expect(await l.findByText('Pay', { includeHiddenElements: true })).toBeTruthy();
    const r = await render(<ThemeProvider>{mockCaptured.props.renderRightActions()}</ThemeProvider>);
    expect(await r.findByText('Delete', { includeHiddenElements: true })).toBeTruthy();
  });

  it('onSwipeableOpen right (left actions opened) commits left, haptic, closes', async () => {
    await setup();
    await act(async () => mockCaptured.props.onSwipeableOpen('right'));
    expect(left.onCommit).toHaveBeenCalledTimes(1);
    expect(right.onCommit).not.toHaveBeenCalled();
    expect(hapticLight).toHaveBeenCalledTimes(1);
    expect(mockCaptured.close).toHaveBeenCalledTimes(1);
  });

  it('onSwipeableOpen left commits the right action', async () => {
    await setup();
    await act(async () => mockCaptured.props.onSwipeableOpen('left'));
    expect(right.onCommit).toHaveBeenCalledTimes(1);
    expect(left.onCommit).not.toHaveBeenCalled();
  });

  it('keeps the action label on one line', async () => {
    await setup();
    const r = await render(<ThemeProvider>{mockCaptured.props.renderRightActions()}</ThemeProvider>);
    expect((await r.findByText('Delete', { includeHiddenElements: true })).props.numberOfLines).toBe(1);
  });

  it('grows the zone to fit a long label and drives the threshold from it', async () => {
    expect(zoneWidthFor(10)).toBe(SWIPE_ACTION_WIDTH);
    expect(zoneWidthFor(100)).toBe(116);
    await setup({ left: { ...left, word: 'Received' } });
    expect(mockCaptured.props.leftThreshold).toBe(SWIPE_ACTION_WIDTH);
    const l = await render(<ThemeProvider>{mockCaptured.props.renderLeftActions()}</ThemeProvider>);
    const label = await l.findByText('Received', { includeHiddenElements: true });
    await act(async () => label.props.onTextLayout({ nativeEvent: { lines: [{ width: 100 }] } }));
    expect(mockCaptured.props.leftThreshold).toBe(116);
    expect(mockCaptured.props.rightThreshold).toBe(SWIPE_ACTION_WIDTH);
    const l2 = await render(<ThemeProvider>{mockCaptured.props.renderLeftActions()}</ThemeProvider>);
    const zone = (await l2.findByText('Received', { includeHiddenElements: true })).parent!;
    expect(StyleSheet.flatten(zone.props.style).width).toBe(116);
  });
});
