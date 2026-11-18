// 08.1-05 (ROADMAP SC8): the build line shows for tester accounts only.
import React from 'react';
import { screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { LegalBlock } from '../LegalBlock';
import { TesterBuildProvider } from '../TesterBuildProvider';

const mockProfile = jest.fn();
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => mockProfile() }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.2.3' }));
jest.mock('expo-updates', () => ({ updateId: 'abcdef1234567890' }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));

const block = (
  <TesterBuildProvider>
    <LegalBlock basis={null} caveat={null} caveatFigures={[]} onCantSee={() => undefined} />
  </TesterBuildProvider>
);

describe('tester build line', () => {
  it('shows the build under the footer for a tester', async () => {
    mockProfile.mockReturnValue({ profile: { decide_v3: true } });
    await wrap(block);
    expect(screen.getByTestId('answer-build')).toHaveTextContent('Build 1.2.3 (abcdef12)');
  });

  it('is absent for a non-tester', async () => {
    mockProfile.mockReturnValue({ profile: { decide_v3: false } });
    await wrap(block);
    expect(screen.queryByTestId('answer-build')).toBeNull();
  });

  it('is absent while there is no profile', async () => {
    mockProfile.mockReturnValue({ profile: null });
    await wrap(block);
    expect(screen.queryByTestId('answer-build')).toBeNull();
  });

  it('is absent with no provider (the legal block alone)', async () => {
    await wrap(<LegalBlock basis={null} caveat={null} caveatFigures={[]} onCantSee={() => undefined} />);
    expect(screen.queryByTestId('answer-build')).toBeNull();
  });
});
