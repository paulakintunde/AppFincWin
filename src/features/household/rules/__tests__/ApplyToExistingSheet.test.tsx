import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { ApplyToExistingSheet } from '../ApplyToExistingSheet';

jest.setTimeout(30000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));

const mockCount = jest.fn(async (..._a: unknown[]): Promise<{ ok: boolean; count?: number }> => ({ ok: true, count: 7 }));
const mockApply = jest.fn(async (..._a: unknown[]): Promise<{ ok: boolean; changed_count?: number; reason?: string }> => ({ ok: true, changed_count: 7 }));
jest.mock('@/db/transactionSplits', () => ({
  countUnsettledForRule: (...a: unknown[]) => mockCount(...a),
  applyRuleToUnsettled: (...a: unknown[]) => mockApply(...a),
}));

async function setup(onDone = jest.fn(), categoryRef: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ApplyToExistingSheet householdId="h" categoryRef={categoryRef} primaryLabelKey="household.rules.saveSplit" onDone={onDone} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return onDone;
}

beforeEach(() => {
  mockCount.mockReset();
  mockApply.mockReset();
  resetToastForTests();
  mockCount.mockResolvedValue({ ok: true, count: 7 });
  mockApply.mockResolvedValue({ ok: true, changed_count: 7 });
});

describe('ApplyToExistingSheet', () => {
  it('shows the exact server count and the settled note', async () => {
    await setup();
    expect(await screen.findByText('Also apply to the 7 unsettled lines')).toBeTruthy();
    expect(screen.getByText('Settled lines never change.')).toBeTruthy();
    expect(screen.getByText('Change the split?')).toBeTruthy();
    expect(mockCount).toHaveBeenCalledWith(expect.anything(), null);
  });

  it('hides the toggle when no unsettled line could change', async () => {
    mockCount.mockResolvedValue({ ok: true, count: 0 });
    await setup();
    await waitFor(() => expect(mockCount).toHaveBeenCalled());
    expect(screen.queryByText(/unsettled lines/)).toBeNull();
  });

  it('applies the rule with the toggle on and tells how many changed', async () => {
    const onDone = await setup(jest.fn(), 'builtin:Groceries');
    await screen.findByText('Also apply to the 7 unsettled lines');
    await fireEvent.press(screen.getByText('Save split'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockApply).toHaveBeenCalledWith(expect.anything(), 'builtin:Groceries');
    expect(getToast()?.text).toEqual({ key: 'household.rules.apply.applied', params: { count: 7 } });
  });

  it('applies nothing with the toggle off', async () => {
    const onDone = await setup();
    await screen.findByText('Also apply to the 7 unsettled lines');
    await fireEvent.press(screen.getByRole('switch'));
    await fireEvent.press(screen.getByText('Save split'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('applies nothing when the person keeps the current split', async () => {
    const onDone = await setup();
    await screen.findByText('Also apply to the 7 unsettled lines');
    await fireEvent.press(screen.getByText('Keep current split'));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('keeps the offer open and says so when the apply is refused', async () => {
    mockApply.mockResolvedValue({ ok: false, reason: 'not_member' });
    const onDone = await setup();
    await screen.findByText('Also apply to the 7 unsettled lines');
    await fireEvent.press(screen.getByText('Save split'));
    expect(await screen.findByTestId('apply-failed')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('treats a failed count as no offer', async () => {
    mockCount.mockRejectedValue(new Error('offline'));
    await setup();
    await waitFor(() => expect(mockCount).toHaveBeenCalled());
    expect(screen.queryByText(/unsettled lines/)).toBeNull();
  });
});
