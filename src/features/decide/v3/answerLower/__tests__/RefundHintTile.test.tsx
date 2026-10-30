/** Plan 05.3-38 (D-13): the refund tile starts a new check and leaves the stored answer alone. */
import React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/features/decide/v3/answer/__tests__/kit';
import { RefundHintTile } from '../RefundHintTile';

jest.setTimeout(60000);

const mockPushOnce = jest.fn();
const mockReopen = jest.fn(() => 'new-id');
const mockSaveDraft = jest.fn();
const mockSaveAnswer = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPushOnce(h) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useReopenCheck: () => ({ reopen: mockReopen }),
  useSaveCheckDraft: () => ({ save: mockSaveDraft }),
  useSaveCheckAnswer: () => ({ save: mockSaveAnswer }),
}));

beforeEach(() => jest.clearAllMocks());
afterEach(cleanup);

const row = { id: 'orig-1', household_id: 'h', created_by: 'u', kind: 'buy', name: 'Sofa', inputs: {} } as never;
const LABEL = 'With the refund, this could fit now. Check again. Starts a new check.';

describe('RefundHintTile', () => {
  it('reads the sentence with Check again as one element', async () => {
    await wrap(<RefundHintTile show row={row} />);
    expect(screen.getByLabelText(LABEL)).toBeTruthy();
    expect(screen.getByText('Check again')).toBeTruthy();
  });

  it('D-13: press reopens from the original and opens the new answer; nothing is written to the original', async () => {
    await wrap(<RefundHintTile show row={row} />);
    await fireEvent.press(screen.getByLabelText(LABEL));
    expect(mockReopen).toHaveBeenCalledTimes(1);
    expect((mockReopen.mock.calls as unknown as [{ id: string }][])[0]![0].id).toBe('orig-1');
    expect(mockPushOnce).toHaveBeenCalledWith({ pathname: '/decide/answer/[id]', params: { id: 'new-id' } });
    expect(mockSaveDraft).not.toHaveBeenCalled();
    expect(mockSaveAnswer).not.toHaveBeenCalled();
  });

  it('is hidden when show is false', async () => {
    await wrap(<RefundHintTile show={false} row={row} />);
    expect(screen.queryByLabelText(LABEL)).toBeNull();
  });
});
