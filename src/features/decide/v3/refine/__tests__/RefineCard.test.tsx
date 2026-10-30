/** Plan 05.3-34: the home refine card. Shows only when refineHomeCard says so; Review pushes the route; Later snoozes 14 days with Undo. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { REFINE_HREF } from '../../nav/hrefs';
import { RefineCard } from '../RefineCard';

jest.setTimeout(60000);
const mockSnooze = jest.fn();
const mockPush = jest.fn();
const mockToast = jest.fn();
let mockRefine: { result: unknown; snoozed: boolean; asOf: string | null } = { result: null, snoozed: false, asOf: null };

jest.mock('../useRefine', () => ({ useRefine: () => mockRefine }));
jest.mock('@/data/mutations/decideSetup', () => ({ useStampRefine: () => ({ markShown: jest.fn(), snooze: mockSnooze }) }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u', householdId: 'h', today: '2026-10-30', homeCurrency: 'USD' }) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPush(h) }));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));

const card = (kind: string) => ({ kind, ref: null, month: null, current: null, suggested: null, noise: null });
const wrap = () =>
  render(
    <ThemeProvider>
      <RefineCard />
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockSnooze.mockReturnValue({ stepId: 'step-1' });
});

describe('RefineCard', () => {
  it('shows nothing without cards', async () => {
    mockRefine = { result: { due: true, triggers: ['three_months'], cards: [] }, snoozed: false, asOf: '2026-10-30' };
    await wrap();
    expect(screen.queryByText('Decide can be sharper now')).toBeNull();
  });

  it('shows nothing while snoozed', async () => {
    mockRefine = { result: { due: true, triggers: ['three_months'], cards: [card('everyday')] }, snoozed: true, asOf: '2026-10-30' };
    await wrap();
    expect(screen.queryByText('Decide can be sharper now')).toBeNull();
  });

  it('shows the eyebrow, heading, one-thing body, Review and Later', async () => {
    mockRefine = { result: { due: true, triggers: ['three_months'], cards: [card('everyday')] }, snoozed: false, asOf: '2026-10-30' };
    await wrap();
    expect(screen.getByText('3 months of records')).toBeTruthy();
    expect(screen.getByText('Decide can be sharper now')).toBeTruthy();
    expect(screen.getByText(/1 thing to check/)).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('Later')).toBeTruthy();
  });

  it('uses the many-things body for several cards', async () => {
    mockRefine = { result: { due: true, triggers: ['life_change'], cards: [card('everyday'), card('pay')] }, snoozed: false, asOf: '2026-10-30' };
    await wrap();
    expect(screen.getByText('New in your records')).toBeTruthy();
    expect(screen.getByText(/2 things to check/)).toBeTruthy();
  });

  it('Review pushes the review route', async () => {
    mockRefine = { result: { due: true, triggers: ['three_months'], cards: [card('everyday')] }, snoozed: false, asOf: '2026-10-30' };
    await wrap();
    await fireEvent.press(screen.getByText('Review'));
    expect(mockPush).toHaveBeenCalledWith(REFINE_HREF);
  });

  it('Later snoozes to today plus 14 days and offers Undo', async () => {
    mockRefine = { result: { due: true, triggers: ['three_months'], cards: [card('everyday')] }, snoozed: false, asOf: '2026-10-30' };
    await wrap();
    await fireEvent.press(screen.getByText('Later'));
    expect(mockSnooze).toHaveBeenCalledWith('2026-11-13');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-1' }));
  });
});
