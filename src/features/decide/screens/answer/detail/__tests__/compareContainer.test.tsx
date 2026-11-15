// 06.1-23: the compare route container. "See the cash answer" opens the answer route on the cash side, and "What this can't see"
// opens the About sheet (both were dead ends before the answer route existed).
// 06.1-63 (CN-13, CN-7): "See …" returns to the answer already in the stack (dismissTo with the side), and while the checks load the
// answer's loading line shows in the Compare frame, never "This check isn't here".
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { judgeBoth, prepare } from '@/engine/decide/v3';
import { wrap } from '@/test/stepProps';
import { CompareContainer } from '../CompareContainer';
import { ledgerRun } from '../../__tests__/fixtures';

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), dismissTo: (...a: unknown[]) => mockDismissTo(...a), back: () => mockBack() },
}));
jest.mock('@/shell/screen/DetailScreen', () => ({
  DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => {
    const { Text, View } = jest.requireActual('react-native');
    return (
      <View>
        <Text testID="detail-title">{title}</Text>
        {children}
      </View>
    );
  },
}));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/features/decide/screens/ui/CheckNotFound', () => {
  const { Text } = jest.requireActual('react-native');
  return { CheckNotFound: () => <Text testID="check-not-found" /> };
});
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', showCents: true, region: 'US', today: '2026-11-05' }),
}));
const mockChecks: { state: 'ready' | 'loading' | 'error' } = { state: 'ready' };
jest.mock('@/data/queries/decide', () => {
  const { ledgerRun: run } = jest.requireActual('../../__tests__/fixtures');
  const { toStoredV2 } = jest.requireActual('@/engine/decide/v3');
  const rows = [{ id: 'c1', name: 'Laptop', inputs: toStoredV2(run('N02').check) }];
  return {
    useDecideChecks: () =>
      mockChecks.state === 'loading'
        ? { data: undefined, isLoading: true, isError: false }
        : mockChecks.state === 'error'
          ? { data: undefined, isLoading: false, isError: true }
          : { data: rows, isLoading: false, isError: false },
  };
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

beforeEach(() => {
  mockChecks.state = 'ready';
  jest.clearAllMocks();
});

afterEach(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
});

describe('CompareContainer (06.1-23)', () => {
  it('the cash button returns to the answer in the stack on the cash side (CN-13: no second answer)', async () => {
    const r = ledgerRun('N02');
    expect(judgeBoth(prepare(r.inputs), r.check).plan).toBeNull();
    await wrap(<CompareContainer id="c1" />);
    await fireEvent.press(screen.getByText('See the cash answer'));
    expect(mockDismissTo).toHaveBeenCalledWith({ pathname: '/decide/answer/[id]', params: { id: 'c1', side: 'cash' } });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('06.1-63 (CB-4, CN-8): sits in the "Cash or installments" frame', async () => {
    await wrap(<CompareContainer id="c1" />);
    expect(screen.getByTestId('detail-title').props.children).toBe('Cash or installments');
    expect(screen.getByTestId('compare-screen')).toBeTruthy();
  });

  it('06.1-63 (CN-7 / CF-7): while the checks load it shows the loading line in the frame, not "isn\'t here"', async () => {
    mockChecks.state = 'loading';
    await wrap(<CompareContainer id="c1" />);
    expect(screen.getByTestId('answer-loading')).toBeTruthy();
    expect(screen.getByTestId('detail-title').props.children).toBe('Cash or installments');
    expect(screen.queryByTestId('check-not-found')).toBeNull();
  });

  it('06.1-63: "isn\'t here" shows once the checks loaded without the id', async () => {
    await wrap(<CompareContainer id="other" />);
    expect(screen.getByTestId('check-not-found')).toBeTruthy();
    expect(screen.queryByTestId('answer-loading')).toBeNull();
  });

  it('06.1-63: a failed read is not shown as loading', async () => {
    mockChecks.state = 'error';
    await wrap(<CompareContainer id="c1" />);
    expect(screen.queryByTestId('answer-loading')).toBeNull();
    expect(screen.getByTestId('check-not-found')).toBeTruthy();
  });

  it('"What this can\'t see" opens the About sheet instead of going back', async () => {
    await wrap(<CompareContainer id="c1" />);
    expect(screen.queryByText('About this answer')).toBeNull();
    await fireEvent.press(screen.getByTestId('answer-cant-see'));
    expect(screen.getByText('About this answer')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
