/** Plan 05.3-29: the instead route body. Invalid or unknown ids and checks with no purchase are not-found; the gate wraps it. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { InsteadRoute } from '../InsteadRoute';

let mockState: { status: string; evaluation: unknown } = { status: 'ready', evaluation: null };
jest.mock('@/data/queries/decideCheckV3', () => ({ useCheckV3: () => mockState }));
jest.mock('../V3Gate', () => ({ V3Gate: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/features/decide/v3/nav/V3NotFound', () => {
  const { View } = require('react-native');
  return { V3NotFound: () => <View testID="not-found" /> };
});
jest.mock('@/features/decide/v3/nav/V3Skeleton', () => {
  const { View } = require('react-native');
  return { V3Skeleton: () => <View testID="skeleton" /> };
});
jest.mock('@/features/decide/v3/instead/InsteadScreen', () => {
  const { View } = require('react-native');
  return { InsteadScreen: () => <View testID="instead-screen" /> };
});

describe('InsteadRoute', () => {
  it('shows the skeleton while loading', async () => {
    mockState = { status: 'loading', evaluation: null };
    await render(<InsteadRoute id="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByTestId('skeleton')).toBeTruthy();
  });
  it('an unknown check is not found', async () => {
    mockState = { status: 'ready', evaluation: null };
    await render(<InsteadRoute id="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByTestId('not-found')).toBeTruthy();
  });
  it('a check with no purchase is not found', async () => {
    mockState = { status: 'ready', evaluation: { purchase: null } };
    await render(<InsteadRoute id="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByTestId('not-found')).toBeTruthy();
  });
  it('a check with a purchase shows the screen', async () => {
    mockState = { status: 'ready', evaluation: { purchase: {} } };
    await render(<InsteadRoute id="11111111-1111-4111-8111-111111111111" />);
    expect(screen.getByTestId('instead-screen')).toBeTruthy();
  });
});
