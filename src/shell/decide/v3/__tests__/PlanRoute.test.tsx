/** Plan 05.3-28: the plan route checks the id (T-05.3-28-01) and sits behind V3Gate. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PlanRoute } from '../PlanRoute';

jest.mock('../V3Gate', () => ({ V3Gate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/features/decide/v3/plan/WholePlanScreen', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { WholePlanScreen: ({ id }: { id: string }) => <T>{`plan:${id}`}</T> };
});
jest.mock('@/features/decide/v3/nav/V3NotFound', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { V3NotFound: () => <T testID="not-found" /> };
});

const GOOD = '3f2b8c1e-5d4a-4b7e-9a10-2c6d8e0f1a23';

describe('PlanRoute', () => {
  it('renders the plan for a uuid', async () => {
    await render(<PlanRoute id={GOOD} />);
    expect(screen.getByText(`plan:${GOOD}`)).toBeTruthy();
  });
  it('shows not-found for a bad or missing id', async () => {
    await render(<PlanRoute id="../x" />);
    expect(screen.getByTestId('not-found')).toBeTruthy();
  });
  it('shows not-found when the id is missing', async () => {
    await render(<PlanRoute id={undefined} />);
    expect(screen.getByTestId('not-found')).toBeTruthy();
  });
});
