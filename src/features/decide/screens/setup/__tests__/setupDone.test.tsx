// 06.1-39: Setup done (D38): copy, no household line (D-03), the light tap, Back to Decide, and the tick (D-17) with Reduce Motion.
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { expectFits } from '@/test/textFitMatrix';
import { SetupDone } from '../SetupDone';
import { TICK_DRAW_MS, tickStartProgress } from '../../motion/TickDrawAnimated';

let mockReduced = false;
jest.mock('@/theme/motion', () => ({ ...jest.requireActual('@/theme/motion'), useReduceMotion: () => mockReduced }));
const mockLight = jest.fn();
jest.mock('@/ui/haptics', () => ({ hapticLight: () => mockLight(), hapticSelection: jest.fn() }));

beforeEach(() => {
  mockReduced = false;
  mockLight.mockClear();
});

describe('SetupDone', () => {
  it('says Done, lists where things live without a household line, and plays one light tap', async () => {
    await wrap(<SetupDone onBack={jest.fn()} />);
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('Decide now uses your records.')).toBeTruthy();
    expect(screen.getByText('Savings goals and your safety net live in Grow')).toBeTruthy();
    expect(screen.getByText('Loans live in Grow')).toBeTruthy();
    expect(screen.queryByText(/household/i)).toBeNull();
    expect(mockLight).toHaveBeenCalledTimes(1);
  });

  it('Back to Decide calls onBack', async () => {
    const onBack = jest.fn();
    await wrap(<SetupDone onBack={onBack} />);
    await fireEvent.press(screen.getByText('Back to Decide'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('draws the tick over 800 ms with one stroke and no text', async () => {
    expect(TICK_DRAW_MS).toBe(800);
    await wrap(<SetupDone onBack={jest.fn()} />);
    expect(screen.getByTestId('setup-done-tick-stroke', { includeHiddenElements: true })).toBeTruthy();
    expect(within(screen.getByTestId('setup-done-tick', { includeHiddenElements: true })).queryAllByText(/./, { includeHiddenElements: true })).toHaveLength(0);
  });

  it('Reduce Motion: the tick is drawn at once', async () => {
    mockReduced = true;
    await wrap(<SetupDone onBack={jest.fn()} />);
    expect(tickStartProgress(true)).toBe(1); // fully drawn on first paint, no timing started
    expect(tickStartProgress(false)).toBe(0);
    expect(screen.getByTestId('setup-done-tick-stroke', { includeHiddenElements: true })).toBeTruthy();
  });

  it('fits at large text', async () => {
    await wrap(<SetupDone onBack={jest.fn()} />, 2);
    expectFits();
  });
});
