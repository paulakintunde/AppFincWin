/** 05.3-43 (DSV-02): the Decide tab root ladder: Coming soon, skeleton while the profile loads, then the v3 home. */
import React from 'react';
import { screen } from '@testing-library/react-native';
import { wrap } from '../../../check/steps/__tests__/helpers/stepProps';
import DecideRoute from '../../../../../../app/(app)/(tabs)/decide';

jest.setTimeout(60000);

let mockV3 = false;
let mockLoading = false;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3, testAccount: mockV3 }) }));
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => ({ loading: mockLoading, profile: null }) }));
jest.mock('@/features/decide/v3/home/HomeScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { HomeScreen: () => <Text>{'v3-home'}</Text> };
});
jest.mock('@/features/decide/v3/nav/V3Skeleton', () => {
  const { Text } = jest.requireActual('react-native');
  return { V3Skeleton: () => <Text>{'v3-skeleton'}</Text> };
});
jest.mock('@/features/decide/home/DecideComingSoonScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { DecideComingSoonScreen: () => <Text>{'coming-soon'}</Text> };
});
jest.mock('@/features/decide/dev/ShadowExportDevMenu', () => {
  const { Text } = jest.requireActual('react-native');
  return { ShadowExportDevMenu: () => <Text>{'shadow-export'}</Text> };
});

beforeEach(() => {
  mockV3 = false;
  mockLoading = false;
});

describe('the Decide tab root', () => {
  it('shows Coming soon when the account is not on v3', async () => {
    await wrap(<DecideRoute />);
    expect(screen.getByText('coming-soon')).toBeTruthy();
    expect(screen.queryByText('v3-home')).toBeNull();
  });

  it('shows a skeleton, never Coming soon, while the profile loads', async () => {
    mockLoading = true;
    await wrap(<DecideRoute />);
    expect(screen.getByText('v3-skeleton')).toBeTruthy();
    expect(screen.queryByText('coming-soon')).toBeNull();
  });

  it('shows the v3 home for a v3 account', async () => {
    mockV3 = true;
    await wrap(<DecideRoute />);
    expect(screen.getByText('v3-home')).toBeTruthy();
    expect(screen.queryByText('coming-soon')).toBeNull();
  });

  it('keeps the development-only shadow export', async () => {
    mockV3 = true;
    await wrap(<DecideRoute />);
    expect(screen.getByText('shadow-export')).toBeTruthy();
  });
});
