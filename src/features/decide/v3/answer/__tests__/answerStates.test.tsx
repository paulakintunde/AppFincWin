/**
 * Plan 05.3-41 (UI-SPEC "Nine answer states"): each state renders its catalogue chip and its one filled primary action, and the
 * action buttons open the record sheets. needs_input has no filled button and offers "Help me check this" in the body.
 */
import React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react-native';
import { verdictRowFor } from '@/engine/decide/v3';
import { copy, fullEv, rowOf, SCREEN_INPUTS, type FullOver } from './answerKit';
import { wrap } from './kit';
import { AnswerScreen } from '../AnswerScreen';

jest.setTimeout(60000);

let mockCheck: Record<string, unknown>;

jest.mock('@/data/queries/decideCheckV3', () => ({ useCheckV3: () => mockCheck }));
jest.mock('@/data/mutations/decideChecks', () => ({ useReopenCheck: () => ({ reopen: () => 'new-id' }), useReopenRedirect: () => null, useReopenFailed: () => false }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn(), replaceOnce: jest.fn() }));
jest.mock('@/shell/a11yFocus', () => ({ useScreenTitleFocus: jest.fn(), focusAccessibility: jest.fn() }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn() }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', today: '2026-10-20', homeCurrency: 'USD', timeZone: 'UTC' }),
}));
jest.mock('../../shared/useV3Format', () => ({ useV3Format: () => jest.requireActual('./answerKit').fakeFormat }));
jest.mock('../../ask/focusNode', () => ({ focusNode: jest.fn() }));
// 05.3-58: the real NotReadyCard renders here; its answer hook reads queries that need the Supabase env.
jest.mock('../../ready/useReadinessAnswer', () => ({ useReadinessAnswer: () => ({ answer: jest.fn(), clearWaiver: jest.fn() }) }));
jest.mock('../questionBodies', () => ({ renderQuestionBody: () => null }));
jest.mock('../../record/RecordSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return { RecordSheet: (p: { variant: string; visible: boolean }) => <Text>{`sheet:${p.variant}:${String(p.visible)}`}</Text> };
});
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

beforeEach(() => jest.clearAllMocks());
afterEach(cleanup);

const FILLED = '#1B4D3E';
function isFilled(label: string): boolean {
  const style = screen.getByLabelText(label).props.style;
  const flat = Array.isArray(style) ? Object.assign({}, ...style.flat(2).filter(Boolean)) : style;
  return flat.backgroundColor === FILLED;
}

interface State {
  name: string;
  over: FullOver;
  primary: string | null;
}

const STATES: State[] = [
  { name: 'fits_month', over: { code: 'fits_month' }, primary: 'Record as bought' },
  {
    name: 'fits_month low_month',
    over: { code: 'fits_month', variant: 'low_month', facts: [{ code: 'low_month', values: { month: '2027-01', left: 5000, monthly: 12000 } }] },
    primary: 'Record as bought',
  },
  { name: 'fits_unspent', over: { code: 'fits_unspent', facts: [{ code: 'unspent_before_after', values: { before: 190000, after: 70000 } }] }, primary: 'Record as bought' },
  {
    name: 'fits_unspent low_month',
    over: {
      code: 'fits_unspent',
      variant: 'low_month',
      facts: [
        { code: 'unspent_before_after', values: { before: 190000, after: 70000 } },
        { code: 'low_month', values: { month: '2027-01', left: 5000, monthly: 12000 } },
      ],
    },
    primary: 'Record as bought',
  },
  {
    name: 'not_yet payday',
    over: { code: 'not_yet', variant: 'payday', readyBy: { kind: 'date', date: '2026-10-28' }, cash: { kind: 'payday', until: '2026-10-28', shortBy: 20000 }, split: [] },
    primary: 'Remind me 28 Oct',
  },
  { name: 'not_yet not covered', over: { code: 'not_yet', variant: 'not_covered', readyBy: { kind: 'month', month: '2026-12' }, split: [] }, primary: 'Plan it' },
  { name: 'monthly_short', over: { code: 'monthly_short', split: [] }, primary: 'Save the plan' },
  { name: 'emergency_use', over: { code: 'emergency_use', facts: [{ code: 'emergency_used', values: { used: 120000, months: 3 } }] }, primary: 'Record as bought' },
  { name: 'needs_input', over: { code: 'needs_input', missing: ['no_income_figures'], split: [] }, primary: null },
];

describe('nine answer states', () => {
  it.each(STATES)('$name: the catalogue chip and the right primary action', async (state) => {
    mockCheck = { status: 'ready', row: rowOf(), evaluation: fullEv(state.over), withoutRefunds: null, inputs: SCREEN_INPUTS };
    await wrap(<AnswerScreen id="c1" />);
    const chipKey = verdictRowFor(state.over.code as never, (state.over.variant ?? null) as never).chipKey;
    expect(screen.getByText(copy(chipKey), { hidden: true })).toBeTruthy();
    if (state.primary === null) {
      expect(isFilled('Record as bought')).toBe(false);
      expect(isFilled('Save the plan')).toBe(false);
    } else {
      expect(isFilled(state.primary)).toBe(true);
      const others = ['Record as bought', 'Save the plan', 'Plan it'].filter((l) => l !== state.primary && screen.queryByLabelText(l) !== null);
      for (const label of others) expect(isFilled(label)).toBe(false);
    }
  });

  it('needs_input: the card lists what is missing and offers Help me check this when no month is fully recorded', async () => {
    mockCheck = {
      status: 'ready',
      row: rowOf(),
      evaluation: fullEv({ code: 'needs_input', missing: ['no_income_figures'], split: [] }),
      withoutRefunds: null,
      inputs: { months: [{ full: false }] },
    };
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.getByText(copy('decide.v3.ui.answer.missingHeading'))).toBeTruthy();
    expect(screen.getByLabelText('Help me check this')).toBeTruthy();
    expect(screen.getByLabelText('Update my records instead')).toBeTruthy();
    expect(screen.queryByLabelText('What could I do instead?')).toBeNull();
  });

  it('needs_input: no Help me check this once a month is fully recorded', async () => {
    mockCheck = { status: 'ready', row: rowOf(), evaluation: fullEv({ code: 'needs_input', missing: ['no_income_figures'], split: [] }), withoutRefunds: null, inputs: SCREEN_INPUTS };
    await wrap(<AnswerScreen id="c1" />);
    expect(screen.queryByLabelText('Help me check this')).toBeNull();
    expect(screen.getByLabelText('Update my records instead')).toBeTruthy();
  });

  it('the action buttons open the record sheets (the recorded state)', async () => {
    mockCheck = { status: 'ready', row: rowOf(), evaluation: fullEv({ code: 'not_yet', variant: 'not_covered', readyBy: { kind: 'month', month: '2026-12' }, split: [] }), withoutRefunds: null, inputs: SCREEN_INPUTS };
    await wrap(<AnswerScreen id="c1" />);
    await fireEvent.press(screen.getByLabelText('Record as bought'));
    expect(screen.getByText('sheet:bought:true')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Plan it'));
    expect(screen.getByText('sheet:plan:true')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Not buying it'));
    expect(screen.getByText('sheet:pass:true')).toBeTruthy();
  });
});
