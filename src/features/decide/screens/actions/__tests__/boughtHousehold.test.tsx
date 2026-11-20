// 08.1-12 (D-12, UI-SPEC section 5): a Household purchase says how it is saved. The line "Saved as a shared line, split {{rule}}."
// shows for the Household scope only, after the title and before the date line, and the amount shown is the full amount written.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { evaluate } from '@/engine/decide/v3';
import type { CheckV2 } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { checkOnce, inputsOf } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import en from '@/i18n/locales/en';
import { wrap } from '@/test/stepProps';
import { BoughtScreen } from '../BoughtScreen';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticTick: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/screen/DetailScreen', () => ({
  DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => {
    const { Text, View } = jest.requireActual('react-native');
    return (
      <View testID="detail-frame">
        <Text testID="detail-title">{title}</Text>
        {children}
      </View>
    );
  },
}));
jest.mock('@/data/mutations/undo', () => ({ useUndo: () => ({ undo: jest.fn() }) }));
const mockGoAhead = jest.fn();

const a = en.decide.screens.answerActions;
const TODAY = '2026-11-11';
const fmt = (n: number) => `$${n / 100}`;
const fmtDate = (d: string) => `on ${d}`;
const inputs = inputsOf({ balance: minorUnits(50000000) });

const evenTwo: CheckV2['share'] = { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } };
const personalCheck = checkOnce(100001, { share: { kind: 'personal' } });
const householdCheck = checkOnce(100001, { share: evenTwo });

const props = (v3: CheckV2): React.ComponentProps<typeof BoughtScreen> => ({
  goAhead: mockGoAhead,
  checkId: 'c1',
  ownerId: 'u1',
  householdId: 'h1',
  homeCurrency: 'USD',
  currency: 'USD',
  timeZone: 'UTC',
  today: TODAY,
  itemName: 'Sofa',
  v3,
  evaluation: evaluate(inputs, v3),
  accounts: [{ id: 'acc-1', name: 'Everyday' }],
  formatMoney: fmt,
  formatDate: fmtDate,
  onDone: jest.fn(),
});

/** Every string in the tree, in render order. */
function texts(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined) return out;
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => texts(n, out));
    return out;
  }
  const n = node as { children?: unknown };
  texts(n.children, out);
  return out;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGoAhead.mockReturnValue('step-go');
});

describe('Bought screen: household sub-line (D-12)', () => {
  it('shows "Saved as a shared line, split evenly." for a Household purchase', async () => {
    await wrap(<BoughtScreen {...props(householdCheck)} />);
    expect(a.bought.sharedSub).toBe('Saved as a shared line, split {{rule}}.');
    expect(screen.getByText('Saved as a shared line, split evenly.')).toBeTruthy();
  });

  it('names the rule in plain words for each rule', async () => {
    const weighted: CheckV2 = { ...householdCheck, share: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'weight', weights: [3, 1] } } };
    await wrap(<BoughtScreen {...props(weighted)} />);
    expect(screen.getByText('Saved as a shared line, split by agreed share.')).toBeTruthy();
  });

  it('names the current household rule when it differs from the rule on the check', async () => {
    await wrap(<BoughtScreen {...props(householdCheck)} currentRule="mine" />);
    expect(screen.getByText(`Saved as a shared line, split ${a.bought.shareRule.mine}.`)).toBeTruthy();
    expect(screen.queryByText('Saved as a shared line, split evenly.')).toBeNull();
  });

  it('falls back to the rule on the check while the current rule loads', async () => {
    await wrap(<BoughtScreen {...props(householdCheck)} currentRule={undefined} />);
    expect(screen.getByText('Saved as a shared line, split evenly.')).toBeTruthy();
  });

  it('is hidden when the line will not be shared (household of one)', async () => {
    await wrap(<BoughtScreen {...props(householdCheck)} currentRule={null} />);
    expect(screen.queryByTestId('bought-shared-sub')).toBeNull();
  });

  it('is not shown for Just me', async () => {
    await wrap(<BoughtScreen {...props(personalCheck)} />);
    expect(screen.queryByTestId('bought-shared-sub')).toBeNull();
    expect(screen.queryByText(/Saved as a shared line/)).toBeNull();
  });

  it('comes after the title and before the date line', async () => {
    await wrap(<BoughtScreen {...props(householdCheck)} />);
    const all = texts(screen.toJSON());
    const title = all.indexOf(a.bought.title);
    const sub = all.indexOf('Saved as a shared line, split evenly.');
    const date = all.indexOf(a.bought.boughtOn.replace('{{date}}', fmtDate(TODAY)));
    expect(title).toBeGreaterThanOrEqual(0);
    expect(sub).toBeGreaterThan(title);
    expect(date).toBeGreaterThan(sub);
  });

  it('shows the full amount that is written, not my part', async () => {
    const p = props(householdCheck);
    const full = p.evaluation.purchase?.full?.whole ?? 0;
    const mine = p.evaluation.purchase?.whole ?? 0;
    expect(full).toBeGreaterThan(mine);
    await wrap(<BoughtScreen {...p} />);
    expect(screen.getByText(fmt(full))).toBeTruthy();
    expect(screen.queryByText(fmt(mine))).toBeNull();
  });

  it('Record purchase sends the household check and its evaluation to the one writer', async () => {
    await wrap(<BoughtScreen {...props(householdCheck)} />);
    await fireEvent.press(screen.getByText(a.bought.save));
    expect(mockGoAhead).toHaveBeenCalledTimes(1);
    expect(mockGoAhead.mock.calls[0]?.[0].check.share.kind).toBe('household');
  });
});
