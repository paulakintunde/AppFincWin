// 02.2-33 (UI-SPEC 11): banner visibility, the Start fresh confirm and the clear outcome.
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { SampleBanner } from '../SampleBanner';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

let mockHasSamples = true;
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', today: '2026-10-09', hasSamples: mockHasSamples }),
}));
const mockClear = jest.fn();
jest.mock('@/data/mutations/sampleData', () => ({
  useSampleData: () => ({ clear: mockClear, seed: jest.fn(), declinePrompt: jest.fn(), pending: false }),
}));
const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  mockHasSamples = true;
  mockClear.mockResolvedValue(true);
});

describe('SampleBanner', () => {
  it('renders nothing when no sample rows exist', async () => {
    mockHasSamples = false;
    const { queryByText } = await render(wrap(<SampleBanner />));
    expect(queryByText('These are sample figures')).toBeNull();
  });

  it('shows the banner copy and a Start fresh button', async () => {
    const { getByText } = await render(wrap(<SampleBanner />));
    expect(getByText('These are sample figures')).toBeTruthy();
    expect(getByText('Look around, then clear them to start with your own.')).toBeTruthy();
    expect(getByText('Start fresh')).toBeTruthy();
  });

  it('Start fresh asks first; confirming clears and reports it', async () => {
    const { getByText, queryByText } = await render(wrap(<SampleBanner />));
    expect(queryByText('Start fresh?')).toBeNull();
    await fireEvent.press(getByText('Start fresh'));
    expect(getByText('Start fresh?')).toBeTruthy();
    expect(mockClear).not.toHaveBeenCalled();
    await fireEvent.press(getByText('Clear sample figures'));
    await waitFor(() => expect(mockClear).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith({ kind: 'info', text: { key: 'samples.cleared' } }));
  });

  it('Cancel closes the confirm without clearing', async () => {
    const { getByText, queryByText } = await render(wrap(<SampleBanner />));
    await fireEvent.press(getByText('Start fresh'));
    await fireEvent.press(getByText('Cancel'));
    expect(queryByText('Start fresh?')).toBeNull();
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('a failed clear shows the failure message', async () => {
    mockClear.mockResolvedValue(false);
    const { getByText } = await render(wrap(<SampleBanner />));
    await fireEvent.press(getByText('Start fresh'));
    await fireEvent.press(getByText('Clear sample figures'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith({ kind: 'info', text: { key: 'samples.clearFailed' } }));
  });
});
