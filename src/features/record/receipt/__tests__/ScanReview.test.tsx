// 10.1-24 (SCN-01..03, SCN-05; D-12, D-18; UI-SPEC 5a, 5d): reading view, review screen and the sheet's discard prompt.
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ParsedReceipt } from '@/engine/receipt';
import { ReadingView, SLOW_AFTER_MS } from '../ReadingView';
import { ScanReview } from '../ScanReview';
import { ScanSheet } from '../ScanSheet';
import { cropLayout } from '../ItemRow';
import { fromParsed, type ReviewDraft } from '../scanModel';

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
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ showCents: true, homeCurrency: 'USD', userId: 'me', householdId: 'h', today: '2026-11-26', region: null, timeZone: 'UTC' }),
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
const mockHapticWarn = jest.fn();
const mockHapticTap = jest.fn();
jest.mock('@/ui/haptics', () => ({
  hapticTap: () => mockHapticTap(),
  hapticWarn: () => mockHapticWarn(),
  hapticTick: jest.fn(),
  hapticFailed: jest.fn(),
  hapticMilestone: jest.fn(),
}));

// ScanSheet's own hooks (the reading, the guesses, the writes and the account) are replaced.
let mockRead: { state: 'reading' | 'done' | 'stopped'; page: number; pageCount: number; outcome: unknown; pageOffsets: unknown[]; pageSizes: unknown[]; stop: jest.Mock };
jest.mock('../useReadReceipt', () => ({ useReadReceipt: () => mockRead }));
jest.mock('@/features/record/useGuessContext', () => ({ useGuessContext: () => ({ guess: {} }) }));
jest.mock('@/engine/receipt', () => ({
  ...jest.requireActual('@/engine/receipt'),
  suggestItemCategory: (name: string) => ({ categoryId: name === 'Oat milk' ? 'g' : null, source: name === 'Oat milk' ? 'item' : 'none' }),
}));
const mockConfirm = jest.fn();
jest.mock('../useConfirmScan', () => ({ useConfirmScan: () => ({ confirm: mockConfirm, conflict: null }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1', currency: 'USD', archived_at: null }] }) }));
// 10.1-27: ScanSheet reads feature access and the shared line's people; these lines are private, so there are none.
jest.mock('@/features/levels/useFeatureAccess', () => ({ useFeatureAccess: () => ({ visible: true }) }));
jest.mock('../useScanPeople', () => ({ useScanPeople: () => null }));

function receipt(over: Partial<ParsedReceipt> = {}): ParsedReceipt {
  return {
    store: { value: 'Corner Market', unsure: false },
    date: { value: '2026-11-20', unsure: false },
    total: { value: 1000, unsure: false },
    items: [
      { key: 'a', name: 'Oat milk', price: 450, discount: 0, unsure: true, frame: { left: 20, top: 300, width: 400, height: 30 } },
      { key: 'b', name: 'Bread', price: 470, discount: 0, unsure: false, frame: null },
    ],
    extras: [],
    currency: 'USD',
    ...over,
  };
}

const suggest = (name: string) => (name === 'Oat milk' ? { categoryId: 'g', source: 'item' } : { categoryId: null, source: 'none' });
const draftOf = (r: ParsedReceipt | null, mode: 'new' | 'existing' = 'new'): ReviewDraft =>
  fromParsed(r ? { readable: true, receipt: r } : null, {
    mode,
    images: [{ uri: 'file:///p1.jpg', mime: 'image/jpeg', width: 800, height: 1600 }],
    suggest,
  });

async function renderReview(draft: ReviewDraft, handlers: Partial<React.ComponentProps<typeof ScanReview>> = {}) {
  const props = { draft, currency: 'USD', onChange: jest.fn(), onConfirm: jest.fn(), onDiscard: jest.fn(), onTryAnother: jest.fn(), ...handlers };
  await render(
    <ThemeProvider>
      <ScanReview {...props} />
    </ThemeProvider>,
  );
  return props;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ReadingView', () => {
  it('announces, says it reads on the phone, counts pages, goes slow after 8 s and stops', async () => {
    jest.useFakeTimers();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const onStop = jest.fn();
    await render(
      <ThemeProvider>
        <ReadingView page={2} pageCount={3} onStop={onStop} />
      </ThemeProvider>,
    );
    expect(announce).toHaveBeenCalledWith('Reading your receipt');
    expect(screen.getByText('Reading on your phone')).toBeTruthy();
    expect(screen.getByText('Page 2 of 3')).toBeTruthy();
    expect(screen.queryByText('Still reading. This can take a moment.')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(SLOW_AFTER_MS);
    });
    expect(screen.getByText('Still reading. This can take a moment.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Stop reading'));
    expect(onStop).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('shows no page bar for a single photo', async () => {
    await render(
      <ThemeProvider>
        <ReadingView page={1} pageCount={1} onStop={jest.fn()} />
      </ThemeProvider>,
    );
    expect(screen.queryByText('Page 1 of 1')).toBeNull();
  });
});

describe('ScanReview', () => {
  it('marks an unsure item with Check this, a crop and the spoken summary', async () => {
    await renderReview(draftOf(receipt({ total: { value: 920, unsure: false } })));
    expect(screen.getByText('Corner Market')).toBeTruthy();
    expect(screen.getByText('Likely category')).toBeTruthy();
    expect(screen.getAllByText('Check this').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('scan-item-crop')).toBeTruthy();
    expect(screen.getByLabelText(/^Oat milk, .*4.*50.*, Groceries, Check this$/)).toBeTruthy();
    expect(screen.getByText('Choose a category')).toBeTruthy();
    expect(screen.getByText('FincWin reads the printed words. Check each figure before you use it.')).toBeTruthy();
    expect(mockHapticWarn).not.toHaveBeenCalled();
  });

  it('says by how much it does not add up, twice, and blocks the button until a choice', async () => {
    const onChange = jest.fn();
    const onConfirm = jest.fn();
    await renderReview(draftOf(receipt()), { onChange, onConfirm });
    expect(screen.getAllByText('Doesn’t add up')).toHaveLength(2);
    expect(screen.getAllByText('$0.80 short')).toHaveLength(2);
    expect(mockHapticWarn).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('scan-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('scan-confirm').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getAllByText('Use the receipt total')[0]!);
    const next = onChange.mock.calls[0]![0] as ReviewDraft;
    expect(next.items.find((i) => i.name === 'Other')?.price).toBe(80);
    await fireEvent.press(screen.getAllByText('Use the items total')[0]!);
    expect((onChange.mock.calls[1]![0] as ReviewDraft).total.value).toBe(920);
  });

  it('confirms when the list adds up, with the right button word per mode', async () => {
    const onConfirm = jest.fn();
    await renderReview(draftOf(receipt({ total: { value: 920, unsure: false } })), { onConfirm });
    expect(screen.queryByText('Doesn’t add up')).toBeNull();
    await fireEvent.press(screen.getByText('Add this line'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('existing mode says Use this receipt', async () => {
    await renderReview({ ...draftOf(receipt({ total: { value: 920, unsure: false } })), mode: 'existing' });
    expect(screen.getByText('Use this receipt')).toBeTruthy();
  });

  it('shows tax, tip and discounts as their own rows', async () => {
    await renderReview(
      draftOf(
        receipt({
          total: { value: 1000, unsure: false },
          extras: [
            { key: 't', kind: 'tax', name: 'Tax', amount: 120, unsure: false, frame: null },
            { key: 'd', kind: 'discount', name: 'Coupon', amount: 40, unsure: false, frame: null },
          ],
        }),
      ),
    );
    expect(screen.getByText('Tax, tip and discounts')).toBeTruthy();
    expect(screen.getByText('Tax')).toBeTruthy();
    expect(screen.getByText('-$0.40')).toBeTruthy();
    expect(screen.getByText('Discount')).toBeTruthy();
  });

  it('an empty read says Nothing was read with Add an item and Try another photo', async () => {
    const onTryAnother = jest.fn();
    const onChange = jest.fn();
    await renderReview(draftOf(null), { onTryAnother, onChange });
    expect(screen.getByText('Nothing was read')).toBeTruthy();
    expect(screen.getByText('Add the items yourself, or try another photo.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try another photo'));
    expect(onTryAnother).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Add an item'));
    expect((onChange.mock.calls[0]![0] as ReviewDraft).items).toHaveLength(1);
  });

  it('edits and removes an item', async () => {
    const onChange = jest.fn();
    await renderReview(draftOf(receipt({ total: { value: 920, unsure: false } })), { onChange });
    await fireEvent.press(screen.getAllByLabelText('Remove Bread')[0]!);
    expect((onChange.mock.calls[0]![0] as ReviewDraft).items.map((i) => i.name)).toEqual(['Oat milk']);
    await fireEvent.press(screen.getAllByTestId('scan-item-summary')[1]!);
    await fireEvent.changeText(screen.getByTestId('scan-item-name'), 'Rye bread');
    expect((onChange.mock.calls[1]![0] as ReviewDraft).items[1]!.name).toBe('Rye bread');
  });
});

describe('cropLayout', () => {
  it('centres the item line in the 96 window', async () => {
    const box = cropLayout({ left: 20, top: 300, width: 400, height: 30 }, { width: 800, height: 1600 });
    expect(box.width).toBe(175);
    expect(box).toEqual({ width: 175, height: 349, left: 0, top: -21 });
  });
});

describe('ScanSheet', () => {
  const sheet = async (over: Partial<React.ComponentProps<typeof ScanSheet>> = {}) => {
    const props = { visible: true, mode: 'new' as const, householdId: 'h', images: [{ uri: 'file:///p1.jpg', mime: 'image/jpeg' }], onClose: jest.fn(), onDone: jest.fn(), ...over };
    const view = await render(
      <ThemeProvider>
        <ScanSheet {...props} />
      </ThemeProvider>,
    );
    return { props, view };
  };

  it('Stop while reading closes without saving', async () => {
    mockRead = { state: 'reading', page: 1, pageCount: 1, outcome: null, pageOffsets: [], pageSizes: [], stop: jest.fn() };
    const { props } = await sheet();
    await fireEvent.press(screen.getByText('Stop reading'));
    expect(mockRead.stop).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('opens the review, announces the count, and Discard with edits asks first and writes nothing', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    mockRead = { state: 'done', page: 1, pageCount: 1, outcome: { readable: true, receipt: receipt({ total: { value: 920, unsure: false } }) }, pageOffsets: [], pageSizes: [], stop: jest.fn() };
    const { props } = await sheet();
    expect(await screen.findByText('Check the receipt')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Receipt read, 2 items');
    await fireEvent.press(screen.getAllByLabelText('Remove Bread')[0]!);
    await fireEvent.press(screen.getByText('Discard'));
    expect(screen.getByText('Discard this receipt?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Keep editing'));
    expect(props.onClose).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Discard'));
    await fireEvent.press(screen.getAllByText('Discard').at(-1)!);
    expect(props.onClose).toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('Discard without edits closes at once; confirm hands the draft over and reports the line', async () => {
    mockRead = { state: 'done', page: 1, pageCount: 1, outcome: { readable: true, receipt: receipt({ total: { value: 920, unsure: false } }) }, pageOffsets: [], pageSizes: [], stop: jest.fn() };
    mockConfirm.mockResolvedValueOnce({ ok: true, lineId: 'new-1' });
    const { props } = await sheet();
    await screen.findByText('Check the receipt');
    await act(async () => {
      await fireEvent.press(screen.getByText('Add this line'));
    });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(props.onDone).toHaveBeenCalledWith('new-1');
    expect(mockHapticTap).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Discard'));
    expect(screen.queryByText('Discard this receipt?')).toBeNull();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('an unreadable outcome opens the empty review and says so', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    mockRead = { state: 'done', page: 1, pageCount: 1, outcome: { readable: false, receipt: receipt({ items: [], total: { value: null, unsure: true } }) }, pageOffsets: [], pageSizes: [], stop: jest.fn() };
    await sheet();
    expect(await screen.findByText('Nothing was read')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('That receipt didn’t read clearly');
  });
});
