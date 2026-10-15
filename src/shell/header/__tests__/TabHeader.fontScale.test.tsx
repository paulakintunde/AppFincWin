import React from 'react';
import { StyleSheet } from 'react-native';
import { screen } from '@testing-library/react-native';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { renderWithShellProviders } from '@/shell/__tests__/testUtils';
import { TabHeader } from '../TabHeader';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => ({ profile: null }) }));

function renderAt(scale: number) {
  return renderWithShellProviders(
    <FontScaleProvider value={scale}>
      <TabHeader title="Overview" eyebrow="MONDAY" />
    </FontScaleProvider>,
  );
}

describe('TabHeader font scale (D-19)', () => {
  it('caps the title at 2x and scales the eyebrow with it', async () => {
    await renderAt(3);
    expect(StyleSheet.flatten(screen.getByText('Overview').props.style).fontSize).toBe(52);
    expect(StyleSheet.flatten(screen.getByText('MONDAY', { includeHiddenElements: true }).props.style).fontSize).toBe(23);
  });

  it('scales proportionally below the cap', async () => {
    await renderAt(1.5);
    expect(StyleSheet.flatten(screen.getByText('Overview').props.style).fontSize).toBe(39);
  });

  it('wraps rather than clips', async () => {
    await renderAt(2);
    expect(screen.getByText('Overview').props.numberOfLines).toBeUndefined();
  });
});
