import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { SetupStepHandle, SetupStepReady } from '@/features/decide/setup/steps/types';
import { PaidStep } from '../steps/PaidStep';
import { SeasonStep } from '../steps/SeasonStep';
import { MethodStep } from '../steps/MethodStep';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const mockSave = jest.fn((_input: { patch: Record<string, unknown>; stepTitle?: string }): { stepId: string } | null => ({ stepId: 'step-1' }));
let mockSettings: Record<string, unknown> | null = null;
let mockMonths: unknown[] = [];

jest.mock('@/data/mutations/decideSetup', () => ({
  useSaveSetupStep: () => ({ save: (input: { patch: Record<string, unknown> }) => mockSave(input) }),
}));
jest.mock('@/data/queries/decideV3', () => ({
  useDecideV3: () => ({ status: 'ready', inputs: { months: mockMonths }, evaluation: null, refetch: jest.fn() }),
}));
jest.mock('../useIncomeContext', () => ({
  useIncomeContext: () => ({
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'USD',
    timeZone: 'UTC',
    today: '2026-10-15',
    settings: mockSettings,
    accounts: [],
    series: [],
    found: null,
  }),
}));

async function mount(Step: typeof PaidStep) {
  const ready: SetupStepReady[] = [];
  const ref = React.createRef<SetupStepHandle>();
  await render(
    <ThemeProvider>
      <Step ref={ref} mode="stepper" onReadyChange={(r) => ready.push(r)} />
    </ThemeProvider>
  );
  return { ref, last: () => ready[ready.length - 1]! };
}

beforeEach(() => {
  mockSave.mockClear();
  mockSettings = null;
  mockMonths = [];
});

describe('PaidStep', () => {
  it('needs one answer before Continue', async () => {
    const { last } = await mount(PaidStep);
    expect(last().canContinue).toBe(false);
    expect(last().reasonKey).toBe('decide.setup.shell.neededReason');
  });

  it('"No fixed income right now" is exclusive in both directions', async () => {
    const { ref, last } = await mount(PaidStep);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Salary or wages' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Freelance or self-employed' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'No fixed income right now' }));
    expect(screen.getByRole('checkbox', { name: 'Salary or wages' })).not.toBeChecked();
    expect(last().canContinue).toBe(true);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Pension or benefits' }));
    expect(screen.getByRole('checkbox', { name: 'No fixed income right now' })).not.toBeChecked();
    let out: { stepId: string | null } | undefined;
    await act(async () => {
      out = ref.current!.save();
    });
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ patch: { income_types: ['pension_or_benefits'] } }));
    expect(out).toEqual({ stepId: 'step-1' });
  });

  it('writes the setup values in display order and returns null stepId when nothing changed', async () => {
    const { ref } = await mount(PaidStep);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Freelance or self-employed' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Salary or wages' }));
    await act(async () => {
      ref.current!.save();
    });
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ patch: { income_types: ['salary_or_wages', 'freelance'] } }));
    mockSave.mockReturnValueOnce(null);
    let out: { stepId: string | null } | undefined;
    await act(async () => {
      out = ref.current!.save();
    });
    expect(out).toEqual({ stepId: null });
  });
});

describe('SeasonStep', () => {
  it('shows three cards with none selected and saves nothing on skip', async () => {
    const { ref, last } = await mount(SeasonStep);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const r of radios) expect(r).not.toBeChecked();
    expect(last().canContinue).toBe(true);
    let out: { stepId: string | null } | undefined;
    await act(async () => {
      out = ref.current!.save();
    });
    expect(out).toEqual({ stepId: null });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('saves income_pattern', async () => {
    const { ref } = await mount(SeasonStep);
    await fireEvent.press(screen.getByRole('radio', { name: /^Follows the seasons/ }));
    await act(async () => {
      ref.current!.save();
    });
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ patch: { income_pattern: 'seasonal', income_pattern_confirmed: true } }));
  });
});

describe('MethodStep', () => {
  it('has four cards, none selected, and cannot continue', async () => {
    const { last } = await mount(MethodStep);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    for (const r of radios) expect(r).not.toBeChecked();
    expect(last().canContinue).toBe(false);
  });

  it('spread needs its months; "It varies" stores 0', async () => {
    const { ref, last } = await mount(MethodStep);
    await fireEvent.press(screen.getByRole('radio', { name: /^Spread large payments/ }));
    expect(last().canContinue).toBe(false);
    await fireEvent.press(screen.getByText('It varies, ask me each time'));
    expect(last().canContinue).toBe(true);
    await act(async () => {
      ref.current!.save();
    });
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ patch: { variable_method: 'spread', spread_months: 0 } }));
  });

  it('match needs no follow-up', async () => {
    const { ref, last } = await mount(MethodStep);
    await fireEvent.press(screen.getByRole('radio', { name: /^Match what comes in/ }));
    expect(last().canContinue).toBe(true);
    await act(async () => {
      ref.current!.save();
    });
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ patch: { variable_method: 'match' } }));
  });

  it('balance saves hold_months with the method in one patch', async () => {
    const { ref, last } = await mount(MethodStep);
    await fireEvent.press(screen.getByRole('radio', { name: /^Go by my bank balance/ }));
    expect(last().canContinue).toBe(false);
    await fireEvent.press(screen.getByText('2 months'));
    await act(async () => {
      ref.current!.save();
    });
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ patch: { variable_method: 'balance', hold_months: 2 } }));
  });

  it('steady shows the 6-month meta only when six full months exist', async () => {
    const { rerender } = await render(
      <ThemeProvider>
        <MethodStep mode="stepper" onReadyChange={() => undefined} />
      </ThemeProvider>
    );
    await fireEvent.press(screen.getByRole('radio', { name: /^Pay myself a steady amount/ }));
    expect(screen.queryByText(/Your last 6 months averaged/)).toBeNull();
    mockMonths = [1, 2, 3, 4, 5, 6].map((n) => ({
      month: `2026-0${n}`,
      full: true,
      mark: null,
      lines: [{ role: 'income', status: 'paid', countsAs: 'available', amount: n * 100_00 }],
    }));
    await rerender(
      <ThemeProvider>
        <MethodStep mode="stepper" onReadyChange={() => undefined} />
      </ThemeProvider>
    );
    expect(screen.getByText(/Your last 6 months averaged .*350.*lowest month was .*100/)).toBeTruthy();
  });
});
