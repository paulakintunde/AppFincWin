// 10.1-27 (SCN-06, SCN-07; D-14..D-17; UI-SPEC 6): the split-by-item controls on the scan review, and ScanSheet's prefill.
import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ParsedReceipt } from '@/engine/receipt';
import type { StoredItemSplit, TransactionRow } from '@/db/rows';
import { ScanReview } from '../ScanReview';
import { ScanSheet } from '../ScanSheet';
import { fromParsed, withMembers, type ReviewDraft } from '../scanModel';

jest.setTimeout(60000);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'alex' } }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ showCents: true, homeCurrency: 'USD', userId: 'alex', householdId: 'h', today: '2026-11-26', region: null, timeZone: 'UTC' }),
}));
jest.mock('@/data/queries/categories', () => {
  const all = [
    { id: 'g', builtin_key: 'Groceries', name: null, color_key: 'green', is_system: false, archived_at: null },
    { id: 'hh', builtin_key: 'Household', name: null, color_key: 'slate', is_system: false, archived_at: null },
  ];
  return {
    useCategoryLookup: () => ({ all, active: all, byId: new Map(all.map((c) => [c.id, c])), transferCategoryId: null, builtinIds: new Map(), loading: false }),
  };
});
jest.mock('@/features/household/components/MemberAvatar', () => ({ MemberAvatar: () => null }));
const mockTick = jest.fn();
jest.mock('@/ui/haptics', () => ({
  hapticTap: jest.fn(),
  hapticWarn: jest.fn(),
  hapticTick: () => mockTick(),
  hapticFailed: jest.fn(),
  hapticMilestone: jest.fn(),
}));
// The split sheet is replaced: "Edit parts" is checked through the props it gets.
const mockSplitSheet = jest.fn();
jest.mock('@/features/record/split/CategorySplitSheet', () => ({
  CategorySplitSheet: (p: unknown) => {
    mockSplitSheet(p);
    return null;
  },
}));

// ScanSheet's own hooks.
let mockRead: { state: 'reading' | 'done' | 'stopped'; page: number; pageCount: number; outcome: unknown; pageOffsets: unknown[]; pageSizes: unknown[]; stop: jest.Mock };
jest.mock('../useReadReceipt', () => ({ useReadReceipt: () => mockRead }));
jest.mock('@/features/record/useGuessContext', () => ({ useGuessContext: () => ({ guess: {} }) }));
jest.mock('@/engine/receipt', () => ({
  ...jest.requireActual('@/engine/receipt'),
  suggestItemCategory: (name: string) => ({ categoryId: name === 'Oat milk' ? 'g' : 'hh', source: 'item' }),
}));
const mockConfirm = jest.fn();
jest.mock('../useConfirmScan', () => ({ useConfirmScan: () => ({ confirm: mockConfirm, conflict: null }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1', currency: 'USD', archived_at: null }] }) }));
jest.mock('@/features/levels/useFeatureAccess', () => ({ useFeatureAccess: () => ({ visible: true }) }));
let mockPeople: unknown = null;
jest.mock('../useScanPeople', () => ({ useScanPeople: () => mockPeople }));

const MEMBERS = [
  { id: 'alex', name: 'Alex' },
  { id: 'sam', name: 'Sam' },
];

function receipt(over: Partial<ParsedReceipt> = {}): ParsedReceipt {
  return {
    store: { value: 'Corner Market', unsure: false },
    date: { value: '2026-11-20', unsure: false },
    total: { value: 2420, unsure: false },
    items: [
      { key: 'a', name: 'Oat milk', price: 1200, discount: 0, unsure: false, frame: null },
      { key: 'b', name: 'Bread', price: 1000, discount: 0, unsure: false, frame: null },
    ],
    extras: [{ key: 'x', kind: 'tax', name: 'Tax', amount: 220, unsure: false, frame: null }],
    currency: 'USD',
    ...over,
  };
}

const suggest = (name: string) => (name === 'Oat milk' ? { categoryId: 'g', source: 'item' } : { categoryId: 'hh', source: 'item' });
const privateDraft = (r: ParsedReceipt = receipt()): ReviewDraft =>
  fromParsed({ readable: true, receipt: r }, { mode: 'existing', images: [], lineTotal: -(r.total.value ?? 0), lineCategoryId: 'g', suggest });
const sharedDraft = (r?: ParsedReceipt): ReviewDraft => withMembers(privateDraft(r), MEMBERS, ['alex', 'sam']);

function Harness({ initial, ...rest }: { initial: ReviewDraft } & Partial<React.ComponentProps<typeof ScanReview>>) {
  const [draft, setDraft] = useState(initial);
  return (
    <ScanReview
      draft={draft}
      currency="USD"
      onChange={setDraft}
      onConfirm={jest.fn()}
      onDiscard={jest.fn()}
      onTryAnother={jest.fn()}
      householdId="h"
      lineSign={-1}
      lineCategoryId="g"
      ruleWord="evenly"
      {...rest}
    />
  );
}

async function renderHarness(initial: ReviewDraft, rest: Partial<React.ComponentProps<typeof ScanReview>> = {}) {
  await render(
    <ThemeProvider>
      <Harness initial={initial} {...rest} />
    </ThemeProvider>,
  );
}

const chip = (item: string, name: string) => screen.getByLabelText(`${name}, ${item}`);

beforeEach(() => {
  jest.clearAllMocks();
  mockPeople = null;
});

describe('ScanReview split by item', () => {
  it('shows the toggle on, every usual person on every item, and "as usual" on the first item only', async () => {
    await renderHarness(sharedDraft());
    expect(screen.getByText('Split items between people')).toBeTruthy();
    expect(screen.getByRole('switch').props.accessibilityState).toMatchObject({ checked: true });
    for (const item of ['Oat milk', 'Bread']) {
      for (const name of ['Alex', 'Sam']) {
        expect(chip(item, name).props.accessibilityRole).toBe('checkbox');
        expect(chip(item, name).props.accessibilityState).toMatchObject({ checked: true });
      }
    }
    expect(screen.getAllByText('Split evenly as usual')).toHaveLength(1);
    expect(screen.queryByText('Back to the usual split')).toBeNull();
    expect(screen.getByText('Tax, tip and discounts are shared in proportion to each person’s items.')).toBeTruthy();
    expect(screen.getByText('Each person’s share')).toBeTruthy();
    expect(screen.getAllByText('$12.10')).toHaveLength(2);
    expect(screen.getByText('Save split by item')).toBeTruthy();
  });

  it('updates the shares when a chip is tapped, keeps the last person on, and goes back to the usual split', async () => {
    await renderHarness(sharedDraft());
    await fireEvent.press(chip('Oat milk', 'Sam'));
    expect(mockTick).toHaveBeenCalledTimes(1);
    expect(chip('Oat milk', 'Sam').props.accessibilityState).toMatchObject({ checked: false });
    // Alex: 12.00 + 5.00 items, 1.70 of the tax; Sam: 5.00 + 0.50.
    expect(screen.getByText('$18.70')).toBeTruthy();
    expect(screen.getByText('$5.50')).toBeTruthy();
    expect(screen.getByText('Adds up')).toBeTruthy();
    expect(screen.queryByText('Split evenly as usual')).toBeNull();

    // Alex is now the only one on Oat milk: that chip cannot be turned off.
    expect(chip('Oat milk', 'Alex').props.accessibilityState).toMatchObject({ checked: true, disabled: true });
    await fireEvent.press(chip('Oat milk', 'Alex'));
    expect(chip('Oat milk', 'Alex').props.accessibilityState).toMatchObject({ checked: true });

    await fireEvent.press(screen.getByText('Back to the usual split'));
    expect(chip('Oat milk', 'Sam').props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getAllByText('$12.10')).toHaveLength(2);
    expect(screen.getByText('Split evenly as usual')).toBeTruthy();
  });

  it('turning the toggle off hides the people and saves as the parts', async () => {
    await renderHarness(sharedDraft());
    await fireEvent.press(screen.getByRole('switch'));
    expect(screen.queryByTestId('who-chips')).toBeNull();
    expect(screen.queryByTestId('person-totals')).toBeNull();
    expect(screen.getByText('Use this receipt')).toBeTruthy();
  });

  it('shows where it goes, read only, with Edit parts and its note', async () => {
    const onEditParts = jest.fn();
    await renderHarness(sharedDraft(), { onEditParts });
    expect(screen.getByText('Where it goes')).toBeTruthy();
    // Groceries, Household and the 'Tax and tip' part (D-20), amounts read only.
    expect(screen.getAllByTestId('where-part')).toHaveLength(3);
    const where = within(screen.getByTestId('where-it-goes'));
    expect(where.getByText('$12.00')).toBeTruthy();
    expect(where.getByText('$10.00')).toBeTruthy();
    expect(where.getByText('$2.20')).toBeTruthy();
    expect(where.getByText('Tax and tip')).toBeTruthy();
    expect(where.queryByRole('adjustable')).toBeNull();
    expect(screen.getByText('Editing the parts here stops the item split.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Edit parts'));
    expect(onEditParts).toHaveBeenCalledTimes(1);
  });

  it('after the parts were edited by hand: the note stays, the people go, the save is the plain one', async () => {
    await renderHarness(sharedDraft(), { partsEdited: true, onEditParts: jest.fn() });
    expect(screen.getByTestId('scan-parts-edited')).toBeTruthy();
    expect(screen.queryByText('Split items between people')).toBeNull();
    expect(screen.queryByTestId('who-chips')).toBeNull();
    expect(screen.getByText('Use this receipt')).toBeTruthy();
  });

  it('enables Save split by item only when the shares and the parts add up to the total', async () => {
    const onConfirm = jest.fn();
    await renderHarness(sharedDraft(receipt({ total: { value: 2500, unsure: false } })), { onConfirm });
    const save = () => screen.getByLabelText('Save split by item');
    expect(save().props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(save());
    expect(onConfirm).not.toHaveBeenCalled();
    await fireEvent.press(screen.getAllByText('Use the items total')[0]!);
    expect(save().props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(save());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('a private line never shows people controls (T-10.1-27-02)', async () => {
    await renderHarness(privateDraft());
    expect(screen.queryByText('Split items between people')).toBeNull();
    expect(screen.queryByTestId('who-chips')).toBeNull();
    expect(screen.queryByTestId('person-totals')).toBeNull();
    expect(screen.queryByTestId('where-it-goes')).toBeNull();
    expect(screen.getByText('Use this receipt')).toBeTruthy();
  });
});

describe('ScanSheet with a saved split by item', () => {
  const line = {
    id: 'l1',
    household_id: 'h',
    original_amount: -2420,
    original_currency: 'USD',
    category_id: 'g',
    category_parts: null,
    local_date: '2026-11-20',
    version: 3,
    is_shared: true,
    split_rule: 'even',
  } as unknown as TransactionRow;
  const saved: StoredItemSplit = {
    store: 'Corner Market',
    date: '2026-11-20',
    items: [
      { name: 'Oat milk', price: 1200, discount: 0, c: 'g', people: ['alex'] },
      { name: 'Bread', price: 1000, discount: 0, c: 'hh', people: ['alex', 'sam'] },
    ],
    extras: { tax: 220, tip: 0, discounts: 0 },
    by: 'sam',
    at: '2026-11-21T10:00:00Z',
  };

  it('opens straight on the review with the saved items and people', async () => {
    mockRead = { state: 'reading', page: 1, pageCount: 0, outcome: null, pageOffsets: [], pageSizes: [], stop: jest.fn() };
    mockPeople = { members: MEMBERS, usual: ['alex', 'sam'], rule: 'even' };
    await render(
      <ThemeProvider>
        <ScanSheet visible mode="existing" line={line} householdId="h" images={[]} prefill={saved} onClose={jest.fn()} onDone={jest.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('scan-review')).toBeTruthy();
    expect(screen.getByText('Oat milk')).toBeTruthy();
    expect(screen.getByText('Tax')).toBeTruthy();
    expect(chip('Oat milk', 'Sam').props.accessibilityState).toMatchObject({ checked: false });
    expect(chip('Bread', 'Sam').props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText('Back to the usual split')).toBeTruthy();
    await fireEvent.press(screen.getByText('Edit parts'));
    expect(mockSplitSheet).toHaveBeenCalledWith(expect.objectContaining({ line, initialParts: expect.any(Array) }));
  });

  it('a private line in the sheet gets no people even with members around', async () => {
    mockRead = { state: 'done', page: 1, pageCount: 1, outcome: { readable: true, receipt: receipt() }, pageOffsets: [], pageSizes: [], stop: jest.fn() };
    mockPeople = null; // useScanPeople returns null for a private line
    await render(
      <ThemeProvider>
        <ScanSheet visible mode="existing" line={{ ...line, is_shared: false }} householdId="h" images={[{ uri: 'file:///p.jpg', mime: 'image/jpeg' }]} onClose={jest.fn()} onDone={jest.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('scan-review')).toBeTruthy();
    expect(screen.queryByText('Split items between people')).toBeNull();
  });
});
