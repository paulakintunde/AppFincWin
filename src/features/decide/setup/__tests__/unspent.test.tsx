import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { unspentSum, type AccountUse, type Envelope, type Evaluation, type V3Inputs } from '@/engine/decide/v3';
import { demoSource, sofaInputs } from '../../__tests__/helpers/demoScenario';
import { buildV3Inputs } from '../../snapshot/v3/buildV3Inputs';
import { computeV3 } from '../../snapshot/v3/computeV3';
import { v3s } from '../../snapshot/v3/__tests__/v3Fixtures';
import { UnspentSheet } from '../UnspentSheet';
import { UnspentStep } from '../steps/UnspentStep';
import { registerSetupSheetActions } from '../steps/setupSheetHost';
import type { SetupStepHandle, SetupStepReady } from '../steps/types';

let mockDecideV3 = true;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockDecideV3 }) }));
jest.setTimeout(30000);
let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/theme/FontScaleProvider', () => {
  const actual = jest.requireActual('@/theme/FontScaleProvider');
  return { ...actual, useFontScale: () => mockScale };
});
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockHaptic = jest.fn();
jest.mock('@/ui/haptics', () => ({ hapticSelection: () => mockHaptic() }));

const mockSave = jest.fn((_i: { labelKey?: string; patch: Record<string, unknown> }) => ({ stepId: 'step-1' }) as { stepId: string } | null);
const mockToast = jest.fn();
jest.mock('@/data/mutations/decideSetup', () => ({
  useSaveSetupStep: () => ({ save: (i: { labelKey?: string; patch: Record<string, unknown> }) => mockSave(i) }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-03' }),
}));

let mockSettings: Record<string, unknown> | null = null;
let mockV3: unknown = null;
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: mockSettings }) }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => mockV3 }));

const TODAY = '2026-10-03';
const source = () => demoSource(TODAY);
const everyday = (): Record<string, AccountUse> => Object.fromEntries(source().accounts.map((a) => [a.id, { kind: 'everyday' } as AccountUse]));

interface Setup {
  anchor?: { amount: number; at: string } | null;
  uses?: Record<string, AccountUse> | null;
  flags?: { stale?: boolean; drifted?: boolean };
  envelopes?: Envelope[];
}

/** The real engine over the demo data; only the settings write and the query plumbing are faked. */
function setUp({ anchor = null, uses = everyday(), flags, envelopes }: Setup = {}) {
  const settings = v3s(anchor ? { unspent_anchor: anchor.amount, unspent_anchor_at: anchor.at } : {});
  let evaluation: Evaluation = computeV3(source(), settings, sofaInputs, uses ?? undefined);
  if (flags && evaluation.funds.unspent) {
    evaluation = { ...evaluation, funds: { ...evaluation.funds, unspent: { ...evaluation.funds.unspent, ...flags } } };
  }
  const base = buildV3Inputs(source(), settings);
  const inputs: V3Inputs = {
    ...base,
    accounts: base.accounts?.map((a) => ({ ...a, use: uses?.[a.id] ?? a.use })),
    ...(envelopes ? { envelopes } : {}),
  };
  mockSettings = anchor ? { unspent_anchor: anchor.amount, unspent_anchor_at: anchor.at, currency: 'USD' } : { unspent_anchor: null, unspent_anchor_at: null, currency: 'USD' };
  mockV3 = { status: 'ready', inputs, evaluation, refetch: () => undefined };
  return { sum: unspentSum(inputs, evaluation.month), evaluation };
}

const wrap = (node: React.ReactNode) => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } }}>
    <ThemeProvider>
      <FontScaleProvider>{node}</FontScaleProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockWidth = 402;
  mockScale = 1;
});

const sheet = async (onClose = jest.fn(), onSetThem?: () => void) => {
  await render(wrap(<UnspentSheet visible onClose={onClose} onSetThem={onSetThem} />));
  return onClose;
};
const ownField = () => screen.getAllByLabelText('Your unspent money').find((n) => typeof n.props.onChangeText === 'function')!;
const lastPatch = () => mockSave.mock.calls[mockSave.mock.calls.length - 1]![0];

describe('UnspentSheet states (DSU-10)', () => {
  it('Not confirmed: chip, body, That is right and Use my own figure; no Clear', async () => {
    const { sum } = setUp();
    await sheet();
    expect(screen.getByText('Not confirmed')).toBeTruthy();
    expect(screen.getByText('Checks above this month’s room need this figure.')).toBeTruthy();
    expect(screen.getByLabelText('Use my own figure')).toBeTruthy();
    expect(screen.queryByLabelText('Clear')).toBeNull();
    const onClose = jest.fn();
    await screen.unmount();
    await sheet(onClose);
    await fireEvent.press(screen.getByLabelText('That’s right'));
    expect(lastPatch()).toEqual({ labelKey: 'unspentConfirmed', patch: { unspent_anchor: sum.total, unspent_anchor_at: TODAY } });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ stepId: 'step-1', text: expect.objectContaining({ key: 'decide.unspentSheet.toastConfirmed' }) }));
    expect(mockHaptic).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Confirmed, fresh: the rolled-forward line, the note, That is right re-confirms today, Clear writes both nulls with Undo', async () => {
    const { sum } = setUp();
    const fresh = setUp({ anchor: { amount: sum.suggested, at: TODAY } });
    await sheet();
    expect(screen.queryByText('Not confirmed')).toBeNull();
    expect(screen.getByText(/^Unspent money .* · confirmed .* on .*, rolled forward$/)).toBeTruthy();
    expect(screen.getByText(/^Unspent money rolls forward on its own/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('That’s right'));
    // the same anchor, the same day: nothing to write is the mutation's call; the sheet sends today's sum
    expect(lastPatch().patch).toEqual({ unspent_anchor: fresh.sum.total, unspent_anchor_at: TODAY });
    await fireEvent.press(screen.getByLabelText('Clear'));
    expect(lastPatch()).toEqual({ labelKey: 'unspentCleared', patch: { unspent_anchor: null, unspent_anchor_at: null } });
    expect(mockToast).toHaveBeenLastCalledWith(expect.objectContaining({ text: expect.objectContaining({ key: 'decide.unspentSheet.toastCleared' }) }));
  });

  it('Drifted: the chip, the two figures, Use sum and Keep rolled each make a new anchor, and an own-figure link', async () => {
    const { sum } = setUp();
    const { evaluation, sum: again } = setUp({ anchor: { amount: sum.suggested + 5_000_000, at: TODAY } });
    await sheet();
    expect(screen.getByText('Differs from your accounts')).toBeTruthy();
    expect(screen.getByText(/^Rolled forward to .*; the sum from your accounts is .*\.$/)).toBeTruthy();
    expect(screen.getByLabelText('Use my own figure')).toBeTruthy();
    expect(screen.queryByLabelText('Clear')).toBeNull();
    await fireEvent.press(screen.getByLabelText(/^Use \$/));
    expect(lastPatch().patch).toEqual({ unspent_anchor: again.total, unspent_anchor_at: TODAY });
    await fireEvent.press(screen.getByLabelText(/^Keep \$/));
    expect(lastPatch().patch).toEqual({ unspent_anchor: evaluation.funds.unspent!.value, unspent_anchor_at: TODAY });
  });

  it('Stale: the days-ago chip and the check-again body, with the fresh buttons and Clear', async () => {
    const { sum } = setUp();
    setUp({ anchor: { amount: sum.suggested, at: '2026-08-20' }, flags: { stale: true, drifted: false } });
    await sheet();
    expect(screen.getByText('Last confirmed 44 days ago')).toBeTruthy();
    expect(screen.getByText('Decide asks you to check this again after 30 days.')).toBeTruthy();
    expect(screen.getByLabelText('That’s right')).toBeTruthy();
    expect(screen.getByLabelText('Clear')).toBeTruthy();
  });

  it('Own figure: Save figure waits for a figure at or above 0 that differs; Keep as is writes nothing', async () => {
    const { sum } = setUp();
    const onClose = await sheet();
    await fireEvent.press(screen.getByLabelText('Use my own figure'));
    const save = screen.getByLabelText('Save figure');
    expect(save.props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(ownField(), '1500');
    expect(screen.getByLabelText('Save figure').props.accessibilityState?.disabled).toBeFalsy();
    await fireEvent.press(screen.getByLabelText('Save figure'));
    expect(lastPatch().patch).toEqual({ unspent_anchor: 150000, unspent_anchor_at: TODAY });
    expect(onClose).toHaveBeenCalled();
    expect(sum.total).not.toBe(150000);

    mockSave.mockClear();
    await screen.unmount();
    const closeAgain = await sheet();
    await fireEvent.press(screen.getByLabelText('Use my own figure'));
    await fireEvent.press(screen.getByLabelText('Keep as is'));
    expect(mockSave).not.toHaveBeenCalled();
    expect(closeAgain).toHaveBeenCalled();
  });

  it('a negative figure never enables Save figure', async () => {
    setUp();
    await sheet();
    await fireEvent.press(screen.getByLabelText('Use my own figure'));
    await fireEvent.changeText(ownField(), '-20');
    expect(screen.getByLabelText('Save figure').props.accessibilityState?.disabled).toBe(true);
  });

  it('held-back money is a line, the total is the figure after it, and the saved anchor adds it back', async () => {
    setUp();
    const base = (mockV3 as { inputs: V3Inputs; evaluation: Evaluation }).inputs;
    const withBridge: V3Inputs = { ...base, heldBridges: [{ id: 'b1', amount: 30_000 as never }] };
    const evaluation = (mockV3 as { evaluation: Evaluation }).evaluation;
    mockV3 = { status: 'ready', inputs: withBridge, evaluation, refetch: () => undefined };
    const sum = unspentSum(withBridge, evaluation.month);
    await sheet();
    expect(screen.getByText('− Held back for plans')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('That’s right'));
    expect(lastPatch().patch.unspent_anchor).toBe(sum.suggested);
    expect(sum.total).toBe(sum.suggested - 30_000);
  });
});

describe('UnspentSumCard (worked sum)', () => {
  it('shows the bank, bills and everyday lines and the total; lines at 0 are left out', async () => {
    setUp();
    await sheet();
    expect(screen.getByText('Bank balance (accounts you spend from)')).toBeTruthy();
    expect(screen.getByText('− Bills still due this month')).toBeTruthy();
    expect(screen.getByText('− Everyday spending still expected')).toBeTruthy();
    expect(screen.getByText('Unspent money')).toBeTruthy();
    expect(screen.queryByText('− Set aside in mixed accounts')).toBeNull();
    expect(screen.queryByText('− Envelopes')).toBeNull();
    expect(screen.queryByText('− Emergency fund')).toBeNull();
    expect(screen.queryByText('− Held back for plans')).toBeNull();
  });

  it('notes the accounts with no use set, and Set them calls the host', async () => {
    setUp({ uses: null });
    const editAccountUse = jest.fn();
    const unregister = registerSetupSheetActions({ editAccountUse });
    await render(wrap(<UnspentStep onReadyChange={() => undefined} mode="stepper" />));
    expect(screen.getByText(/aren’t counted because their use isn’t set\.$/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Set them'));
    expect(editAccountUse).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('F-05: with every money account set, the cards add no "use isn’t set" note', async () => {
    const cardCount = source().accounts.filter((a) => a.kind === 'credit').length;
    expect(cardCount).toBeGreaterThan(0);
    setUp(); // everyday() sets a use on every account, cards included; the cards are not V3 accounts either way
    const ids = (mockV3 as { inputs: V3Inputs }).inputs.accounts!.map((a) => a.id);
    expect(ids.some((id) => source().accounts.find((a) => a.id === id)!.kind === 'credit')).toBe(false);
    await render(wrap(<UnspentStep onReadyChange={() => undefined} mode="stepper" />));
    expect(screen.queryByText(/because their use isn’t set|because its use isn’t set/)).toBeNull();
  });

  it('notes envelopes not placed in an account only when a mixed account exists', async () => {
    const env: Envelope = { id: 'e1', kind: 'pot', target: null, monthlyAmount: null, readyBy: null, saved: 20_000 as never, purposeId: null };
    const uses = everyday();
    setUp({ envelopes: [env] });
    await sheet();
    expect(screen.queryByText(/isn’t placed in an account yet/)).toBeNull();
    await screen.unmount();
    uses[Object.keys(uses)[0]!] = { kind: 'mixed', extraSetAside: null } as AccountUse;
    setUp({ uses, envelopes: [env] });
    await sheet();
    expect(screen.getByText('1 envelope isn’t placed in an account yet, so it’s taken from the accounts counted.')).toBeTruthy();
  });

  it('a negative total shows a minus sign', async () => {
    const { sum } = setUp();
    const inputs = (mockV3 as { inputs: V3Inputs }).inputs;
    const poor: V3Inputs = { ...inputs, accounts: inputs.accounts?.map((a) => ({ ...a, balance: 0 as never })) };
    mockV3 = { ...(mockV3 as object), inputs: poor };
    const poorSum = unspentSum(poor, (mockV3 as { evaluation: Evaluation }).evaluation.month);
    expect(poorSum.total).toBeLessThan(0);
    expect(sum.total).toBeGreaterThan(poorSum.total);
    await sheet();
    const total = screen.getAllByText(/^−\$/).find((n) => n.props.numberOfLines === 1);
    expect(total).toBeTruthy();
  });

  it('figures never break at 2.0x text on a 320 dp screen: one line each, and the rows stack', async () => {
    mockWidth = 320;
    mockScale = 2;
    setUp();
    await sheet();
    const figures = screen.getAllByText(/^[−-]?\$[\d,.\s  ]+$/);
    expect(figures.length).toBeGreaterThanOrEqual(3);
    for (const f of figures) expect(f.props.numberOfLines).toBe(1);
    const row = screen.getByLabelText(/^Bank balance \(accounts you spend from\), /);
    expect(JSON.stringify(row.props.style)).toContain('"flexDirection":"column"');
  });
});

describe('UnspentStep (needed, last step of Your money now)', () => {
  const mount = async () => {
    const ready: SetupStepReady[] = [];
    const ref = React.createRef<SetupStepHandle>();
    await render(wrap(<UnspentStep ref={ref} mode="stepper" onReadyChange={(r) => ready.push(r)} />));
    return { ref, last: () => ready[ready.length - 1]! };
  };

  it('starts with neither choice made and cannot continue', async () => {
    setUp();
    const { last } = await mount();
    expect(last().canContinue).toBe(false);
    expect(last().reasonKey).toBe('decide.setup.shell.chooseOneReason');
    expect(screen.getByText('The money free for anything. It’s often less than your bank balance.')).toBeTruthy();
    expect(screen.getByText('Decide asks you to check this again after 30 days.')).toBeTruthy();
    expect(screen.queryAllByLabelText('Your unspent money').filter((n) => typeof n.props.onChangeText === 'function')).toHaveLength(0);
  });

  it('That is right continues, and saving writes the sum with today as the anchor', async () => {
    const { sum } = setUp();
    const { ref, last } = await mount();
    await fireEvent.press(screen.getByLabelText('That’s right'));
    expect(last().canContinue).toBe(true);
    expect(last().dirty).toBe(true);
    let out: { stepId: string | null } | undefined;
    await act(async () => {
      out = ref.current!.save();
    });
    expect(out).toEqual({ stepId: 'step-1' });
    expect(lastPatch()).toEqual({ labelKey: 'unspentConfirmed', patch: { unspent_anchor: sum.total, unspent_anchor_at: TODAY } });
  });

  it('Use my own figure waits for a figure, then saves exactly that figure', async () => {
    setUp();
    const { ref, last } = await mount();
    await fireEvent.press(screen.getByLabelText('Use my own figure'));
    expect(last().canContinue).toBe(false);
    await fireEvent.changeText(ownField(), '2400');
    expect(last().canContinue).toBe(true);
    await act(async () => {
      ref.current!.save();
    });
    expect(lastPatch().patch).toEqual({ unspent_anchor: 240000, unspent_anchor_at: TODAY });
  });

  it('writes nothing when saved before a choice', async () => {
    setUp();
    const { ref } = await mount();
    let out: { stepId: string | null } | undefined;
    await act(async () => {
      out = ref.current!.save();
    });
    expect(out).toEqual({ stepId: null });
    expect(mockSave).not.toHaveBeenCalled();
  });
});
