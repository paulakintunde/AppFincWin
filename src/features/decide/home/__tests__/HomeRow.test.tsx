import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { HomeRow } from '../HomeRow';

jest.setTimeout(30000);

const mockSelection = jest.fn();
jest.mock('@/ui/haptics', () => ({ hapticSelection: () => mockSelection(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));

let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockWidth = 402;
});

describe('HomeRow', () => {
  it('D-95 a quiet row reads label and value and fires a selection haptic', async () => {
    const onPress = jest.fn();
    await wrap(<HomeRow label="Open checks" value="3" onPress={onPress} />);
    const row = screen.getByLabelText('Open checks, 3');
    expect(row.props.accessibilityRole).toBe('button');
    await fireEvent.press(row);
    expect(mockSelection).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reads the label alone when there is no value, and shows the second line', async () => {
    await wrap(<HomeRow label="Add a change coming up" secondLine="2 changed since you looked" onPress={jest.fn()} isLast />);
    expect(screen.getByLabelText('Add a change coming up')).toBeTruthy();
    expect(screen.getByText('2 changed since you looked')).toBeTruthy();
  });

  it('has no line clamp, so a long label and value wrap at a narrow width', async () => {
    mockWidth = 320;
    await wrap(<HomeRow label="Lines you will not cross" value="5 of 5 set by you" onPress={jest.fn()} />);
    expect(screen.getByText('Lines you will not cross').props.numberOfLines).toBeUndefined();
    expect(screen.getByText('5 of 5 set by you').props.numberOfLines).toBeUndefined();
  });
});
