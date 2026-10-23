import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import * as RN from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { CheckFlowHeader, type CheckFlowHeaderProps } from '../CheckFlowHeader';
import { wrap } from '../steps/__tests__/helpers/stepProps';

jest.setTimeout(60000);

let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticSuccess: jest.fn(), hapticWarning: jest.fn(), hapticLight: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: jest.fn(), focusAccessibility: jest.fn() }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() }, useRouter: () => ({ push: jest.fn() }) }));

const titles = ['Item', 'Price and how you pay', 'Impact', 'Alternatives', 'Decide'] as const;

function header(over: Partial<CheckFlowHeaderProps> = {}) {
  const props: CheckFlowHeaderProps = {
    step: 3,
    furthest: 3,
    title: titles[2],
    titles,
    canEnter: () => true,
    onJump: jest.fn(),
    onBlocked: jest.fn(),
    onBack: jest.fn(),
    titleRef: { current: null },
    combine: null,
    ...over,
  };
  return <CheckFlowHeader {...props} />;
}

beforeEach(() => {
  mockWidth = 402;
});

describe('the check header (D-73, D-76, D-77)', () => {
  it('D-77 the save status sits beside the eyebrow, not inside it', async () => {
    await wrap(header({ saveStatus: 'saved' }));
    expect(screen.getByText('Step 3 of 5')).toBeTruthy();
    const status = screen.getByText('Saved');
    expect(status).toBeTruthy();
    expect(screen.queryByText('Step 3 of 5 Saved')).toBeNull();
    expect(RN.StyleSheet.flatten(status.props.style)).toEqual(expect.objectContaining({ fontSize: 10.5 }));
    expect(RN.StyleSheet.flatten(status.props.style)).not.toHaveProperty('textTransform');
    expect(status.props.accessibilityLiveRegion).toBeUndefined();
  });

  it('D-77 each status has its words, and Not saved is warn1', async () => {
    const view = await wrap(header({ saveStatus: 'saving' }));
    expect(screen.getByText('Saving…')).toBeTruthy();
    await view.rerender(header({ saveStatus: 'offline' }));
    expect(screen.getByText('Offline, will save')).toBeTruthy();
    await view.rerender(header({ saveStatus: 'failed' }));
    expect(RN.StyleSheet.flatten(screen.getByText('Not saved').props.style).color).toBe('#8A5A1B');
    await view.rerender(header({ saveStatus: null }));
    expect(screen.queryByText('Not saved')).toBeNull();
  });

  it('D-73 Clear shows only when onClear is given', async () => {
    const onClear = jest.fn();
    const view = await wrap(header());
    expect(screen.queryByLabelText('Clear this check')).toBeNull();
    await view.rerender(header({ onClear }));
    await fireEvent.press(screen.getByLabelText('Clear this check'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Clear this check').props.accessibilityHint).toBe('Discards this check and starts an empty one');
    await view.rerender(header({ onClear: null }));
    expect(screen.queryByLabelText('Clear this check')).toBeNull();
  });

  it('D-70 the combine pill explains itself on long-press and by its about action', async () => {
    const onChange = jest.fn();
    await wrap(header({ combine: { value: true, onChange } }));
    const pill = screen.getByRole('switch');
    expect(pill.props.accessibilityActions).toEqual([expect.objectContaining({ name: 'about' })]);
    await fireEvent.press(pill);
    expect(onChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText(/counted as if they were bought too/)).toBeNull();
    await act(async () => {
      await fireEvent(pill, 'longPress');
    });
    expect(screen.getByText(/counted as if they were bought too/)).toBeTruthy();
  });

  it('D-76 the flow title is not clamped and the right slot wraps below 360 wide', async () => {
    const long = 'A very long step title that has to wrap onto a second line';
    const view = await wrap(header({ title: long, onClear: jest.fn() }));
    expect(screen.getByText(long).props.numberOfLines).toBeUndefined();
    const wide = RN.StyleSheet.flatten(screen.getByTestId('check-header-right').props.style);
    expect(wide.alignSelf).toBeUndefined();
    mockWidth = 340;
    await view.rerender(header({ title: long, onClear: jest.fn() }));
    const stacked = RN.StyleSheet.flatten(screen.getByTestId('check-header-right').props.style);
    expect(stacked.alignSelf).toBe('flex-end');
  });
});
