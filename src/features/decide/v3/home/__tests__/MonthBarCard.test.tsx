/** 05.3-23: MonthBarCard with Sam's October. */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { WORKED_HREF } from '../../nav/hrefs';
import { colors } from '@/theme/tokens';
import { MonthBarCard } from '../MonthBarCard';
import { fakeFormat, SAM_UNSPENT_AT, samEvaluation, samUnspent } from './homeCardsTestKit';

jest.setTimeout(60000);
const HIDDEN = { includeHiddenElements: true };

jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./homeCardsTestKit').fakeFormat }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/theme/motion', () => ({ ...jest.requireActual('@/theme/motion'), useReduceMotion: () => mockReduced }));
jest.mock('../../../setup/UnspentSheet', () => ({ UnspentSheet: ({ visible }: { visible: boolean }) => (visible ? mockText('unspent-sheet-open') : null) }));
jest.mock('../../../setup/EmergencyFundSheet', () => ({ EmergencyFundSheet: ({ visible }: { visible: boolean }) => (visible ? mockText('emergency-sheet-open') : null) }));

let mockReduced = false;
function mockText(id: string): React.JSX.Element {
  const { Text } = jest.requireActual('react-native');
  return <Text testID={id}>{'open'}</Text>;
}

beforeEach(() => {
  mockReduced = false;
  (pushOnce as jest.Mock).mockClear();
});

describe('MonthBarCard', () => {
  it('shows Sam: month, day, legend, caption and figure', async () => {
    void fakeFormat;
    await wrap(<MonthBarCard evaluation={samEvaluation()} />);
    expect(screen.getByText('October')).toBeTruthy();
    expect(screen.getByText('day 18 of 31')).toBeTruthy();
    expect(screen.getByText('$2,705', HIDDEN)).toBeTruthy();
    expect(screen.getByText('$770', HIDDEN)).toBeTruthy();
    expect(screen.getByText('$100', HIDDEN)).toBeTruthy();
    expect(screen.getByText('$4,000 in · on track to leave')).toBeTruthy();
    expect(screen.getByTestId('month-figure').props.children).toBe('$425');
    expect(screen.getAllByText('$425', HIDDEN).length).toBeGreaterThan(0);
  });

  it('reads the bar and legend as one sentence', async () => {
    await wrap(<MonthBarCard evaluation={samEvaluation()} />);
    // the guards ban "left" for month figures under decide.v3, so the shipped copy says "remaining"
    expect(screen.getByLabelText('October, day 18 of 31. $2,705 out so far, $100 set aside, $770 still to come, $425 remaining.')).toBeTruthy();
  });

  it('overspent month: danger figure with a minus, an over segment and no left segment', async () => {
    await wrap(<MonthBarCard evaluation={samEvaluation({ monthLeft: -42500 })} />);
    expect(screen.getByText('$4,000 in · on track to be overspent by')).toBeTruthy();
    const figure = screen.getByTestId('month-figure');
    expect(figure.props.children).toMatch(/^[−-]\$425$/);
    expect(JSON.stringify(figure.props.style)).toContain(colors.danger);
    expect(screen.queryByTestId('bar-left', HIDDEN)).toBeNull();
    expect(screen.getByTestId('bar-over', HIDDEN)).toBeTruthy();
    expect(screen.getByLabelText(/overspent\.$/)).toBeTruthy();
  });

  it('opens how it was worked out, the unspent sheet and the emergency sheet', async () => {
    await wrap(<MonthBarCard evaluation={samEvaluation()} />);
    await fireEvent.press(screen.getByLabelText('Typical month, $360. From 6 months of records. Opens how it was worked out.'));
    expect(pushOnce).toHaveBeenCalledWith(WORKED_HREF);
    await fireEvent.press(screen.getByLabelText(`Unspent money, $1,200. Confirmed ${SAM_UNSPENT_AT}. Opens unspent money.`));
    expect(screen.getByTestId('unspent-sheet-open')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Emergency fund, $5,000. Kept apart from what you spend. Opens the emergency fund.'));
    expect(screen.getByTestId('emergency-sheet-open')).toBeTruthy();
  });

  it('D-26: three full-width rows in order, each with its detail line and a chevron', async () => {
    await wrap(<MonthBarCard evaluation={samEvaluation()} />);
    const rows = screen.getAllByTestId(/^figure-row-(typical|unspent|emergency)$/);
    expect(rows.map((r) => r.props.testID)).toEqual(['figure-row-typical', 'figure-row-unspent', 'figure-row-emergency']);
    expect(screen.getByText('From 6 months of records', HIDDEN)).toBeTruthy();
    expect(screen.getByText(`Confirmed ${SAM_UNSPENT_AT}`, HIDDEN)).toBeTruthy();
    expect(screen.getByText('Kept apart from what you spend', HIDDEN)).toBeTruthy();
    expect(screen.getAllByTestId('figure-row-chevron', HIDDEN)).toHaveLength(3);
  });

  it('one month of records reads in the singular', async () => {
    await wrap(<MonthBarCard evaluation={samEvaluation({ monthsUsed: ['2026-09'] })} />);
    expect(screen.getByText('From 1 month of records', HIDDEN)).toBeTruthy();
  });

  it('unset figures read Not set in inkMuted with their none detail', async () => {
    await wrap(<MonthBarCard evaluation={samEvaluation({ typicalLeft: null, unspent: null, emergency: null })} />);
    expect(screen.getByLabelText('Typical month, Not set. Shows once a month is fully recorded. Opens how it was worked out.')).toBeTruthy();
    expect(screen.getByLabelText('Unspent money, Not set. Starts from the money you have now. Opens unspent money.')).toBeTruthy();
    expect(screen.getByLabelText('Emergency fund, Not set. Money kept apart for emergencies. Opens the emergency fund.')).toBeTruthy();
    const notSet = screen.getAllByText('Not set', HIDDEN);
    expect(notSet).toHaveLength(3);
    for (const n of notSet) expect(JSON.stringify(n.props.style)).toContain(colors.inkMuted);
  });

  it('an unlinked emergency fund asks for its account', async () => {
    await wrap(<MonthBarCard evaluation={samEvaluation({ fundUnlinked: true })} />);
    expect(screen.getByText('No account picked to hold it yet', HIDDEN)).toBeTruthy();
  });

  it('stale unspent shows the chip; an unset fund shows Not set', async () => {
    await wrap(
      <MonthBarCard evaluation={samEvaluation({ unspent: samUnspent({ stale: true }), emergency: null })} unspentStaleDays={41} />,
    );
    expect(screen.getByText('Last confirmed 41 days ago', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Not set', HIDDEN)).toBeTruthy();
  });

  it('drifted unspent shows the drift chip', async () => {
    await wrap(<MonthBarCard evaluation={samEvaluation({ unspent: samUnspent({ drifted: true }) })} />);
    expect(screen.getByText('Differs from your accounts', HIDDEN)).toBeTruthy();
  });

  it('reduced motion renders the bar filled', async () => {
    mockReduced = true;
    await wrap(<MonthBarCard evaluation={samEvaluation()} />);
    expect(screen.getByTestId('bar-out', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('bar-toCome', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('bar-left', HIDDEN)).toBeTruthy();
  });
});
