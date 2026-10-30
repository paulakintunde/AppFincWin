/** Plan 05.3-38 (D-17): the needs-input card lists the missing lines; "Help me check this" shows only when helpOffered. */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { wrap } from '@/features/decide/v3/answer/__tests__/kit';
import { needsInputLines } from '@/features/decide/v3/model/ask';
import { NeedsInputCard } from '../NeedsInputCard';

jest.setTimeout(60000);

const mockPushOnce = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPushOnce(h) }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));

beforeEach(() => jest.clearAllMocks());

const lines = needsInputLines({ missing: ['records_look_behind', 'no_price'] } as never);

describe('NeedsInputCard', () => {
  it('lists each non-question missing line as a bullet', async () => {
    expect(lines).toHaveLength(2);
    await wrap(<NeedsInputCard lines={lines} helpOffered={false} checkId="c1" />);
    expect(screen.getAllByText('·')).toHaveLength(2);
  });

  it('D-17 helpOffered false: only "Update my records instead", which opens Activity', async () => {
    await wrap(<NeedsInputCard lines={lines} helpOffered={false} checkId="c1" />);
    expect(screen.queryByText('Help me check this')).toBeNull();
    await fireEvent.press(screen.getByText('Update my records instead'));
    expect(router.navigate).toHaveBeenCalledWith('/activity');
  });

  it('D-17 helpOffered true: "Help me check this" is the primary and opens the help route', async () => {
    await wrap(<NeedsInputCard lines={lines} helpOffered checkId="c1" />);
    expect(screen.getByText('Update my records instead')).toBeTruthy();
    await fireEvent.press(screen.getByText('Help me check this'));
    expect(mockPushOnce).toHaveBeenCalledWith({ pathname: '/decide/help/[id]', params: { id: 'c1' } });
  });
});
