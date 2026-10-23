import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import * as decideChecks from '@/data/mutations/decideChecks';
import * as failedWrites from '@/data/sync/failedWrites';
import type { FailedWrite } from '@/data/sync/failedWrites';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { FailedWritesSheet } from '../FailedWritesSheet';
import { SyncStatusLine } from '../SyncStatusLine';
import { failedEntityKey, failedReasonKey, failedWriteName } from '../failedWriteLabels';

jest.mock('../Sheet', () => {
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null),
    SheetScroll: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});
jest.mock('@/data/sync/useSyncStatus', () => ({ useSyncStatus: jest.fn() }));

jest.setTimeout(20000);

const withClient = (ui: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient()}>
    <ThemeProvider>{ui}</ThemeProvider>
  </QueryClientProvider>
);

const entry = (over: Partial<FailedWrite>): FailedWrite => ({
  id: 'w1',
  entity: 'decide_checks',
  entityId: 'c1',
  kind: 'rejected',
  code: '42501',
  attempted: { name: 'Sofa' },
  at: '2026-10-22T10:30:00.000Z',
  ...over,
});

const two = [entry({}), entry({ id: 'w2', entity: 'decide_settings', attempted: {}, code: 'weird' })];

afterEach(() => jest.restoreAllMocks());

function mount(list: readonly FailedWrite[]) {
  jest.spyOn(failedWrites, 'getFailedWrites').mockReturnValue(list);
  const dismiss = jest.spyOn(failedWrites, 'dismissFailedWrite').mockResolvedValue(undefined);
  const onClose = jest.fn();
  return { dismiss, onClose, ui: render(withClient(<FailedWritesSheet visible onClose={onClose} />)) };
}

describe('FailedWritesSheet', () => {
  it('lists what each failed write was, when, and why', async () => {
    const { ui } = mount(two);
    const { getByText, getAllByText } = await ui;
    expect(getByText('Decide check: Sofa')).toBeTruthy();
    expect(getByText('Decide settings')).toBeTruthy();
    expect(getAllByText('The server refused this change.').length).toBe(2); // 42501, and a code with no mapping
  });

  it('dismisses one row by its own button', async () => {
    const { ui, dismiss } = mount(two);
    const { getByLabelText } = await ui;
    await fireEvent.press(getByLabelText('Dismiss Decide check: Sofa'));
    expect(dismiss).toHaveBeenCalledWith('w1');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('Dismiss all asks first, then dismisses every row', async () => {
    const { ui, dismiss } = mount(two);
    const { getByText, queryByText, getAllByLabelText } = await ui;
    expect(queryByText('Dismiss all?')).toBeNull();
    await fireEvent.press(getByText('Dismiss all'));
    expect(getByText('Dismiss all?')).toBeTruthy();
    expect(getByText('2 changes are removed from this list and are not retried.')).toBeTruthy();
    expect(dismiss).not.toHaveBeenCalled();
    await fireEvent.press(getByText('Cancel'));
    expect(dismiss).not.toHaveBeenCalled();
    await fireEvent.press(getByText('Dismiss all'));
    const confirmButtons = getAllByLabelText('Dismiss all');
    const confirm = confirmButtons[confirmButtons.length - 1];
    if (!confirm) throw new Error('no confirm button');
    await fireEvent.press(confirm);
    expect(dismiss.mock.calls.map((c) => c[0])).toEqual(['w1', 'w2']);
  });

  it('offers Try again only for a refused check create, and re-creates it', async () => {
    const parked = entry({
      id: 'w3',
      attempted: { op: 'create', name: 'Sofa', kind: 'buy', furthestStep: 2, inputs: { kind: 'buy' }, householdId: 'h1', userId: 'u1' },
    });
    const retry = jest.spyOn(decideChecks, 'useRetryCheckCreate').mockReturnValue({ retry: jest.fn(() => true) });
    const { ui } = mount([parked, entry({ id: 'w4' })]);
    const { getAllByLabelText, getByLabelText } = await ui;
    expect(getAllByLabelText(/^Try again/)).toHaveLength(1);
    await fireEvent.press(getByLabelText('Try again: Decide check: Sofa'));
    expect(retry.mock.results[0]?.value.retry).toHaveBeenCalledWith(parked);
  });

  it('shows the empty line and no Dismiss all for an empty list, and closes from the header', async () => {
    const { ui, onClose } = mount([]);
    const { getByText, queryByText } = await ui;
    expect(getByText('Nothing is waiting here.')).toBeTruthy();
    expect(queryByText('Dismiss all')).toBeNull();
    await fireEvent.press(getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps an unreadable date out of the row', async () => {
    const { ui } = mount([entry({ at: 'not a date' })]);
    expect((await ui).getByText('Decide check: Sofa')).toBeTruthy();
  });
});

describe('SyncStatusLine failed-saves button', () => {
  it('is a button that opens the list, for failed and for conflicting writes', async () => {
    jest.spyOn(failedWrites, 'getFailedWrites').mockReturnValue(two);
    (useSyncStatus as jest.Mock).mockReturnValue({ isOnline: true, queued: 0, failed: 2, conflicts: 1, lastSyncedAt: Date.now() });
    const { getByText, queryByText, getAllByRole } = await render(withClient(<SyncStatusLine />));
    expect(queryByText('Changes that couldn’t save')).toBeNull();
    expect(getAllByRole('button')).toHaveLength(2);
    await fireEvent.press(getByText('2 changes couldn’t save'));
    expect(getByText('Changes that couldn’t save')).toBeTruthy();
    await fireEvent.press(getByText('Close'));
    expect(queryByText('Changes that couldn’t save')).toBeNull();
    await fireEvent.press(getByText('1 edit couldn’t save — changed elsewhere'));
    expect(getByText('Changes that couldn’t save')).toBeTruthy();
  });

  it('has no button or sheet when nothing failed', async () => {
    (useSyncStatus as jest.Mock).mockReturnValue({ isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: Date.now() });
    const { queryAllByRole } = await render(withClient(<SyncStatusLine />));
    expect(queryAllByRole('button')).toHaveLength(0);
  });
});

describe('failedWriteLabels', () => {
  it('maps entities, with a fallback for an unknown one', () => {
    expect(failedEntityKey('decide_checks')).toBe('sync.failedSheet.entity.decide_checks');
    expect(failedEntityKey('mystery')).toBe('sync.failedSheet.entity.unknown');
  });

  it('names a payload by name, title or label, trimmed and capped', () => {
    expect(failedWriteName({ name: '  Sofa ' })).toBe('Sofa');
    expect(failedWriteName({ title: 'T' })).toBe('T');
    expect(failedWriteName({ label: 'L' })).toBe('L');
    expect(failedWriteName({ name: '   ' })).toBeNull();
    expect(failedWriteName({ name: 5 })).toBeNull();
    expect(failedWriteName({})).toBeNull();
    expect(failedWriteName({ name: 'x'.repeat(60) })).toHaveLength(40);
  });

  it.each([
    ['conflict', 'x', 'conflict'],
    ['not-found', 'x', 'notFound'],
    ['rejected', '42501', 'rejected'],
    ['rejected', '23505', 'duplicate'],
    ['rejected', '23503', 'missingReference'],
    ['rejected', '23514', 'notAllowedValue'],
    ['rejected', '23502', 'notAllowedValue'],
    ['rejected', '22P02', 'notAllowedValue'],
    ['rejected', 'PGRST204', 'unknownField'],
    ['rejected', 'odd', 'rejected'],
    ['rejected', '', 'generic'],
  ] as const)('reason for %s / %s', (kind, code, key) => {
    expect(failedReasonKey({ kind, code })).toBe(`sync.failedSheet.reason.${key}`);
  });
});
