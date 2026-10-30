/** 05.3-36: SavedPlanRow. */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { answerHref, purchaseHref } from '../../nav/hrefs';
import { SavedPlanRow } from '../SavedPlanRow';
import { checkRow, liveEval } from './listsTestKit';

jest.setTimeout(60000);

jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./listsTestKit').fakeFormat }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
const mockAbandon = jest.fn(() => 'step-1');
const mockSave = jest.fn();
jest.mock('@/data/mutations/decideChecks', () => ({
  useAbandonCheck: () => ({ abandon: mockAbandon }),
  useSaveCheckAnswer: () => ({ save: mockSave }),
}));
const mockRemove = jest.fn();
jest.mock('../useRowActions', () => ({
  useDeleteRow: () => ({ remove: mockRemove, confirmCopy: () => ({ title: 'Delete this plan?', body: 'It leaves Decide.' }) }),
}));
jest.mock('../../../ui/DeletableRow', () => ({
  DeletableRow: ({ children, onOpen, onDelete, accessibilityLabel, menu, confirm }: { children: React.ReactNode; onOpen: () => void; onDelete: () => void; accessibilityLabel: string; menu: { key: string }[]; confirm: { title: string } }) => {
    const { Pressable, Text } = jest.requireActual('react-native');
    return (
      <>
        <Pressable accessibilityLabel={accessibilityLabel} onPress={onOpen}>{children}</Pressable>
        <Pressable accessibilityLabel="del" onPress={onDelete}><Text>{'del'}</Text></Pressable>
        <Text>{`menu:${menu.map((m) => m.key).join(',')}`}</Text>
        <Text>{confirm.title}</Text>
      </>
    );
  },
}));

beforeEach(() => {
  (pushOnce as jest.Mock).mockClear();
  (showToast as jest.Mock).mockClear();
  mockAbandon.mockClear();
  mockSave.mockClear();
  mockRemove.mockClear();
});

describe('SavedPlanRow', () => {
  it('shows item, price and the stored chip with the covered-by month', async () => {
    await wrap(<SavedPlanRow row={checkRow()} live={liveEval('not_yet', 'not_covered', { kind: 'month', month: '2027-02' })} without={undefined} />);
    expect(screen.getByText('Laptop')).toBeTruthy();
    expect(screen.getByText('· $1,200')).toBeTruthy();
    expect(screen.getByText(/could be covered by February/)).toBeTruthy();
    expect(screen.queryByText('Changed since you saved')).toBeNull();
    await fireEvent.press(screen.getByLabelText(/Opens the saved plan/));
    expect(pushOnce).toHaveBeenCalledWith(answerHref(checkRow().id));
  });

  it('a differing live code adds the Changed chip and leaves the stored chip', async () => {
    await wrap(<SavedPlanRow row={checkRow()} live={liveEval('fits_unspent', null)} without={undefined} />);
    expect(screen.getByText('Changed since you saved')).toBeTruthy();
    expect(screen.getByText(/could be covered by February/)).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('refund hint adds the D-13 line and the refund a11y label', async () => {
    await wrap(<SavedPlanRow row={checkRow()} live={liveEval('fits_month', null)} without={liveEval('not_yet', 'not_covered')} />);
    expect(screen.getByText('With the refund, this could fit now.')).toBeTruthy();
    expect(screen.getByLabelText(/With the refund, this could fit now/).props.accessibilityLabel).toMatch(/With the refund, this could fit now/);
  });

  it('no refund line without a better refund answer', async () => {
    await wrap(<SavedPlanRow row={checkRow()} live={liveEval('not_yet', 'not_covered')} without={liveEval('not_yet', 'not_covered')} />);
    expect(screen.queryByText('With the refund, this could fit now.')).toBeNull();
  });

  it('an unfinished row reads Unfinished, opens the check and deletes with the Undo toast', async () => {
    const row = checkRow({ status: 'open', answer_v3: null });
    await wrap(<SavedPlanRow row={row} live={undefined} without={undefined} />);
    expect(screen.getByText('Unfinished')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/Unfinished/));
    expect(pushOnce).toHaveBeenCalledWith(purchaseHref(row.id));
    await fireEvent.press(screen.getByLabelText('del'));
    expect(mockAbandon).toHaveBeenCalledWith(row, 'deleted');
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'destructive', stepId: 'step-1' }));
  });

  it('never writes the stored answer', async () => {
    await wrap(<SavedPlanRow row={checkRow()} live={liveEval('fits_unspent', null)} without={undefined} />);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('a saved row offers Delete: one removal of that row, with the confirm copy, and no stored-answer write (D-23)', async () => {
    const row = checkRow();
    await wrap(<SavedPlanRow row={row} live={liveEval('not_yet', 'not_covered')} without={undefined} />);
    expect(screen.getByText('menu:open')).toBeTruthy();
    expect(screen.getByText('Delete this plan?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('del'));
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith(row);
    expect(mockAbandon).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
