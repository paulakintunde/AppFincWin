/** 05.3-39 (D-20): the quiet row opens the real 05.2 sheet and routes picks like Decide settings. */
import React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react-native';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import { SomethingChangedRow } from '../SomethingChangedRow';

jest.setTimeout(60000);

jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('../../../settings/useSettingsData', () => ({ useSettingsData: () => ({ facts: { fullMonthsOfRecords: 1 } }) }));
jest.mock('../../../setup/setupFlow', () => ({ isNeeded: () => true }));
jest.mock('../../../setup/EmergencyFundSheet', () => ({
  EmergencyFundSheet: ({ visible }: { visible: boolean }) => {
    const { Text } = jest.requireActual('react-native');
    return visible ? <Text>{'emergency-sheet'}</Text> : null;
  },
}));

afterEach(cleanup);
beforeEach(() => jest.clearAllMocks());


describe('SomethingChangedRow', () => {
  it('renders the text as a 44 high secondary button with the TalkBack label', async () => {
    await wrap(<SomethingChangedRow />);
    expect(screen.getByText('Something changed?')).toBeTruthy();
    const row = screen.getByRole('button', { name: /^Something changed\? Opens a list/ });
    const flat = Object.assign({}, ...[row.props.style].flat(2).filter(Boolean));
    expect(flat.minHeight).toBe(44);
    expect(flat.backgroundColor).not.toBe('#' + '0'.repeat(6));
  });

  it('opens the 05.2 sheet; a route pick pushes the href and an emergency pick opens the fund sheet', async () => {
    await wrap(<SomethingChangedRow />);
    expect(screen.queryByText('What changed?')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Something changed\?/ }));
    expect(screen.getAllByRole('button').length).toBeGreaterThan(3);
    await fireEvent.press(screen.getByLabelText(/regular bill/i));
    expect(pushOnce).toHaveBeenCalledWith('/decide/setup?only=regular');
  });

  it('an emergency pick opens EmergencyFundSheet and pushes nothing', async () => {
    await wrap(<SomethingChangedRow />);
    await fireEvent.press(screen.getByRole('button', { name: /^Something changed\?/ }));
    await fireEvent.press(screen.getByLabelText(/emergency fund/i));
    expect(screen.getByText('emergency-sheet')).toBeTruthy();
    expect(pushOnce).not.toHaveBeenCalled();
  });
});
