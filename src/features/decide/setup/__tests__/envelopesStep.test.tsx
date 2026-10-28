import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { SetupStepHandle, SetupStepReady } from '../steps/types';
import { EnvelopesStep } from '../steps/EnvelopesStep';

let mockDecideV3 = true;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockDecideV3 }) }));
jest.setTimeout(30000);
let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));

const mockAdd = jest.fn();
jest.mock('@/data/mutations/decidePots', () => ({ useAddPot: () => ({ add: mockAdd }), useEditPot: () => ({ edit: jest.fn() }) }));

// PotSheet is covered by its own tests; here it only records how the step opens it.
jest.mock('@/features/decide/pots/PotSheet', () => {
  const { Text: T } = jest.requireActual('react-native');
  return {
    PotSheet: ({ visible, pot, prefill }: { visible: boolean; pot: { name: string } | null; prefill?: { name: string; colorKey: string } }) =>
      visible ? <T testID="pot-sheet">{pot ? `edit:${pot.name}` : `add:${prefill?.name}:${prefill?.colorKey}`}</T> : null,
  };
});

let mockPots: Record<string, unknown>[] = [];
jest.mock('@/data/queries/decide', () => ({ usePots: () => ({ data: { plain: mockPots, live: mockPots, wait: [], done: [] } }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));

const pot = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  currency: 'USD',
  kind: 'pot',
  target: 120_000,
  monthly_amount: null,
  ready_by: '2027-10-31',
  opening_saved: 20_000,
  bucket: null,
  color_key: 'green',
  deleted_at: null,
  ...over,
});

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

async function mount() {
  const ready: SetupStepReady[] = [];
  const ref = React.createRef<SetupStepHandle>();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider>
          <EnvelopesStep ref={ref} mode="stepper" onReadyChange={(r) => ready.push(r)} />
        </FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  return { ref, last: () => ready[ready.length - 1]! };
}

beforeEach(() => {
  mockWidth = 402;
  mockAdd.mockClear();
  mockPots = [];
});

describe('EnvelopesStep', () => {
  it('offers the chips and None right now, optional and never dirty', async () => {
    const { last, ref } = await mount();
    for (const label of ['Holiday', 'Car repairs', 'Gifts', 'Home', 'Education', 'Other', 'None right now']) expect(screen.getByText(label)).toBeTruthy();
    expect(last()).toEqual({ canContinue: true, reasonKey: null, dirty: false });
    expect(ref.current!.save()).toEqual({ stepId: null });
  });

  it('a chip without an envelope opens PotSheet prefilled with the name and the next unused swatch; nothing is inserted', async () => {
    mockPots = [pot('p1', 'Car repairs')];
    await mount();
    await fireEvent.press(screen.getByText('Holiday'));
    expect(screen.getByTestId('pot-sheet').props.children).toBe('add:Holiday:slate');
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('a chip that already is an envelope shows selected and opens that envelope', async () => {
    mockPots = [pot('p1', 'Holiday')];
    await mount();
    expect(screen.getByLabelText('Holiday').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getAllByText('Holiday')[0]!);
    expect(screen.getByTestId('pot-sheet').props.children).toBe('edit:Holiday');
  });

  it('None right now is exclusive and writes nothing', async () => {
    mockPots = [pot('p1', 'Holiday')];
    const { ref } = await mount();
    await fireEvent.press(screen.getByText('None right now'));
    expect(screen.queryByTestId('pot-sheet')).toBeNull();
    await fireEvent.press(screen.getByText('Gifts'));
    expect(screen.getByTestId('pot-sheet').props.children).toContain('add:Gifts');
    expect(mockAdd).not.toHaveBeenCalled();
    let out: { stepId: string | null } | undefined;
    await act(async () => {
      out = ref.current!.save();
    });
    expect(out).toEqual({ stepId: null });
  });

  it('rows show amount set aside, monthly or add an amount, and tag saving buckets', async () => {
    mockPots = [
      pot('p1', 'Rainy trip', { bucket: 'trip', target: null, ready_by: null, monthly_amount: 5_000, opening_saved: 30_000, color_key: 'teal' }),
      pot('p2', 'Kitchen', { bucket: null, target: null, ready_by: null, monthly_amount: null, opening_saved: 0 }),
    ];
    await mount();
    expect(screen.getByText('Rainy trip')).toBeTruthy();
    expect(screen.getByText('saving bucket')).toBeTruthy();
    expect(screen.getByText('+$50/mo')).toBeTruthy();
    expect(screen.getByText('$300')).toBeTruthy();
    expect(screen.getByText('add an amount')).toBeTruthy();
    expect(screen.getByLabelText('Rainy trip, saving bucket, $300, +$50/mo')).toBeTruthy();
    await fireEvent.press(screen.getByText('Kitchen'));
    expect(screen.getByTestId('pot-sheet').props.children).toBe('edit:Kitchen');
  });

  it('keeps long amounts on one line at 320 dp', async () => {
    mockWidth = 320;
    mockPots = [pot('p1', 'Holiday', { opening_saved: 123_456_789 })];
    await mount();
    const amount = screen.getByText(/^\$1,234,5/);
    expect(amount.props.numberOfLines).toBe(1);
  });
});
