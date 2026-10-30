/** Plan 05.3-34: the refine route body is the review screen inside the v3 gate. */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { RefineRoute } from '../RefineRoute';

const mockGate = jest.fn();
const mockHost = jest.fn();
jest.mock('../../SetupSheetHost', () => ({ useSetupSheetHost: () => mockHost() }));
jest.mock('../V3Gate', () => ({
  V3Gate: ({ children }: { children: React.ReactNode }) => {
    const { View } = jest.requireActual('react-native');
    mockGate();
    return <View testID="gate">{children}</View>;
  },
}));
jest.mock('@/features/decide/v3/refine/RefineScreen', () => {
  const { View } = jest.requireActual('react-native');
  return { RefineScreen: () => <View testID="refine-screen" /> };
});

describe('RefineRoute', () => {
  it('wraps the review screen in the gate', async () => {
    await render(<RefineRoute />);
    expect(mockGate).toHaveBeenCalled();
    expect(mockHost).toHaveBeenCalled();
    expect(screen.getByTestId('gate')).toBeTruthy();
    expect(screen.getByTestId('refine-screen')).toBeTruthy();
  });
});
