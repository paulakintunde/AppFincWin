/** 05.3-36: DecisionsScreen. */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { answerHref } from '../../nav/hrefs';
import { DecisionsScreen } from '../DecisionsScreen';
import { checkRow, liveEval } from './listsTestKit';

jest.setTimeout(60000);

let mockState: { status: string; rows: unknown[]; byId: Map<string, unknown>; withoutRefunds: Map<string, unknown> };
jest.mock('@/data/queries/decideCheckV3', () => ({ useChecksV3: () => mockState }));
jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./listsTestKit').fakeFormat }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/shell/screen/DetailScreen', () => ({
  DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <>
        <Text>{title}</Text>
        {children}
      </>
    );
  },
}));

const bought = checkRow({ id: 'b1', name: 'Laptop', status: 'bought', decided_at: '2026-10-20T10:00:00Z' });
const passed = checkRow({ id: 'p1', name: 'Boat', status: 'passed', decided_at: '2026-10-25T10:00:00Z' });

beforeEach(() => {
  (pushOnce as jest.Mock).mockClear();
  mockState = {
    status: 'ready',
    rows: [bought, passed, checkRow({ id: 'w1', name: 'Plan', status: 'waiting' })],
    byId: new Map<string, unknown>([
      ['b1', liveEval('fits_month', null, null, 120000)],
      ['p1', liveEval('not_yet', 'not_covered', null, 120000)],
    ]),
    withoutRefunds: new Map(),
  };
});

describe('DecisionsScreen', () => {
  it('lists bought and passed rows newest first with their status lines', async () => {
    await wrap(<DecisionsScreen />);
    expect(screen.getByText('Past decisions')).toBeTruthy();
    expect(screen.getByText('Bought · 2026-10-20')).toBeTruthy();
    expect(screen.getByText('You kept $1,200')).toBeTruthy();
    expect(screen.getByText('Not buying · 2026-10-25')).toBeTruthy();
    expect(screen.queryByText('Plan')).toBeNull();
    const labels = screen.getAllByRole('button').map((b) => String(b.props.accessibilityLabel));
    expect(labels[0]).toMatch(/^Boat/);
    expect(labels[1]).toMatch(/^Laptop/);
  });

  it('a row opens its answer', async () => {
    await wrap(<DecisionsScreen />);
    await fireEvent.press(screen.getAllByRole('button')[1]!);
    expect(pushOnce).toHaveBeenCalledWith(answerHref('b1'));
  });

  it('shows the refund line when counting refunds is better', async () => {
    mockState.withoutRefunds = new Map([['b1', liveEval('not_yet', 'not_covered')]]);
    mockState.rows = [checkRow({ id: 'b1', name: 'Laptop', status: 'bought', answer_v3: checkRow().answer_v3 })];
    await wrap(<DecisionsScreen />);
    expect(screen.getByText('With the refund, this could fit now.')).toBeTruthy();
  });

  it('empty reads Nothing decided yet', async () => {
    mockState.rows = [];
    await wrap(<DecisionsScreen />);
    expect(screen.getByText('Nothing decided yet')).toBeTruthy();
  });
});
