import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { CARD_CHOICE, loggedSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { CURRENCIES_HREF, HomeProblemsSheet, type HomeProblemsSheetProps } from '../HomeProblemsSheet';
import type { ProblemEntry } from '../homeProblems';

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', ready: true }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'acc-card', currency: 'USD', name: 'Visa' }] }) }));
jest.mock('@/data/queries/decide', () => ({ useDebts: () => ({ data: [] }) }));
const mockSaveTerms = jest.fn();
jest.mock('@/data/mutations/decideLinks', () => ({ useSaveCardTerms: () => ({ save: (...a: unknown[]) => mockSaveTerms(...a) }) }));

// Spy on the source modules so each stacked sheet shows up as a marker.
jest.mock('@/ui/FailedWritesSheet', () => {
  const { Text } = require('react-native');
  return { FailedWritesSheet: ({ visible }: { visible: boolean }) => (visible ? <Text testID="failed-writes-sheet" /> : null) };
});
jest.mock('../RoughFiguresSheet', () => {
  const { Text } = require('react-native');
  return { RoughFiguresSheet: ({ visible }: { visible: boolean }) => (visible ? <Text testID="rough-figures-sheet" /> : null) };
});
const mockCardSheet = jest.fn();
jest.mock('../../check/steps/step2/CardMinimumSheet', () => {
  const { Text } = require('react-native');
  return {
    CardMinimumSheet: (props: { visible: boolean }) => {
      mockCardSheet(props);
      return props.visible ? <Text testID="card-minimum-sheet" /> : null;
    },
  };
});
// Stands in for the sheet so stacked content renders inline.
jest.mock('@/ui/Sheet', () => {
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null),
    SheetScroll: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

const NO_FIGURES: ProblemEntry = { id: 'no_figures', counted: false, action: { kind: 'add_rough' } };
const RATE_LINES: ProblemEntry = { id: 'missing_rate', variant: 'lines', currency: 'EUR', rowCount: 2, counted: false, action: { kind: 'exchange_rates' } };
const RATE_CHECK: ProblemEntry = { id: 'missing_rate', variant: 'check', currency: 'JPY', checkCount: 1, counted: true, action: { kind: 'exchange_rates' } };
const FAILED: ProblemEntry = { id: 'failed_saves', count: 2, counted: true, action: { kind: 'review_changes' } };
const CONFLICTS: ProblemEntry = { id: 'conflicts', count: 1, counted: true, action: { kind: 'review_edits' } };
const CARD_MIN: ProblemEntry = { id: 'card_minimum', accountId: CARD_CHOICE.accountId, cardName: 'Visa', counted: true, action: { kind: 'card_minimum', accountId: CARD_CHOICE.accountId } };
const STALE: ProblemEntry = { id: 'stale_rate', currency: 'EUR', rateDate: '2026-08-01', counted: true, action: { kind: 'exchange_rates' } };
const OFFLINE: ProblemEntry = { id: 'sync', label: { key: 'sync.offlineWaiting', count: 3 }, dot: true, counted: true, action: null };

function props(entries: ProblemEntry[], over: Partial<HomeProblemsSheetProps> = {}): HomeProblemsSheetProps {
  return { entries, visible: true, onClose: jest.fn(), source: loggedSource(), settings: null, userId: 'u1', currency: 'USD', ...over };
}

beforeEach(() => jest.clearAllMocks());

describe('HomeProblemsSheet', () => {
  it('D-96 each problem shows what it affects and one action', async () => {
    await wrap(<HomeProblemsSheet {...props([NO_FIGURES, RATE_CHECK, FAILED, CONFLICTS, CARD_MIN, STALE, OFFLINE])} />);
    expect(screen.getByText('Needs a look')).toBeTruthy();
    expect(screen.getByText('No month of figures yet')).toBeTruthy();
    expect(screen.getByText('Affects: Left this month and every check')).toBeTruthy();
    expect(screen.getByText('Add rough figures')).toBeTruthy();
    expect(screen.getByText('No exchange rate stored for JPY')).toBeTruthy();
    expect(screen.getByText(/^Affects: 1.open check typed in JPY$/)).toBeTruthy();
    expect(screen.getByText(/^2.changes didn’t save$/)).toBeTruthy();
    expect(screen.getByText('Review changes')).toBeTruthy();
    expect(screen.getByText(/^1.edit changed on another device$/)).toBeTruthy();
    expect(screen.getByText('Review edits')).toBeTruthy();
    expect(screen.getByText('Card minimum payment not set for Visa')).toBeTruthy();
    expect(screen.getByText('Card minimum payment')).toBeTruthy();
    expect(screen.getByText(/^The EUR rate is from /)).toBeTruthy();
    expect(screen.getByText('Affects: Amounts converted from EUR')).toBeTruthy();
    // Offline: no action, the declarative line.
    expect(screen.getByText(/^Offline · 3.changes waiting$/)).toBeTruthy();
    expect(screen.getByText('Affects: Saves on this device')).toBeTruthy();
    expect(screen.getByText('They send when the connection returns.')).toBeTruthy();
    // One action per actionable entry: 6 buttons plus Close.
    expect(screen.getAllByRole('button')).toHaveLength(7);
    // Each entry reads as one group followed by its action.
    expect(screen.getByLabelText('No month of figures yet. Affects Left this month and every check.')).toBeTruthy();
  });

  it('D-96 Add rough figures stacks the rough figures sheet', async () => {
    await wrap(<HomeProblemsSheet {...props([NO_FIGURES])} />);
    expect(screen.queryByTestId('rough-figures-sheet')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Add rough figures'));
    expect(screen.getByTestId('rough-figures-sheet')).toBeTruthy();
  });

  it('D-96 Review changes opens the failed saves sheet', async () => {
    await wrap(<HomeProblemsSheet {...props([FAILED, CONFLICTS])} />);
    expect(screen.queryByTestId('failed-writes-sheet')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Review changes'));
    expect(screen.getByTestId('failed-writes-sheet')).toBeTruthy();
  });

  it('D-96 Review edits opens the same list', async () => {
    await wrap(<HomeProblemsSheet {...props([CONFLICTS])} />);
    await fireEvent.press(screen.getByLabelText('Review edits'));
    expect(screen.getByTestId('failed-writes-sheet')).toBeTruthy();
  });

  it('D-96 Card minimum payment opens the card terms sheet and saves through the card debt', async () => {
    await wrap(<HomeProblemsSheet {...props([CARD_MIN])} />);
    await fireEvent.press(screen.getByLabelText('Card minimum payment'));
    expect(screen.getByTestId('card-minimum-sheet')).toBeTruthy();
    const sheetProps = mockCardSheet.mock.calls.at(-1)![0] as { onSave: (t: unknown) => void; terms: unknown };
    expect(sheetProps.terms).toBe(CARD_CHOICE.terms);
    const terms = { percentText: '2', interestAdded: true, floor: 2500, paidInFull: false };
    sheetProps.onSave(terms);
    expect(mockSaveTerms).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', householdId: 'h1', accountId: CARD_CHOICE.accountId, terms }));
  });

  it('D-96 Exchange rates opens You focused on the currency row', async () => {
    const onClose = jest.fn();
    await wrap(<HomeProblemsSheet {...props([RATE_LINES, STALE], { onClose })} />);
    await fireEvent.press(screen.getAllByLabelText('Exchange rates')[0]!);
    expect(CURRENCIES_HREF).toBe('/you?focus=currencies');
    expect(mockPush).toHaveBeenCalledWith('/you?focus=currencies');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('D-96 the sheet closes when nothing is left', async () => {
    const { rerender } = await wrap(<HomeProblemsSheet {...props([FAILED])} />);
    expect(screen.getByText('Needs a look')).toBeTruthy();
    await rerender(<HomeProblemsSheet {...props([])} />);
    expect(screen.queryByText('Needs a look')).toBeNull();
  });

  it('D-96 the sheet stays up while a fixing sheet it opened is still open', async () => {
    const { rerender } = await wrap(<HomeProblemsSheet {...props([FAILED])} />);
    await fireEvent.press(screen.getByLabelText('Review changes'));
    await rerender(<HomeProblemsSheet {...props([])} />);
    expect(screen.getByTestId('failed-writes-sheet')).toBeTruthy();
  });

  it('R17.7 focus starts on the sheet title', async () => {
    const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    await wrap(<HomeProblemsSheet {...props([FAILED])} />);
    await fireEvent(screen.getByText('Needs a look'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 24 } } });
    expect(send).toHaveBeenCalledWith(expect.anything(), 'focus');
    expect(screen.getByText('Needs a look').props.accessibilityRole).toBe('header');
  });
});
