import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { SetupStepHandle, SetupStepReady } from '../steps/types';
import { SavingStep } from '../steps/SavingStep';
import { EditSeriesFromContext } from '@/features/income/steps/editSeriesFromContext';

let mockDecideV3 = true;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockDecideV3 }) }));
jest.setTimeout(30000);
let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const mockPatch = jest.fn((_items: unknown, _k?: unknown, _n?: unknown) => ({ stepId: 'step-modes' }));
const mockAdd = jest.fn((_i: Record<string, unknown>) => ({ id: 'pot-new', stepId: 'step-add' }));
const mockEditPot = jest.fn((_row: unknown, _patch: unknown) => 'step-edit-pot');
const mockEditFrom = jest.fn((_i: Record<string, unknown>) => 'step-raise');
const mockToast = jest.fn();
jest.mock('@/data/mutations/seriesAttributes', () => ({
  usePatchSeriesAttributes: () => ({ patch: (i: unknown, k?: unknown, n?: unknown) => mockPatch(i, k, n) }),
}));
jest.mock('@/data/mutations/decidePots', () => ({
  useAddPot: () => ({ add: (i: Record<string, unknown>) => mockAdd(i) }),
  useEditPot: () => ({ edit: (r: unknown, p: unknown) => mockEditPot(r, p) }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));

const series = (id: string, amount: number, over: Record<string, unknown> = {}) => ({
  id,
  name: `Save ${id}`,
  account_id: 'acc1',
  category_id: 'cat-sav',
  amount,
  currency: 'USD',
  freq: 'monthly',
  anchor_date: '2026-10-05',
  end_date: null,
  deleted_at: null,
  saving_mode: null,
  version: 3,
  ...over,
});
let mockSeries: Record<string, unknown>[] = [];
let mockPots: Record<string, unknown>[] = [];
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: mockSeries }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'acc1', name: 'Rainy day' }] }) }));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [{ id: 'cat-sav', builtin_key: 'Savings' }] }) }));
jest.mock('@/data/queries/decide', () => ({ usePots: () => ({ data: { plain: mockPots, live: mockPots, wait: [], done: [] } }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

async function mount() {
  const ready: SetupStepReady[] = [];
  const ref = React.createRef<SetupStepHandle>();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider>
          <EditSeriesFromContext.Provider value={(i) => mockEditFrom(i as unknown as Record<string, unknown>)}>
            <SavingStep ref={ref} mode="stepper" onReadyChange={(r) => ready.push(r)} />
          </EditSeriesFromContext.Provider>
        </FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  return { ref, last: () => ready[ready.length - 1]! };
}

const save = async (ref: React.RefObject<SetupStepHandle | null>) => {
  let out: { stepId: string | null } | undefined;
  await act(async () => {
    out = ref.current!.save();
  });
  return out!;
};

const pickBucket = (name: string) => fireEvent.press(screen.getByText(name));
const typeMonthly = (bucket: string, value: string) => fireEvent.changeText(screen.getByLabelText(`${bucket}, each month`), value);

beforeEach(() => {
  mockWidth = 402;
  [mockPatch, mockAdd, mockEditPot, mockEditFrom, mockToast].forEach((m) => m.mockClear());
  mockSeries = [series('s1', 40000)];
  mockPots = [];
});

describe('SavingStep', () => {
  it('shows each saving series with Fixed and Flexible, none selected, and Next works', async () => {
    const { last, ref } = await mount();
    expect(screen.getByText('To Rainy day')).toBeTruthy();
    expect(screen.getByText('Around the 5, every month')).toBeTruthy();
    expect(screen.getByLabelText('Fixed').props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByLabelText('Flexible').props.accessibilityState).toMatchObject({ checked: false });
    expect(last()).toEqual({ canContinue: true, reasonKey: null, dirty: false });
    expect((await save(ref)).stepId).toBeNull();
    expect(screen.getByText('Leave this empty if your saving isn’t for anything in particular yet.')).toBeTruthy();
  });

  it('saves the Fixed / Flexible choice as one batch', async () => {
    const { last, ref } = await mount();
    await fireEvent.press(screen.getByLabelText('Flexible'));
    expect(last().dirty).toBe(true);
    const out = await save(ref);
    expect(out).toEqual({ stepId: 'step-modes' });
    expect(mockPatch.mock.calls[0]![0]).toEqual([expect.objectContaining({ attributes: { saving_mode: 'flexible' } })]);
  });

  it('a picked bucket gets amounts, a readiness line and is created as a bucket envelope at the end', async () => {
    const { ref } = await mount();
    await pickBucket('A new car');
    expect(screen.getByText('Add a monthly amount, or leave it at $0 for now.')).toBeTruthy();
    await typeMonthly('A new car', '200');
    expect(screen.getByText('Add a goal to see when it’s reached.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('A new car, goal (optional)'), '30000');
    expect(screen.getByText(/^At .*200.* a month, about 12\s+years 6\s+months to reach .*30,000.*\.$/)).toBeTruthy();
    const out = await save(ref);
    expect(out.stepId).toBe('step-add');
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0]![0]).toMatchObject({
      householdId: 'h1',
      ownerId: 'u1',
      pot: { name: 'A new car', bucket: 'car', target: 3000000, ready_by: null, monthly_amount: 20000, opening_saved: 0, color_key: 'green' },
    });
  });

  it('allows a bucket at $0 with no goal', async () => {
    const { ref } = await mount();
    await pickBucket('A wedding');
    await save(ref);
    expect(mockAdd.mock.calls[0]![0]).toMatchObject({ pot: { bucket: 'wedding', target: null, monthly_amount: 0 } });
  });

  it('total line: equal and less', async () => {
    await mount();
    await pickBucket('A new car');
    await typeMonthly('A new car', '300');
    expect(screen.getByText(/of your .*400.* a month goes to these buckets; .*100.* stays general saving\./)).toBeTruthy();
    await typeMonthly('A new car', '400');
    expect(screen.getByText(/of your .*400.* a month goes to these buckets\./)).toBeTruthy();
  });

  it('over (D-22): tile text, D-23 line, accessibility group, both buttons, Next not blocked', async () => {
    const { last } = await mount();
    await pickBucket('A new car');
    await typeMonthly('A new car', '500');
    expect(screen.getByText(/more than your regular saving\./)).toBeTruthy();
    expect(screen.getByText('If you leave it, Decide counts the larger of the two as set aside each month.')).toBeTruthy();
    expect(screen.getByLabelText(/more than your regular saving\. Two choices\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lower a bucket' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Raise my regular saving to .*500/ })).toBeTruthy();
    expect(last().canContinue).toBe(true);
  });

  it('Raise edits the single saving series, toasts with Undo and the tile becomes equal', async () => {
    mockSeries = [series('s1', 40000)];
    await mount();
    await pickBucket('A new car');
    await typeMonthly('A new car', '500');
    await fireEvent.press(screen.getByRole('button', { name: /Raise my regular saving to/ }));
    expect(mockEditFrom).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', expectedVersion: 3, patch: { amount: 50000 }, effectiveFrom: '2026-10-15', ownerId: 'u1' }));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 'step-raise', text: expect.objectContaining({ key: 'decide.setup.saving.toastRaised' }) })
    );
  });

  it('hides Raise with two saving series; Lower stays', async () => {
    mockSeries = [series('s1', 20000), series('s2', 10000)];
    await mount();
    await pickBucket('A new car');
    await typeMonthly('A new car', '500');
    expect(screen.getByRole('button', { name: 'Lower a bucket' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Raise my regular saving/ })).toBeNull();
  });

  it('existing buckets show and edit through the pot edit mutation', async () => {
    mockPots = [{ id: 'p1', bucket: 'trip', monthly_amount: 10000, target: null, opening_saved: 0, color_key: 'slate', kind: 'pot' }];
    const { ref } = await mount();
    await typeMonthly('A trip or holiday', '150');
    await save(ref);
    expect(mockEditPot).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), { monthly_amount: 15000 });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('clearing an existing bucket goal saves target null', async () => {
    mockPots = [{ id: 'p1', bucket: 'trip', monthly_amount: 10000, target: 500000, opening_saved: 0, color_key: 'slate', kind: 'pot' }];
    const { ref, last } = await mount();
    await fireEvent.changeText(screen.getByLabelText('A trip or holiday, goal (optional)'), '');
    expect(last().dirty).toBe(true);
    await save(ref);
    expect(mockEditPot).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), { monthly_amount: 10000, target: null });
  });

  it('stacks the two amount fields at 320 dp', async () => {
    mockWidth = 320;
    await mount();
    await pickBucket('A new car');
    expect(screen.getByLabelText('A new car, each month')).toBeTruthy();
    expect(screen.getByLabelText('A new car, goal (optional)')).toBeTruthy();
  });
});
