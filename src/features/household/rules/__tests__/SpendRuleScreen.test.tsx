// 08.1-23 (CMP-F19, owner 2026-11-21 Q1-Q6): "How spending is shared". Every Supabase-loading hook is mocked; the screen, the choice
// lists, the shares editor and the pure view (spendViewOf) are real.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { HouseholdSpendRuleRow } from '@/db/householdSpendRules';
import { SpendRuleScreen } from '../SpendRuleScreen';
import { spendViewOf, startingShares, sharedMoneyTotal, moneyParts, percentsOf, billPercentsOf, zeroShareIdsOf } from '../spendRuleView';
import type { JointAccountSource } from '@/features/decide/snapshot/v3/householdScope';
import { ZERO_SHARE_SUGGESTION, suggestTargetOf, suggestionFor } from '../zeroShareSuggestion';

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
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn() }) }));
jest.mock('@/shell/header/BackButton', () => ({ BackButton: () => null }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticTick: jest.fn(), hapticFailed: jest.fn(), hapticWarn: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
const mockToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));

type SaveResult = { ok: true; version: number } | { ok: false; reason: string; updated_by?: string };
const mockSave = jest.fn(async (..._a: unknown[]): Promise<SaveResult> => ({ ok: true, version: 2 }));
jest.mock('@/db/householdSpendRules', () => ({ setHouseholdSpendRule: (...a: unknown[]) => mockSave(...a) }));

let mockOnline = true;
jest.mock('../../useHouseholdScope', () => ({
  useHouseholdScope: () => ({ householdId: 'h', userId: 'me', online: mockOnline, members: [], isOwner: true, name: 'Home', household: null }),
}));
jest.mock('../../useMemberLabel', () => ({
  useMemberLabel: () => (id: string | null) => (id === 'me' ? 'You' : id === 'sam' ? 'Sam' : id === 'lee' ? 'Lee' : 'Someone'),
  useMemberSeen: () => () => true,
}));

type Member = { user_id: string; weight: number };
let mockMembers: Member[] = [];
let mockRow: HouseholdSpendRuleRow | null = null;
let mockDefaults: { category_ref: string | null; rule: 'even' | 'weight' | 'mine' }[] = [];
let mockFacts = { hasJoint: false, hasPersonalCash: true, hasJointCash: false };
jest.mock('../useSpendRule', () => ({
  useSpendRule: () => {
    const { spendViewOf: view } = jest.requireActual('../spendRuleView');
    return {
      members: mockMembers,
      row: mockRow,
      rowReady: true,
      defaults: mockDefaults,
      jointAccounts: [],
      purposes: [],
      view: mockMembers.length < 2 ? null : view(mockRow, mockMembers, mockDefaults, 'me', mockFacts),
    };
  },
  useToday: () => '2026-11-21',
}));
let mockShared: { total: number | null; currency: string | null } = { total: null, currency: null };
jest.mock('../useSharedMoney', () => ({ useSharedMoney: () => mockShared }));
// 08.1-25: the Supabase-reading hook is mocked; its pure part (zeroShareIdsOf) is tested for real below.
let mockZero: { ids: string[]; currency: string | null } = { ids: [], currency: 'USD' };
jest.mock('../useZeroShare', () => ({ useZeroShare: () => mockZero }));

const TWO: Member[] = [
  { user_id: 'me', weight: 60 },
  { user_id: 'sam', weight: 40 },
];
const row = (over: Partial<HouseholdSpendRuleRow>): HouseholdSpendRuleRow => ({
  household_id: 'h',
  rule: null,
  setup: null,
  shares: null,
  version: 3,
  updated_by: 'sam',
  updated_at: '2026-11-20T00:00:00Z',
  ...over,
});

async function setup(props: { suggest?: 'equalShares' } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <SpendRuleScreen {...props} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const checked = (id: string): boolean => Boolean(screen.getByTestId(id).props.accessibilityState?.checked);
const saveButton = () => screen.getByLabelText('Save');

beforeEach(() => {
  mockMembers = TWO;
  mockRow = null;
  mockDefaults = [{ category_ref: null, rule: 'weight' }];
  mockFacts = { hasJoint: false, hasPersonalCash: true, hasJointCash: false };
  mockShared = { total: null, currency: null };
  mockOnline = true;
  mockSave.mockClear();
  mockSave.mockImplementation(async () => ({ ok: true, version: 4 }));
  mockToast.mockClear();
  mockZero = { ids: [], currency: 'USD' };
});

describe('spendRuleView (pure)', () => {
  it('splits percents by the largest remainder and falls back to even', () => {
    expect(percentsOf([1, 1, 1])).toEqual([34, 33, 33]);
    expect(percentsOf([0, 0])).toEqual([50, 50]);
    expect(billPercentsOf(TWO, [{ category_ref: null, rule: 'mine' }])).toBeNull();
    expect(billPercentsOf(TWO, [{ category_ref: null, rule: 'weight' }])).toEqual({ me: 60, sam: 40 });
  });

  it('starts the editor from saved shares that fit, else the bill split (Q5)', () => {
    expect(startingShares(row({ shares: { me: 30, sam: 70 } }), TWO, mockDefaults)).toEqual([30, 70]);
    expect(startingShares(row({ shares: { me: 30, sam: 60, gone: 10 } }), TWO, mockDefaults)).toEqual([60, 40]);
    expect(startingShares(null, TWO, [{ category_ref: null, rule: 'even' }])).toEqual([50, 50]);
  });

  it('works out the counted rule, the default and the out-of-date state', () => {
    const v = spendViewOf(null, TWO, mockDefaults, 'me', { hasJoint: true, hasPersonalCash: false, hasJointCash: true });
    expect(v).toMatchObject({ setup: 'joint', setupInferred: true, asked: 'bill', ruleIsDefault: true, counted: 'bill', outOfDate: false, myPercent: 60 });
    const old = spendViewOf(row({ rule: 'custom', shares: { me: 50, gone: 50 } }), TWO, mockDefaults, 'me', mockFacts);
    expect(old).toMatchObject({ asked: 'custom', counted: 'bring', outOfDate: true, myPercent: null });
  });

  it('adds only figures in the household currency and never counts a safety net or bills pot (Q5 money)', () => {
    expect(sharedMoneyTotal({ own: null, partners: [], joint: [], currency: 'USD' })).toBeNull();
    expect(
      sharedMoneyTotal({
        own: 100_000,
        partners: [{ left: 150_000, currency: 'USD' }, { left: 9_999, currency: 'EUR' }],
        joint: [
          { currency: 'USD', purpose: null, spendable: false, balance: 50_000 },
          { currency: 'USD', purpose: 'bills', spendable: false, balance: 70_000 },
          { currency: 'USD', purpose: 'savings', spendable: true, safetyNet: true, balance: 80_000 },
          { currency: 'USD', purpose: 'savings', spendable: true, balance: 1_000 },
        ],
        currency: 'USD',
      }),
    ).toBe(301_000);
    expect(moneyParts(300_000, [40, 60])).toEqual([120_000, 180_000]);
    expect(moneyParts(0, [40, 60])).toBeNull();
    expect(moneyParts(null, [40, 60])).toBeNull();
  });
});

describe('SpendRuleScreen', () => {
  it('shows nothing to pick for a household of one', async () => {
    mockMembers = [{ user_id: 'me', weight: 100 }];
    await setup();
    expect(screen.getByText('How spending is split')).toBeTruthy();
    expect(screen.queryByTestId('spend-setup-separate')).toBeNull();
  });

  it('shows the inferred setup and its default rule, tagged, with no rule saved', async () => {
    mockFacts = { hasJoint: true, hasPersonalCash: true, hasJointCash: true };
    await setup();
    expect(checked('spend-setup-mixed')).toBe(true);
    expect(screen.getByTestId('spend-setup-mixed-tag').props.children).toBe('Based on your accounts');
    expect(checked('spend-rule-bring')).toBe(true);
    expect(screen.getByTestId('spend-rule-bring-tag').props.children).toBe('Default for this setup');
    expect(screen.getByText('Each person’s share matches the bill split (By weight).')).toBeTruthy();
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
  });

  it('Q4: a rule nobody picked follows a new setup; the save sends no rule', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('spend-setup-joint'));
    expect(checked('spend-rule-bill')).toBe(true);
    expect(screen.getByTestId('spend-rule-bill-tag')).toBeTruthy();
    await fireEvent.press(saveButton());
    expect(mockSave).toHaveBeenCalledWith({}, { rule: null, setup: 'joint', shares: null, expectedVersion: null });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ text: { key: 'household.rules.spending.saved' }, onUndo: expect.any(Function) }));
  });

  it('Q4: a picked rule stays when the setup changes; the new default is only tagged', async () => {
    mockRow = row({ rule: 'custom', setup: 'separate', shares: { me: 70, sam: 30 } });
    await setup();
    await fireEvent.press(screen.getByTestId('spend-setup-joint'));
    expect(checked('spend-rule-custom')).toBe(true);
    expect(screen.getByTestId('spend-rule-bill-tag')).toBeTruthy();
  });

  it('opens the shares editor from the bill split, shows the money hint, and saves 100% with Undo (Q5)', async () => {
    mockShared = { total: 300_000, currency: 'USD' };
    await setup();
    await fireEvent.press(screen.getByTestId('spend-rule-custom'));
    expect(screen.getByTestId('spend-shares')).toBeTruthy();
    expect(screen.getByTestId('spend-shares-total')).toBeTruthy();
    expect(screen.getByTestId('spend-share-money-me').props.children).toBe('60% · about $1,800 of $3,000 shared');
    expect(screen.getByTestId('spend-share-money-sam').props.children).toBe('40% · about $1,200 of $3,000 shared');
    await fireEvent.press(screen.getByTestId('weight-up-sam'));
    expect(screen.getByTestId('spend-share-money-sam').props.children).toBe('45% · about $1,350 of $3,000 shared');
    await fireEvent.press(saveButton());
    expect(mockSave).toHaveBeenCalledWith({}, { rule: 'custom', setup: null, shares: { me: 55, sam: 45 }, expectedVersion: null });
    const undo = (mockToast.mock.calls[0]![0] as { onUndo: () => void }).onUndo;
    undo();
    expect(mockSave).toHaveBeenLastCalledWith({}, { rule: null, setup: null, shares: null, expectedVersion: 4 });
  });

  it('shows the percent alone when there is no money figure', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('spend-rule-custom'));
    expect(screen.queryByTestId('spend-share-money-me')).toBeNull();
  });

  it('starts the editor afresh (100%) when the saved shares no longer add up', async () => {
    mockRow = row({ rule: 'custom', shares: { me: 60, sam: 30 } });
    mockDefaults = [{ category_ref: null, rule: 'mine' }];
    await setup();
    // the stored shares do not fit (90%), so they count as out of date; the editor starts even (50/50) and Save is on for the fixed set
    await fireEvent.press(screen.getByLabelText('Update shares'));
    expect(screen.getByTestId('spend-shares-total')).toBeTruthy();
    expect(screen.getByLabelText('Your weight, 50 percent')).toBeTruthy();
    expect(saveButton().props.accessibilityState.disabled).toBe(false);
  });

  it('says out-of-date shares need updating, and Update shares opens the editor (Q6)', async () => {
    mockRow = row({ rule: 'custom', shares: { me: 50, gone: 50 } });
    await setup();
    expect(screen.getByTestId('spend-out-of-date')).toBeTruthy();
    expect(screen.getByText('Update spending shares because someone joined or left. Until you do, each check counts what each person brings in.')).toBeTruthy();
    expect(screen.queryByTestId('spend-shares')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Update shares'));
    expect(screen.getByTestId('spend-shares')).toBeTruthy();
  });

  it('shows the latest with who changed it on a version conflict', async () => {
    mockRow = row({ rule: 'bring', setup: 'separate' });
    mockSave.mockImplementation(async () => ({ ok: false, reason: 'version_conflict', updated_by: 'sam' }));
    await setup();
    await fireEvent.press(screen.getByTestId('spend-rule-bill'));
    await fireEvent.press(saveButton());
    await waitFor(() => expect(screen.getByTestId('spend-conflict')).toBeTruthy());
    expect(screen.getByText('Sam just changed this. You’re seeing the latest version.')).toBeTruthy();
    expect(checked('spend-rule-bring')).toBe(true);
  });

  it('is off with the connection helper while offline', async () => {
    mockOnline = false;
    await setup();
    await fireEvent.press(screen.getByTestId('spend-rule-custom'));
    expect(saveButton().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Needs a connection. Try again when you’re back online.')).toBeTruthy();
  });

  it('each choice has a tap-to-explain tip a screen reader can reach', async () => {
    await setup();
    const tip = screen.getByLabelText('What “Custom spending split” means');
    expect(tip.props.accessibilityState).toEqual({ expanded: false });
    await fireEvent.press(tip);
    expect(screen.getByTestId('spend-rule-custom-tip-text').props.children).toBe('Each check counts the share of everyone’s money set by the group for that person.');
    expect(screen.getByTestId('spend-rule-custom-tip-text').props.accessibilityLiveRegion).toBe('polite');
    for (const name of ['Separate accounts', 'One joint account', 'Mixed', 'What each person brings', 'Same as the bill split']) {
      expect(screen.getByLabelText(`What “${name}” means`)).toBeTruthy();
    }
  });
});

describe('08.1-25 zeroShareIdsOf (pure, Q1 A)', () => {
  const src = (over: Partial<JointAccountSource> = {}): JointAccountSource => ({
    id: 'j1', currency: 'USD', purpose: 'everyday', spendable: false, balance: 100_000, monthIn: 500_000, monthOut: 400_000,
    billsDueBeforeNextIn: 0, paidInBy: { sam: 500_000 }, ...over,
  });
  const parts = (over: Partial<Parameters<typeof zeroShareIdsOf>[0]> = {}): Parameters<typeof zeroShareIdsOf>[0] => ({
    sources: [src()], currency: 'USD', members: TWO, row: row({ rule: 'bring' }), defaults: [{ category_ref: null, rule: 'weight' }], setup: 'joint', ...over,
  });
  it('names the member who paid nothing in under What each person brings, and the 0% member under the bill split', () => {
    expect(zeroShareIdsOf(parts())).toEqual(['me']);
    const zeroWeight = [{ user_id: 'me', weight: 0 }, { user_id: 'sam', weight: 100 }];
    expect(zeroShareIdsOf(parts({ members: zeroWeight, row: row({ rule: 'bill' }), sources: [src({ paidInBy: {} })] }))).toEqual(['me']);
  });
  it('names nobody under a set split, with money carried from before, with no currency, or for one member', () => {
    expect(zeroShareIdsOf(parts({ row: row({ rule: 'custom', shares: { me: 0, sam: 100 } }) }))).toEqual([]);
    expect(zeroShareIdsOf(parts({ sources: [src({ balance: 160_000 })] }))).toEqual([]);
    expect(zeroShareIdsOf(parts({ currency: null }))).toEqual([]);
    expect(zeroShareIdsOf(parts({ members: [{ user_id: 'me', weight: 100 }] }))).toEqual([]);
  });
  it('a joint bills account counts nothing here (its dues are not known), and another currency is left out', () => {
    expect(zeroShareIdsOf(parts({ sources: [src({ purpose: 'bills' })] }))).toEqual([]);
    expect(zeroShareIdsOf(parts({ sources: [src({ currency: 'EUR' })] }))).toEqual([]);
  });
});

describe('08.1-25 percentsOf with a member at 0 (Rule 1 fix)', () => {
  it('gives the 0% member 0 and splits 100 among the rest, so a 100/0 split no longer throws', () => {
    expect(percentsOf([100, 0])).toEqual([100, 0]);
    expect(percentsOf([60, 40, 0])).toEqual([60, 40, 0]);
    expect(percentsOf([0, 1, 1])).toEqual([0, 50, 50]);
    expect(billPercentsOf([{ user_id: 'me', weight: 100 }, { user_id: 'sam', weight: 0 }], [{ category_ref: null, rule: 'weight' }])).toEqual({ me: 100, sam: 0 });
  });
});

describe('08.1-25 suggestion target', () => {
  it('equal shares fill whole percents that add up to 100; a route param is used only when it names a target', () => {
    expect(suggestionFor('equalShares').prefill(2)).toEqual([50, 50]);
    expect(suggestionFor('equalShares').prefill(3)).toEqual([34, 33, 33]);
    expect(suggestionFor(ZERO_SHARE_SUGGESTION).route).toEqual({ pathname: '/household/spending', params: { suggest: 'equalShares' } });
    expect(suggestTargetOf('equalShares')).toBe('equalShares');
    expect(suggestTargetOf(['equalShares'])).toBe('equalShares');
    expect(suggestTargetOf('freeAccess')).toBeUndefined();
    expect(suggestTargetOf('toString')).toBeUndefined();
    expect(suggestTargetOf(undefined)).toBeUndefined();
    expect(() => suggestionFor('nope')).toThrow(RangeError);
  });
});

describe('08.1-25 SpendRuleScreen: the $0 share card (Q3 A)', () => {
  it('names the member and opens the editor at equal shares; nothing is saved until Save', async () => {
    mockRow = row({ rule: 'bring', setup: 'joint' });
    mockZero = { ids: ['sam'], currency: 'USD' };
    await setup();
    expect(screen.getByText('With this rule, Sam’s share of joint money is $0 this month. With equal shares, everyone counts the same amount.')).toBeTruthy();
    expect(screen.queryByTestId('spend-shares')).toBeNull();
    await fireEvent.press(screen.getByLabelText('See equal shares'));
    expect(checked('spend-rule-custom')).toBe(true);
    expect(screen.getByTestId('spend-shares')).toBeTruthy();
    expect(screen.getByLabelText('Your weight, 50 percent')).toBeTruthy();
    expect(screen.queryByTestId('spend-zero-share')).toBeNull();
    expect(mockSave).toHaveBeenCalledTimes(0);
    await fireEvent.press(saveButton());
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith({}, { rule: 'custom', setup: 'joint', shares: { me: 50, sam: 50 }, expectedVersion: 3 });
  });

  it('three members open at 34/33/33; several names read their own words', async () => {
    mockMembers = [...TWO, { user_id: 'lee', weight: 0 }];
    mockRow = row({ rule: 'bring' });
    mockZero = { ids: ['sam', 'lee'], currency: 'USD' };
    await setup();
    expect(screen.getByText('With this rule, Sam and Lee have a $0 share of joint money this month. With equal shares, everyone counts the same amount.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('See equal shares'));
    await fireEvent.press(saveButton());
    expect(mockSave).toHaveBeenCalledWith({}, expect.objectContaining({ rule: 'custom', shares: { me: 34, sam: 33, lee: 33 } }));
  });

  it('says "your share" when the viewer is the one at $0', async () => {
    mockRow = row({ rule: 'bill' });
    mockZero = { ids: ['me'], currency: 'USD' };
    await setup();
    expect(screen.getByText('With this rule, your share of joint money is $0 this month. With equal shares, everyone counts the same amount.')).toBeTruthy();
  });

  it('no card with nobody at $0, under a saved set split, with no currency, or for a household of one', async () => {
    mockRow = row({ rule: 'bring' });
    await setup();
    expect(screen.queryByTestId('spend-zero-share')).toBeNull();
    await screen.unmount();
    mockRow = row({ rule: 'custom', shares: { me: 100, sam: 0 } });
    mockZero = { ids: ['sam'], currency: 'USD' };
    await setup();
    expect(screen.queryByTestId('spend-zero-share')).toBeNull();
    await screen.unmount();
    mockRow = row({ rule: 'bring' });
    mockZero = { ids: ['sam'], currency: null };
    await setup();
    expect(screen.queryByTestId('spend-zero-share')).toBeNull();
    await screen.unmount();
    mockMembers = [{ user_id: 'me', weight: 100 }];
    mockZero = { ids: ['sam'], currency: 'USD' };
    await setup();
    expect(screen.queryByTestId('spend-zero-share')).toBeNull();
  });

  it('opened with ?suggest=equalShares: the editor is open at equal shares and nothing is saved', async () => {
    mockRow = row({ rule: 'bring' });
    await setup({ suggest: 'equalShares' });
    expect(checked('spend-rule-custom')).toBe(true);
    expect(screen.getByTestId('spend-shares')).toBeTruthy();
    expect(screen.getByLabelText('Your weight, 50 percent')).toBeTruthy();
    expect(mockSave).toHaveBeenCalledTimes(0);
  });
});
