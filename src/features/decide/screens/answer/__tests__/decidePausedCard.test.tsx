// 08.1-05 (APP-21, Q6): the Decide tab shows the paused card only when the switch reads off; a failed read shows Decide.
import React from 'react';
import { screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import DecideRoute from '../../../../../../app/(app)/(tabs)/decide';
import { DecidePausedCard } from '../StatusCards';

const mockSwitch = jest.fn();
jest.mock('@/features/decide/useDecideServerSwitch', () => ({ useDecideServerSwitch: () => mockSwitch() }));
jest.mock('@/features/decide/screens/home/DecideHome', () => {
  const { View } = jest.requireActual('react-native');
  return { DecideHome: () => <View testID="decide-home" /> };
});
jest.mock('@/features/decide/dev/ShadowExportDevMenu', () => ({ ShadowExportDevMenu: () => null }));

describe('Decide is paused', () => {
  it('the card has the title and body and no button', async () => {
    await wrap(<DecidePausedCard />);
    expect(screen.getByText('Decide is paused')).toBeTruthy();
    expect(screen.getByText('Your records are safe. Answers come back soon.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('off shows the card instead of Decide', async () => {
    mockSwitch.mockReturnValue({ off: true });
    await wrap(<DecideRoute />);
    expect(screen.getByTestId('decide-paused')).toBeTruthy();
    expect(screen.queryByTestId('decide-home')).toBeNull();
  });

  it('on, or a failed read (the hook reports on), shows Decide', async () => {
    mockSwitch.mockReturnValue({ off: false });
    await wrap(<DecideRoute />);
    expect(screen.getByTestId('decide-home')).toBeTruthy();
    expect(screen.queryByTestId('decide-paused')).toBeNull();
  });
});
