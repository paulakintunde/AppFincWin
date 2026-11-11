// 06.1-23: the compare route container. "See the cash answer" opens the answer route on the cash side, and "What this can't see"
// opens the About sheet (both were dead ends before the answer route existed).
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { judgeBoth, prepare } from '@/engine/decide/v3';
import { wrap } from '@/test/stepProps';
import { CompareContainer } from '../CompareContainer';
import { ledgerRun } from '../../__tests__/fixtures';

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a), back: () => mockBack() } }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/features/decide/check/CheckFlowScreen', () => ({ CheckNotFound: () => null }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: true, region: 'US', today: '2026-11-05' }),
}));
jest.mock('@/data/queries/decide', () => {
  const { ledgerRun: run } = jest.requireActual('../../__tests__/fixtures');
  const { toStoredV2 } = jest.requireActual('@/engine/decide/v3');
  return { useDecideChecks: () => ({ data: [{ id: 'c1', name: 'Laptop', inputs: toStoredV2(run('N02').check) }] }) };
});
jest.mock('../../../engine/useCheckEngine', () => {
  const { ledgerRun: run } = jest.requireActual('../../__tests__/fixtures');
  const engine = jest.requireActual('@/engine/decide/v3');
  return {
    useCheckEngine: () => {
      const r = run('N02');
      return { evaluation: r.evaluation, both: () => engine.judgeBoth(engine.prepare(r.inputs), r.check) };
    },
  };
});

afterEach(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
});

describe('CompareContainer (06.1-23)', () => {
  it('the cash button opens the answer route on the cash side', async () => {
    const r = ledgerRun('N02');
    expect(judgeBoth(prepare(r.inputs), r.check).plan).toBeNull();
    await wrap(<CompareContainer id="c1" />);
    await fireEvent.press(screen.getByText('See the cash answer'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/decide/answer/[id]', params: { id: 'c1', side: 'cash' } });
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('"What this can\'t see" opens the About sheet instead of going back', async () => {
    await wrap(<CompareContainer id="c1" />);
    expect(screen.queryByText('About this answer')).toBeNull();
    await fireEvent.press(screen.getByTestId('answer-cant-see'));
    expect(screen.getByText('About this answer')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
