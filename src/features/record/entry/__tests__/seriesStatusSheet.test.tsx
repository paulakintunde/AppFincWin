// 05.2-44 (D-24): the Stopped / Paused / Resume sheet: stop, pause, resume, date refusals, text fit.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { RecurringSeriesRow } from '@/db/rows';
import { wrap } from '@/features/decide/check/steps/__tests__/helpers/stepProps';
import { SeriesStatusHost } from '../SeriesStatusSheet';
import { openSeriesStatus, resetSeriesStatusHostForTests } from '../seriesStatusHost';

jest.setTimeout(30000);
let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));

const mockStop = jest.fn((_s: unknown, _d: string, _o: string) => 'step-stop');
const mockPause = jest.fn((_s: unknown, _d: string, _o: string) => 'step-pause');
const mockResume = jest.fn((_s: unknown, _d: string, _o: string) => 'step-resume');
const mockToast = jest.fn();
jest.mock('@/data/mutations/recurringSeries', () => ({
  useSetSeriesStatus: () => ({
    stop: (s: unknown, d: string, o: string) => mockStop(s, d, o),
    pause: (s: unknown, d: string, o: string) => mockPause(s, d, o),
    resume: (s: unknown, d: string, o: string) => mockResume(s, d, o),
  }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-28', timeZone: 'UTC', showCents: false }),
}));

// The native picker cannot run here: a pressable stands in, setting the date a test chose.
let mockPicked = '2026-10-28';
jest.mock('../pickers/DateField', () => ({
  DateField: ({ label, display, onChange }: { label: string; display: string; onChange: (d: string) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pressable: P, Text: T } = require('react-native');
    return (
      <P accessibilityRole="button" accessibilityLabel={label} onPress={() => onChange(mockPicked)}>
        <T>{`${label}: ${display}`}</T>
      </P>
    );
  },
}));

const series = (over: Partial<RecurringSeriesRow> = {}): RecurringSeriesRow =>
  ({
    id: 's1',
    household_id: 'h1',
    name: 'Rent',
    amount: -120000,
    currency: 'USD',
    anchor_date: '2026-01-05',
    end_date: null,
    end_reason: null,
    version: 3,
    ...over,
  }) as RecurringSeriesRow;

function propsOf(node: unknown, prop: string): unknown[] {
  if (node === null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((n) => propsOf(n, prop));
  const n = node as { props?: Record<string, unknown>; children?: unknown };
  const own = n.props && prop in n.props ? [n.props[prop]] : [];
  return [...own, ...propsOf(n.children, prop)];
}

async function open(s: RecurringSeriesRow) {
  await wrap(<SeriesStatusHost />, mockScale);
  await act(async () => {
    openSeriesStatus(s);
  });
}

beforeEach(() => {
  mockWidth = 402;
  mockScale = 1;
  mockPicked = '2026-10-28';
  [mockStop, mockPause, mockResume, mockToast].forEach((m) => m.mockClear());
  resetSeriesStatusHostForTests();
});

describe('live series', () => {
  it('Save is disabled until a choice is made', async () => {
    await open(series());
    expect(screen.getByText('Past months stay as recorded.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    expect(mockStop).not.toHaveBeenCalled();
    expect(mockPause).not.toHaveBeenCalled();
  });

  it('Stopped writes from the chosen date and toasts with the step id', async () => {
    await open(series());
    await fireEvent.press(screen.getByLabelText('Stopped'));
    await fireEvent.press(screen.getByText('Save'));
    expect(mockStop).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), '2026-10-28', 'u1');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'destructive', stepId: 'step-stop', text: { key: 'undo.label.seriesStopped', params: { name: 'Rent' } } })
    );
    expect(screen.queryByText('Past months stay as recorded.')).toBeNull();
  });

  it('Paused writes a pause with the seriesPaused toast', async () => {
    await open(series());
    await fireEvent.press(screen.getByLabelText('Paused'));
    await fireEvent.press(screen.getByText('Save'));
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-pause', text: { key: 'undo.label.seriesPaused', params: { name: 'Rent' } } }));
  });

  it('refuses a date at or before the start', async () => {
    await open(series());
    mockPicked = '2026-01-05';
    await fireEvent.press(screen.getByLabelText('From'));
    await fireEvent.press(screen.getByLabelText('Stopped'));
    expect(screen.getByText('This date is before it started.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    expect(mockStop).not.toHaveBeenCalled();
  });

  it('refuses a date more than 12 months back', async () => {
    await open(series({ anchor_date: '2020-01-01' }));
    mockPicked = '2025-09-30';
    await fireEvent.press(screen.getByLabelText('From'));
    await fireEvent.press(screen.getByLabelText('Paused'));
    expect(screen.getByText('This date is more than 12 months ago.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    expect(mockPause).not.toHaveBeenCalled();
  });
});

describe('paused and stopped series', () => {
  it('a paused series shows Paused since and Resume writes the resume with the seriesResumed toast', async () => {
    await open(series({ end_date: '2026-09-30', end_reason: 'paused' }));
    expect(screen.getByText('Paused since Oct 1, 2026')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Resume').at(-1)!);
    expect(mockResume).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }), '2026-10-28', 'u1');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ordinary', stepId: 'step-resume', text: { key: 'undo.label.seriesResumed', params: { name: 'Rent' } } })
    );
  });

  it('a stopped series shows Stopped with no actions', async () => {
    await open(series({ end_date: '2026-09-30', end_reason: null }));
    expect(screen.getByText('Stopped Oct 1, 2026')).toBeTruthy();
    expect(screen.queryByText('Resume')).toBeNull();
    expect(screen.queryByText('Save')).toBeNull();
  });
});

describe('text fit', () => {
  it.each([
    [320, 1],
    [320, 2],
    [402, 1],
    [402, 2],
  ])('has no clipping props at %i dp and font scale %i', async (width, scale) => {
    mockWidth = width;
    mockScale = scale;
    await open(series({ name: 'A very long payment name that keeps going past a line' }));
    expect(propsOf(screen.toJSON(), 'numberOfLines')).toEqual([]);
    expect(propsOf(screen.toJSON(), 'adjustsFontSizeToFit')).toEqual([]);
    expect(screen.getByLabelText('Stopped')).toBeTruthy();
    expect(screen.getByLabelText('Paused')).toBeTruthy();
  });
});
