/**
 * Plan 05.3-41 (D-07, D-08): the in-place question registry and the ask flow on the Answer screen. The seven bodies are stubs;
 * their own tests live with them (05.3-32, 05.3-33). Each save shows exactly one Undo toast, shown by the question card.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import type { MissingCode } from '@/engine/decide/v3';
import { QUESTION_CODES } from '../../model/ask';
import { copy, fullEv, rowOf, SCREEN_INPUTS } from './answerKit';
import { wrap } from './kit';
import { renderQuestionBody } from '../questionBodies';
import { AnswerScreen } from '../AnswerScreen';

jest.setTimeout(60000);

let mockCheck: Record<string, unknown>;
const mockToast = jest.fn();
const mockTrack = jest.fn();
const mockFocus = jest.fn();

jest.mock('@/data/queries/decideCheckV3', () => ({ useCheckV3: () => mockCheck }));
jest.mock('@/data/mutations/decideChecks', () => ({ useReopenCheck: () => ({ reopen: () => 'new-id' }) }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: jest.fn(), focusAccessibility: jest.fn() }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn() }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockToast(t) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', today: '2026-10-20', homeCurrency: 'USD', timeZone: 'UTC' }),
}));
jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./answerKit').fakeFormat }));
jest.mock('../../ask/focusNode', () => ({ focusNode: (n: unknown) => mockFocus(n) }));
// 05.3-58: the real NotReadyCard renders here; its answer hook reads queries that need the Supabase env.
jest.mock('../../ready/useReadinessAnswer', () => ({ useReadinessAnswer: () => ({ answer: jest.fn(), clearWaiver: jest.fn() }) }));
jest.mock('../../record/RecordSheet', () => ({ RecordSheet: () => null }));
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

// The seven bodies: each saves with step-1 when its marker is pressed.
function mockStubBody(name: string) {
  const { Text } = jest.requireActual('react-native');
  return function Body(p: { onSaved: (id: string | null) => void }) {
    return <Text accessibilityLabel="save-it" onPress={() => p.onSaved('step-1')}>{`body:${name}`}</Text>;
  };
}
jest.mock('../../ask/AccountUseBody', () => ({ AccountUseBody: (p: never) => jest.requireActual('react').createElement(mockStubBody('AccountUse'), p) }));
jest.mock('../../ask/PayArrivalBody', () => ({ PayArrivalBody: (p: never) => jest.requireActual('react').createElement(mockStubBody('PayArrival'), p) }));
jest.mock('../../ask/VolatileCoverBody', () => ({ VolatileCoverBody: (p: never) => jest.requireActual('react').createElement(mockStubBody('VolatileCover'), p) }));
jest.mock('../../askMore/UnspentBody', () => ({ UnspentBody: (p: never) => jest.requireActual('react').createElement(mockStubBody('Unspent'), p) }));
jest.mock('../../askMore/UnexplainedBody', () => ({ UnexplainedBody: (p: never) => jest.requireActual('react').createElement(mockStubBody('Unexplained'), p) }));
jest.mock('../../askMore/IncomePatternBody', () => ({ IncomePatternBody: (p: never) => jest.requireActual('react').createElement(mockStubBody('IncomePattern'), p) }));
jest.mock('../../askMore/ExpectedIncomeBody', () => ({ ExpectedIncomeBody: (p: never) => jest.requireActual('react').createElement(mockStubBody('ExpectedIncome'), p) }));

beforeEach(() => jest.clearAllMocks());
afterEach(cleanup);

const question = (code: MissingCode) =>
  ({ code, questionKey: 'decide.v3.ui.ask.unspent', variant: null, params: {}, pay: null, months: [] }) as never;
const props = (code: MissingCode) => ({ question: question(code), checkId: 'c1', userId: 'u1', householdId: 'h1', onSaved: jest.fn() });

const BODY_OF: Record<string, string> = {
  account_use_question: 'AccountUse',
  pay_arrival_question: 'PayArrival',
  unspent_not_confirmed: 'Unspent',
  unexplained_money_question: 'Unexplained',
  income_pattern_unconfirmed: 'IncomePattern',
  expected_income_needed: 'ExpectedIncome',
  volatile_cover_question: 'VolatileCover',
};

describe('renderQuestionBody', () => {
  it('maps all seven question codes to their bodies', async () => {
    expect([...QUESTION_CODES].sort()).toEqual(Object.keys(BODY_OF).sort());
    for (const code of QUESTION_CODES) {
      await render(renderQuestionBody(code, props(code)));
      expect(screen.getByText(`body:${BODY_OF[code]}`)).toBeTruthy();
      await cleanup();
    }
  });

  it('throws for a missing code that is not a question', () => {
    for (const code of ['no_income_figures', 'no_price', 'plan_count_missing', 'plan_rate_missing', 'records_look_behind'] as MissingCode[]) {
      expect(() => renderQuestionBody(code, props(code))).toThrow(RangeError);
    }
  });
});

function setMissing(missing: string[]): void {
  mockCheck = { status: 'ready', row: rowOf(), evaluation: fullEv({ missing }), withoutRefunds: null, inputs: SCREEN_INPUTS };
}

describe('AnswerScreen asking in place', () => {
  it('takes the question card in the hero place and hides the strip, facts and bar', async () => {
    setMissing(['account_use_question', 'pay_arrival_question']);
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.getByText('One thing first')).toBeTruthy();
    expect(screen.getByText('and 1 more question')).toBeTruthy();
    expect(screen.getByText('body:AccountUse')).toBeTruthy();
    expect(screen.getByText('Your answer is saved as you go.')).toBeTruthy();
    expect(screen.queryByText(copy('decide.v3.verdict.fitsMonth.chip'), { hidden: true })).toBeNull();
    expect(screen.queryByTestId('strip-bar', { hidden: true })).toBeNull();
    expect(screen.queryByLabelText('Record as bought')).toBeNull();
    expect(mockTrack).not.toHaveBeenCalledWith('decide_answer_shown', expect.anything());
  });

  it('asks the next question after a save with exactly one toast, then rises the hero in and moves focus to it', async () => {
    setMissing(['account_use_question', 'pay_arrival_question']);
    const view = await wrap(<AnswerScreen id="c1" />);

    await fireEvent.press(screen.getByLabelText('save-it'));
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'undo.label.accountUseSaved', params: {} }, stepId: 'step-1' });

    setMissing(['pay_arrival_question']);
    await view.rerender(<AnswerScreen id="c1" />);
    expect(screen.getByText('body:PayArrival')).toBeTruthy();
    expect(screen.queryByText(/more question/)).toBeNull();

    await fireEvent.press(screen.getByLabelText('save-it'));
    expect(mockToast).toHaveBeenCalledTimes(2);
    expect(mockToast).toHaveBeenLastCalledWith({ kind: 'ordinary', text: { key: 'undo.label.payArrivalSaved', params: {} }, stepId: 'step-1' });

    const focusBefore = mockFocus.mock.calls.length;
    setMissing([]);
    await view.rerender(<AnswerScreen id="c1" />);
    expect(screen.getByText(copy('decide.v3.verdict.fitsMonth.chip'), { hidden: true })).toBeTruthy();
    expect(screen.getByLabelText('Record as bought')).toBeTruthy();
    expect(screen.queryByText('Your answer is saved as you go.')).toBeNull();
    expect(mockFocus.mock.calls.length).toBeGreaterThan(focusBefore);
    expect(mockFocus.mock.calls[mockFocus.mock.calls.length - 1]?.[0]).not.toBeNull();
    // the answer the user answered into is not an answer that "changed since you opened it"
    expect(screen.queryByText(/changed since you opened it/)).toBeNull();
    expect(mockTrack).toHaveBeenCalledWith('decide_answer_shown', { code: 'fits_month', variant: 'none', band: '4' });
  });

  it('does not ask on a decided check', async () => {
    mockCheck = { status: 'ready', row: rowOf({ status: 'waiting' }), evaluation: fullEv({ missing: ['account_use_question'] }), withoutRefunds: null, inputs: SCREEN_INPUTS };
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.queryByText('One thing first')).toBeNull();
  });
});
