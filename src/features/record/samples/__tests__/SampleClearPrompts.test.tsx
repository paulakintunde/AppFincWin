// 02.2-33 (D-11): the once-only first-real-save prompt.
import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { requestSampleClearPrompt, resetSamplePromptForTests } from '@/state/samplePrompt';
import { SampleClearPrompts } from '../SampleClearPrompts';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', today: '2026-10-09' }),
}));
const mockClear = jest.fn();
const mockDecline = jest.fn();
jest.mock('@/data/mutations/sampleData', () => ({
  useSampleData: () => ({ clear: mockClear, seed: jest.fn(), declinePrompt: mockDecline, pending: false }),
}));
const mockShowToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));

const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  resetSamplePromptForTests();
  mockClear.mockResolvedValue(true);
});

describe('SampleClearPrompts', () => {
  it('shows nothing until a save requests it', async () => {
    const { queryByText } = await render(wrap(<SampleClearPrompts />));
    expect(queryByText('Clear the sample figures?')).toBeNull();
  });

  it('Keep for now saves the answer and closes', async () => {
    const { getByText, queryByText } = await render(wrap(<SampleClearPrompts />));
    await act(async () => requestSampleClearPrompt());
    expect(getByText('Clear the sample figures?')).toBeTruthy();
    await fireEvent.press(getByText('Keep for now'));
    expect(mockDecline).toHaveBeenCalledTimes(1);
    expect(mockClear).not.toHaveBeenCalled();
    expect(queryByText('Clear the sample figures?')).toBeNull();
  });

  it('Clear them clears, closes and reports it', async () => {
    const { getByText, queryByText } = await render(wrap(<SampleClearPrompts />));
    await act(async () => requestSampleClearPrompt());
    await fireEvent.press(getByText('Clear them'));
    await waitFor(() => expect(mockClear).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(queryByText('Clear the sample figures?')).toBeNull());
    expect(mockShowToast).toHaveBeenCalledWith({ kind: 'info', text: { key: 'samples.cleared' } });
    expect(mockDecline).not.toHaveBeenCalled();
  });
});
