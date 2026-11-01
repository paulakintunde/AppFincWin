/**
 * Plan 05.3-41: the Answer screen. The header, the order of the parts, the not-ready card in place of the hero (D-52), the
 * refund tile and change tiles (D-13), decided checks, the record sheets, and the analytics event.
 */
import React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react-native';
import { percent } from '@/engine/payoff';
import { copy, fullEv, rowOf, storedOf, PBO_NETFLIX, READY_WITH, SCREEN_INPUTS, WAIVED_LUNCH } from './answerKit';
import { wrap } from './kit';
import { AnswerScreen } from '../AnswerScreen';

jest.setTimeout(60000);

interface MockCheck {
  status: string;
  row: unknown;
  evaluation: unknown;
  withoutRefunds: unknown;
  inputs: unknown;
}
let mockCheck: MockCheck;
let mockPay: unknown = { mode: 'once' };
const mockNavigate = jest.fn();
const mockPushOnce = jest.fn();
const mockGoBack = jest.fn();
const mockTrack = jest.fn();
const mockReopen = jest.fn(() => 'new-id');

jest.mock('@/data/queries/decideCheckV3', () => ({ useCheckV3: () => mockCheck }));
jest.mock('@/data/mutations/decideChecks', () => ({ useReopenCheck: () => ({ reopen: mockReopen }), useReopenRedirect: () => null, useReopenFailed: () => false }));
jest.mock('expo-router', () => ({ router: { navigate: (h: unknown) => mockNavigate(h), push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPushOnce(h), replaceOnce: (h: unknown) => mockPushOnce(h) }));
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: jest.fn(), focusAccessibility: jest.fn() }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: () => mockGoBack() }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', today: '2026-10-20', homeCurrency: 'USD', timeZone: 'UTC' }),
}));
jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./answerKit').fakeFormat }));
jest.mock('../../ask/focusNode', () => ({ focusNode: jest.fn() }));
// 05.3-58: the real NotReadyCard renders here; its answer hook reads queries that need the Supabase env.
const mockClearWaiver = jest.fn();
jest.mock('../../ready/useReadinessAnswer', () => ({
  useReadinessAnswer: () => ({ answer: jest.fn(), clearWaiver: (...a: unknown[]) => mockClearWaiver(...a) }),
}));
jest.mock('../questionBodies', () => ({ renderQuestionBody: () => null }));
jest.mock('../../nav/V3Skeleton', () => {
  const { Text } = jest.requireActual('react-native');
  return { V3Skeleton: () => <Text>{'skeleton'}</Text> };
});
jest.mock('../../nav/V3NotFound', () => {
  const { Text } = jest.requireActual('react-native');
  return { V3NotFound: () => <Text>{'not-found'}</Text> };
});
jest.mock('../../record/RecordSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    RecordSheet: (p: { variant: string; visible: boolean; aprText?: string | null; onClose: () => void }) => (
      <Text onPress={p.onClose}>{`sheet:${p.variant}:${String(p.visible)}:${String(p.aprText ?? null)}`}</Text>
    ),
  };
});
jest.mock('@/engine/decide/v3', () => ({
  ...jest.requireActual('@/engine/decide/v3'),
  readStoredCheck: () => ({ check: { taxPercent: null, pay: mockPay }, reasons: [] }),
}));
jest.mock('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo', () => ({
  __esModule: true,
  default: {
    setAccessibilityFocus: jest.fn(),
    announceForAccessibility: jest.fn(),
    isScreenReaderEnabled: jest.fn(() => Promise.resolve(false)),
    isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

function setCheck(over: Partial<MockCheck> = {}): void {
  mockCheck = { status: 'ready', row: rowOf(), evaluation: fullEv(), withoutRefunds: null, inputs: SCREEN_INPUTS, ...over };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPay = { mode: 'once' };
  setCheck();
});
afterEach(cleanup);

describe('AnswerScreen header', () => {
  it('shows the back control, the "Item · price" title as a button and the band badge', async () => {
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.getByLabelText('Back to the check')).toBeTruthy();
    expect(screen.getByLabelText('Sofa · $1,200. Change details')).toBeTruthy();
    expect(screen.getByText('B4')).toBeTruthy();
    expect(screen.getByLabelText('Band 4')).toBeTruthy();
  });

  it('back goes back; the title button opens the check again', async () => {
    await wrap(<AnswerScreen id="c1" />);
    await fireEvent.press(screen.getByLabelText('Back to the check'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Sofa · $1,200. Change details'));
    expect(mockPushOnce).toHaveBeenCalledWith({ pathname: '/decide/purchase/[id]', params: { id: 'c1' } });
  });
});

describe('AnswerScreen composition', () => {
  it('lays out the notices, hero, strip, facts, assumptions, links and the fixed bar', async () => {
    setCheck({ evaluation: fullEv({ notices: [{ code: 'history_window_12', values: {} }] }) });
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.getByText(copy('decide.v3.verdict.fitsMonth.chip'), { hidden: true })).toBeTruthy();
    expect(screen.getByTestId('strip-bar', { hidden: true })).toBeTruthy();
    expect(screen.getByText(/Based on your records up to today/)).toBeTruthy();
    expect(screen.getByLabelText('See how this was worked out')).toBeTruthy();
    expect(screen.getByLabelText('Record as bought')).toBeTruthy();
    expect(screen.getByLabelText('Check another price')).toBeTruthy();
  });

  it('shows the confidence chip beside the answer chip when the answer is not firm, and none when firm', async () => {
    setCheck({ evaluation: fullEv({ confidence: { level: 'fair', reasons: ['few_months'] } }) });
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.getByText('Fair')).toBeTruthy();
    await cleanup();
    setCheck();
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.queryByText('Fair')).toBeNull();
  });

  it('shows the skeleton while loading and not found for an unknown check', async () => {
    setCheck({ status: 'loading', row: null, evaluation: null, inputs: null });
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.getByText('skeleton')).toBeTruthy();
    await cleanup();
    setCheck({ row: null, evaluation: null, inputs: null });
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.getByText('not-found')).toBeTruthy();
  });

  it('keeps the last answer on screen, marked busy, while the reads reload', async () => {
    const view = await wrap(<AnswerScreen id="c1" />);
    setCheck({ status: 'loading', row: null, evaluation: null, inputs: null });
    await view.rerender(
      <AnswerScreen id="c1" />,
    );
    expect(screen.queryByText('skeleton')).toBeNull();
    expect(screen.getByText(copy('decide.v3.verdict.fitsMonth.chip'), { hidden: true })).toBeTruthy();
    expect(screen.getByLabelText(/Fits/i, { hidden: true }).props.accessibilityState?.busy).toBe(true);
  });
});

describe('not ready (D-52)', () => {
  it('shows the not-ready card in place of the hero: no verdict, no strip, no facts, no bar', async () => {
    setCheck({
      evaluation: fullEv({ readiness: { ready: false, missing: ['past_month_missing'] } }),
      row: rowOf({ answer_v3: storedOf('not_yet'), decided_at: '2026-10-12T10:00:00Z' }),
    });
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.getByText(copy('decide.v3.ui.notReady.heading'))).toBeTruthy();
    for (const chip of ['fitsMonth', 'fitsUnspent', 'notYet', 'monthlyShort', 'emergencyUse', 'needsInput']) {
      const key = `decide.v3.verdict.${chip}.chip`;
      expect(() => screen.getByText(copy(key), { hidden: true })).toThrow();
    }
    expect(screen.queryByTestId('strip-bar', { hidden: true })).toBeNull();
    expect(screen.queryByLabelText('Record as bought')).toBeNull();
    expect(screen.getByText(/^Last saved answer: .*, 12 Oct$/)).toBeTruthy();
  });
});

describe('refund tile and change tiles (D-13)', () => {
  it('shows the refund tile under the hero when the refund would improve the stored answer', async () => {
    setCheck({
      evaluation: fullEv({ code: 'fits_unspent' }),
      withoutRefunds: fullEv({ code: 'not_yet' }),
      row: rowOf({ answer_v3: storedOf('not_yet') }),
    });
    await wrap(<AnswerScreen id="c1" />);
    const tile = screen.getByLabelText(copy('decide.v3.ui.answer.refundHintA11y'));
    await fireEvent.press(tile);
    expect(mockReopen).toHaveBeenCalledTimes(1);
    expect(mockPushOnce).toHaveBeenCalledWith({ pathname: '/decide/answer/[id]', params: { id: 'new-id' } });
  });

  it('shows no refund tile when counting refunds changes nothing', async () => {
    setCheck({ evaluation: fullEv({ code: 'fits_unspent' }), withoutRefunds: fullEv({ code: 'fits_unspent' }) });
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.queryByLabelText(copy('decide.v3.ui.answer.refundHintA11y'))).toBeNull();
  });

  it('shows "changed since you opened it" once when a recompute moves the answer', async () => {
    setCheck({ evaluation: fullEv({ code: 'not_yet', variant: null, readyBy: { kind: 'month', month: '2026-12' } }) });
    const view = await wrap(<AnswerScreen id="c1" />);
    expect(screen.queryByText(/changed since you opened it/)).toBeNull();
    setCheck({ evaluation: fullEv({ code: 'fits_unspent' }) });
    await view.rerender(
      <AnswerScreen id="c1" />,
    );
    expect(screen.getAllByText(/^This answer changed since you opened it: .+ to .+\.$/)).toHaveLength(1);
    await view.rerender(
      <AnswerScreen id="c1" />,
    );
    expect(screen.getAllByText(/changed since you opened it/)).toHaveLength(1);
  });
});

describe('decided checks (D-13)', () => {
  it('shows the saved answer and Changed since you saved, and offers only new-check actions', async () => {
    setCheck({
      row: rowOf({ status: 'waiting', answer_v3: storedOf('not_yet'), decided_at: '2026-10-12T10:00:00Z' }),
      evaluation: fullEv({ code: 'fits_month' }),
    });
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.getByText(/^Saved answer: .*, 12 Oct$/)).toBeTruthy();
    expect(screen.getByText(/^Changed since you saved: .+ to .+\.$/)).toBeTruthy();
    expect(screen.queryByLabelText('Record as bought')).toBeNull();
    expect(screen.queryByLabelText('Not buying it')).toBeNull();
    expect(screen.queryByLabelText('Save the plan')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Check again'));
    expect(mockPushOnce).toHaveBeenLastCalledWith({ pathname: '/decide/answer/[id]', params: { id: 'new-id' } });
    await fireEvent.press(screen.getByLabelText('Check another price'));
    expect(mockPushOnce).toHaveBeenLastCalledWith({ pathname: '/decide/purchase/[id]', params: { id: 'new-id', focus: 'price' } });
    expect(mockReopen).toHaveBeenCalledTimes(2);
  });

  it('shows no change tile when the live code matches the saved one', async () => {
    setCheck({ row: rowOf({ status: 'bought', answer_v3: storedOf('fits_month') }), evaluation: fullEv({ code: 'fits_month' }) });
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.queryByText(/Changed since you saved/)).toBeNull();
    expect(screen.getByLabelText('Check again')).toBeTruthy();
  });
});

describe('record sheets', () => {
  it('Record as bought, Save the plan and Not buying it open the matching sheet', async () => {
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.queryByText(/^sheet:/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Record as bought'));
    expect(screen.getByText('sheet:bought:true:null')).toBeTruthy();
    await fireEvent.press(screen.getByText('sheet:bought:true:null'));
    expect(screen.getByText('sheet:bought:false:null')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save the plan'));
    expect(screen.getByText('sheet:plan:true:null')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Not buying it'));
    expect(screen.getByText('sheet:pass:true:null')).toBeTruthy();
  });

  it('passes the loan rate of a financed purchase to the bought sheet', async () => {
    mockPay = { mode: 'plan', apr: percent('6.5'), deposit: 0 };
    setCheck({ evaluation: fullEv({ financed: true }) });
    await wrap(<AnswerScreen id="c1" />);
    await fireEvent.press(screen.getByLabelText('Record as bought'));
    expect(screen.getByText('sheet:bought:true:6.5')).toBeTruthy();
  });

  it('does not leave the screen when the sheet closes without a write ("Not yet")', async () => {
    await wrap(<AnswerScreen id="c1" />);
    await fireEvent.press(screen.getByLabelText('Record as bought'));
    await fireEvent.press(screen.getByText('sheet:bought:true:null'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('returns to the Decide tab when the sheet closes after the check was decided', async () => {
    const view = await wrap(<AnswerScreen id="c1" />);
    await fireEvent.press(screen.getByLabelText('Not buying it'));
    setCheck({ row: rowOf({ status: 'passed', answer_v3: storedOf('fits_month') }) });
    await view.rerender(
      <AnswerScreen id="c1" />,
    );
    await fireEvent.press(screen.getByText('sheet:pass:true:null'));
    expect(mockNavigate).toHaveBeenCalledWith('/decide');
  });
});

describe('analytics', () => {
  it('fires decide_answer_shown on first show, not on a re-render, and again on a code change', async () => {
    const view = await wrap(<AnswerScreen id="c1" />);
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('decide_answer_shown', { code: 'fits_month', variant: 'none', band: '4' });
    await view.rerender(
      <AnswerScreen id="c1" />,
    );
    expect(mockTrack).toHaveBeenCalledTimes(1);
    setCheck({ evaluation: fullEv({ code: 'monthly_short' }) });
    await view.rerender(
      <AnswerScreen id="c1" />,
    );
    expect(mockTrack).toHaveBeenCalledTimes(2);
    expect(mockTrack).toHaveBeenLastCalledWith('decide_answer_shown', { code: 'monthly_short', variant: 'none', band: '4' });
  });

  it('fires nothing while the answer is not a verdict', async () => {
    setCheck({ evaluation: fullEv({ readiness: { ready: false, missing: ['past_month_missing'] } }) });
    await wrap(<AnswerScreen id="c1" />);
    expect(mockTrack).not.toHaveBeenCalledWith('decide_answer_shown', expect.anything());
  });
});

describe('AnswerScreen: the answers it rests on (05.3-59, D-24, D-27, D-31)', () => {
  const NETFLIX_ROW = 'Netflix, 3 Oct: counted as paid by someone else';

  it('one paid-by-other bill: the note names it and opens the sheet, where Ask again clears it once', async () => {
    setCheck({ evaluation: fullEv({ month: { paidByOther: [PBO_NETFLIX] } }) });
    await wrap(<AnswerScreen id="c1" />);
    const note = screen.getByLabelText('Netflix counted as paid by someone else.');
    expect(screen.queryByText('Your answers this rests on')).toBeNull();
    await fireEvent.press(note);
    expect(screen.getByText('How sure this answer is')).toBeTruthy();
    expect(screen.getByText('Your answers this rests on')).toBeTruthy();
    expect(screen.getByText(NETFLIX_ROW)).toBeTruthy();
    expect(screen.getByText('Not counted as money going out this month.')).toBeTruthy();
    expect(screen.getByLabelText(`${NETFLIX_ROW}. Not counted as money going out this month.`)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(`Ask again: ${NETFLIX_ROW}`));
    expect(mockClearWaiver).toHaveBeenCalledTimes(1);
    expect(mockClearWaiver).toHaveBeenCalledWith({ kind: 'paid_by_other', seriesId: 'netflix', date: '2026-10-03' }, 'Netflix');
  });

  it('two answers: the note gives a count', async () => {
    setCheck({ evaluation: fullEv({ readiness: READY_WITH([WAIVED_LUNCH]), month: { paidByOther: [PBO_NETFLIX] } }) });
    await wrap(<AnswerScreen id="c1" />);
    await fireEvent.press(screen.getByLabelText('Rests on 2 of your answers.'));
    expect(screen.getByText('Lunch, 21 Sep: counted as paid by someone else')).toBeTruthy();
    expect(screen.getByText(NETFLIX_ROW)).toBeTruthy();
    // September's Lunch is not this month: one effect line only
    expect(screen.getAllByText('Not counted as money going out this month.')).toHaveLength(1);
  });

  it('always paid by someone else, with October recorded paid and no readiness items: one named row', async () => {
    setCheck({ evaluation: fullEv({ readiness: READY_WITH([]), month: { paidByOther: [], alwaysOther: [{ seriesId: 'netflix', name: 'Netflix' }] } }) });
    await wrap(<AnswerScreen id="c1" />);
    await fireEvent.press(screen.getByLabelText('Netflix counted as always paid by someone else.'));
    expect(screen.getAllByText('Netflix: counted as always paid by someone else')).toHaveLength(1);
    expect(screen.getByText('Not counted against your months, including your typical month.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Ask again: Netflix: counted as always paid by someone else'));
    expect(mockClearWaiver).toHaveBeenCalledWith({ kind: 'always_other', seriesId: 'netflix' }, 'Netflix');
  });

  it('no answers: no note, and the chip and level are unchanged', async () => {
    setCheck({ evaluation: fullEv({ confidence: { level: 'fair', reasons: ['few_months'] } }) });
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.queryByText(/Rests on|counted as/)).toBeNull();
    await fireEvent.press(screen.getByText('Fair'));
    expect(screen.queryByText('Your answers this rests on')).toBeNull();
    expect(screen.queryByText(/Ask again/)).toBeNull();
  });
});
