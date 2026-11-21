// 08.1-21 (DCU-10): the "What answers rest on" card and the shared import prompt row.
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import type { StageReading } from '@/engine/decide/v3';
import { wrap } from '@/test/stepProps';
import { ImportPromptRow } from '../../ui/ImportPromptRow';
import { StageCard } from '../StageCard';

const mockReduced = { value: false };
jest.mock('@/theme/motion', () => {
  const actual = jest.requireActual('@/theme/motion');
  return {
    ...actual,
    useMotion: () => ({
      reduced: mockReduced.value,
      duration: (ms: number) => (mockReduced.value ? 0 : ms),
      easing: actual.EASING,
      fade: (ms: number) => ms,
    }),
  };
});
jest.mock('@/ui/haptics', () => ({ hapticTick: jest.fn(), hapticTap: jest.fn(), hapticWarn: jest.fn() }));

const reading = (stage: StageReading['stage'], monthsUsed: number): StageReading => ({
  stage,
  monthsUsed,
  windowUsed: 'records' as unknown as StageReading['windowUsed'],
  heldBackParts: [],
  nextUnlock: null,
});

let announce: jest.SpyInstance;
beforeEach(() => {
  mockReduced.value = false;
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});
afterEach(() => announce.mockRestore());

describe('ImportPromptRow', () => {
  it('first prompt at 0 months, press calls onPress', async () => {
    const onPress = jest.fn();
    await wrap(<ImportPromptRow monthsUsed={0} onPress={onPress} />);
    expect(screen.getByText('Import your last 3 statements')).toBeTruthy();
    expect(screen.getByText(/One month gives a full answer today/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('import-prompt'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('add-earlier prompt at 1 and 2 months', async () => {
    await wrap(<ImportPromptRow monthsUsed={2} onPress={() => undefined} />);
    expect(screen.getByText('Add earlier months')).toBeTruthy();
  });
  it('renders nothing at 3 months', async () => {
    await wrap(<ImportPromptRow monthsUsed={3} onPress={() => undefined} />);
    expect(screen.queryByTestId('import-prompt')).toBeNull();
  });
});

describe('StageCard', () => {
  it('first read: chip, sentence, empty bar of 3, complete line, import row', async () => {
    const onImport = jest.fn();
    await wrap(<StageCard reading={reading('first_read', 0)} monthsTotal={3} onImport={onImport} />);
    expect(screen.getByText('What answers rest on')).toBeTruthy();
    expect(screen.getByText('First read')).toBeTruthy();
    expect(screen.getByText(/Answers are a first read/)).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: /0 of 3 months of records/ }).props.accessibilityValue).toEqual({ min: 0, max: 3, now: 0 });
    expect(screen.getByText('Months complete enough to use: 0 of 3.')).toBeTruthy();
    expect(screen.getByText('Import your last 3 statements')).toBeTruthy();
    fireEvent.press(screen.getByTestId('import-prompt'));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it('full answer at 2 months: chip, bar 2, add earlier months', async () => {
    await wrap(<StageCard reading={reading('full', 2)} monthsTotal={3} onImport={() => undefined} />);
    expect(screen.getByText('Full answer')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: /2 of 3 months/ }).props.accessibilityValue.now).toBe(2);
    expect(screen.getByText('Add earlier months')).toBeTruthy();
  });

  it('deeper at 4 months: title and sentence only, no chip, bar or prompt', async () => {
    await wrap(<StageCard reading={reading('deeper', 4)} monthsTotal={4} onImport={() => undefined} />);
    expect(screen.getByText('What answers rest on')).toBeTruthy();
    expect(screen.getByText('Answers use your last 4 months of records, with every part on.')).toBeTruthy();
    expect(screen.queryByTestId('stage-chip')).toBeNull();
    expect(screen.queryByText('First read')).toBeNull();
    expect(screen.queryByText('Full answer')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByTestId('import-prompt')).toBeNull();
  });

  it('announces once when months rise, never on first mount', async () => {
    const view = await wrap(<StageCard reading={reading('first_read', 0)} monthsTotal={3} onImport={() => undefined} />);
    expect(announce).not.toHaveBeenCalled();
    await view.rerender(<StageCard reading={reading('full', 1)} monthsTotal={3} onImport={() => undefined} />);
    expect(announce).toHaveBeenCalledTimes(1);
    // 08.1-14 (FOLLOWUPS 21|14): one month is "1 month", never "1 months" (i18next _one / _other).
    expect(announce).toHaveBeenLastCalledWith('Decide now has 1\u00A0month of records. Full answer is on.');
    await view.rerender(<StageCard reading={reading('full', 1)} monthsTotal={3} onImport={() => undefined} />);
    expect(announce).toHaveBeenCalledTimes(1);
    await view.rerender(<StageCard reading={reading('full', 2)} monthsTotal={3} onImport={() => undefined} />);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith('Decide now has 2\u00A0months of records. Full answer is on.');
    await view.rerender(<StageCard reading={reading('deeper', 3)} monthsTotal={3} onImport={() => undefined} />);
    expect(announce).toHaveBeenCalledTimes(3);
    expect(announce).toHaveBeenLastCalledWith('Decide now has 3 months of records. Every part is on.');
  });

  it('does not announce when months fall', async () => {
    const view = await wrap(<StageCard reading={reading('full', 2)} monthsTotal={3} onImport={() => undefined} />);
    await view.rerender(<StageCard reading={reading('full', 1)} monthsTotal={3} onImport={() => undefined} />);
    expect(announce).not.toHaveBeenCalled();
  });

  it('chip swaps its word with and without Reduce Motion', async () => {
    const view = await wrap(<StageCard reading={reading('first_read', 0)} monthsTotal={3} onImport={() => undefined} />);
    await view.rerender(<StageCard reading={reading('full', 1)} monthsTotal={3} onImport={() => undefined} />);
    expect(screen.getByText('Full answer')).toBeTruthy();
    mockReduced.value = true;
    const reduced = await wrap(<StageCard reading={reading('first_read', 0)} monthsTotal={3} onImport={() => undefined} />);
    await reduced.rerender(<StageCard reading={reading('full', 1)} monthsTotal={3} onImport={() => undefined} />);
    expect(screen.getAllByText('Full answer').length).toBeGreaterThan(0);
  });
});
