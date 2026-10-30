/** 05.3-23: EnvelopeGrid. */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { ENVELOPES_HREF } from '../../nav/hrefs';
import { EnvelopeGrid } from '../EnvelopeGrid';

jest.setTimeout(60000);

jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./homeCardsTestKit').fakeFormat }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('../../../pots/PotSheet', () => ({
  PotSheet: ({ visible }: { visible: boolean }) => {
    const { Text } = jest.requireActual('react-native');
    return visible ? <Text testID="pot-sheet-open">{'open'}</Text> : null;
  },
}));

const env = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, name: `Envelope ${i}`, amount: 10000 * (i + 1) }));

beforeEach(() => (pushOnce as jest.Mock).mockClear());

describe('EnvelopeGrid', () => {
  it('shows four tiles and All envelopes (6) for six envelopes', async () => {
    await wrap(<EnvelopeGrid envelopes={env(6)} />);
    expect(screen.getByText('Envelope 3')).toBeTruthy();
    expect(screen.queryByText('Envelope 4')).toBeNull();
    await fireEvent.press(screen.getByText('All envelopes (6)'));
    expect(pushOnce).toHaveBeenCalledWith(ENVELOPES_HREF);
  });

  it('a tile opens the Envelopes screen', async () => {
    await wrap(<EnvelopeGrid envelopes={env(2)} />);
    expect(screen.getByText('$100')).toBeTruthy();
    expect(screen.queryByText(/All envelopes/)).toBeNull();
    await fireEvent.press(screen.getByText('Envelope 1'));
    expect(pushOnce).toHaveBeenCalledWith(ENVELOPES_HREF);
  });

  it('empty state offers Add an envelope, which opens the pot sheet', async () => {
    await wrap(<EnvelopeGrid envelopes={[]} />);
    expect(screen.getByText('No envelopes yet.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add an envelope'));
    expect(screen.getByTestId('pot-sheet-open')).toBeTruthy();
  });
});
