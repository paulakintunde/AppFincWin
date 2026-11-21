// 08.1-24 (owner caution sign 2026-11-21, Q1-Q4 A): a Fits answer whose 12-month path goes below $0 later (08.1-13 later-dip facts)
// shows the caution sign before the verdict word, with words naming the first day below $0. The verdict (chip, title, body) does not
// change. Spoken first in the card's one summary label. Shown on Just me and Household answers and on the saved view (still).
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { judgeCheck, prepare, type Fact, type Result } from '@/engine/decide/v3';
import { toEngineInputs } from '@/engine/decide/v3/__tests__/rightAnswers/fixture';
import { loadCases } from '@/engine/decide/v3/__tests__/rightAnswers/loader';
import { wrap } from '@/test/stepProps';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AsCheckedAnswer } from '../../past/AsCheckedAnswer';
import { AnswerFrame, type AnswerFrameProps } from '../AnswerFrame';
import { VerdictCard } from '../VerdictCard';
import { ledgerRun, viewOf, type Run } from './fixtures';

jest.setTimeout(60000);

jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));

let mockKnown: boolean | null = false;
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useReduceMotionKnown: () => mockKnown,
  useMotion: () => ({ reduced: false, duration: (ms: number) => ms, easing: undefined, fade: (ms: number) => ms }),
}));

const mockWithTiming = jest.fn();
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    withTiming: (...a: unknown[]) => {
      mockWithTiming(...a);
      return actual.withTiming(...a);
    },
  };
});

const opts = { includeHiddenElements: true };
const noop = (): void => undefined;

const laterFact = (code: 'below_zero_later_without' | 'below_zero_later_with', date = '2027-06-14'): Fact =>
  ({ code, values: { date, zero: 0 } }) as unknown as Fact;

/** The same run with one fact added (the engine emits the later-dip facts only on a 12-month path; here it is hand-added). */
function withFact(r: Run, fact: Fact | null): Run {
  const result: Result = { ...r.evaluation.result, facts: fact === null ? r.evaluation.result.facts : [...r.evaluation.result.facts, fact] };
  return { ...r, evaluation: { ...r.evaluation, result } };
}

async function frame(r: Run, over: Partial<AnswerFrameProps['check']> = {}) {
  return wrap(
    <AnswerFrame
      check={{ ...viewOf(r), ...over }}
      evaluation={r.evaluation}
      said={{ currency: r.inputs.currency, today: r.inputs.asOf }}
      onAction={noop}
      onOption={noop}
      onCantSee={noop}
      onImport={noop}
    />,
  );
}

const summary = () => screen.getByTestId('answer-verdict');
const badgeWord = () => screen.getByTestId('answer-verdict-badge').props.accessibilityLabel as string;
const visibleWords = () => screen.queryByTestId('answer-caution-words', opts)?.props.children as string | undefined;

/** Everything about the verdict except the caution: the badge word and the summary label once the caution part is taken off. */
function verdictWithout(label: string): string {
  return label.replace(/^Caution: .*? on June 14\. /, '');
}

beforeEach(() => {
  mockKnown = false;
  mockWithTiming.mockClear();
});

describe('the caution sign on the answer (08.1-24)', () => {
  it('Fits with a later dip: sign before the badge, words name the day, spoken first; verdict unchanged', async () => {
    const base = ledgerRun('N02'); // fits_month, small_net
    const plain = await frame(withFact(base, null));
    expect(screen.queryByTestId('answer-caution', opts)).toBeNull();
    const plainLabel = summary().props.accessibilityLabel as string;
    const plainBadge = badgeWord();
    await plain.unmount();

    await frame(withFact(base, laterFact('below_zero_later_without')));
    const row = screen.getByTestId('answer-caution', opts);
    // icon first, then the badge, then the words (Q1 A)
    const ids = row.children.flatMap((c) => (typeof c === 'string' ? [] : [String(c.props.testID ?? '')]));
    expect(ids.indexOf('answer-caution-icon')).toBeLessThan(ids.indexOf('answer-verdict-badge'));
    expect(ids.indexOf('answer-verdict-badge')).toBeLessThan(ids.indexOf('answer-caution-words'));
    expect(visibleWords()).toMatch(/^· dips below \$0(\.00)? on Jun 14$/);
    const label = summary().props.accessibilityLabel as string;
    // the spoken zero is the app's spoken money (D-94), with cents as the answer shows them
    expect(label.startsWith('Caution: dips below 0.00 dollars on June 14. ')).toBe(true);
    expect(verdictWithout(label)).toBe(plainLabel);
    expect(badgeWord()).toBe(plainBadge);
  });

  it('without cents the words read "$0" and the spoken label "0 dollars"', async () => {
    const r = withFact(ledgerRun('N02'), laterFact('below_zero_later_without'));
    await wrap(
      <AnswerFrame
        check={viewOf(r)}
        evaluation={r.evaluation}
        said={{ currency: r.inputs.currency, today: r.inputs.asOf, showCents: false }}
        onAction={noop}
        onOption={noop}
        onCantSee={noop}
        onImport={noop}
      />,
    );
    expect(visibleWords()).toBe('· dips below $0 on Jun 14');
    expect(String(summary().props.accessibilityLabel).startsWith('Caution: dips below 0 dollars on June 14. ')).toBe(true);
  });

  it('a Fits tight answer with a later dip shows the sign too', async () => {
    const r = ledgerRun('N04'); // fits_unspent, tight
    await frame(withFact(r, laterFact('below_zero_later_without')));
    expect(screen.getByTestId('answer-caution', opts)).toBeTruthy();
  });

  it('the "with this" kind shows the same sign', async () => {
    await frame(withFact(ledgerRun('N02'), laterFact('below_zero_later_with', '2027-03-02')));
    expect(visibleWords()).toMatch(/on Mar 2$/);
  });

  it('a Not yet answer (forged with a later fact) shows no sign (T-08.1-69)', async () => {
    await frame(withFact(ledgerRun('N05'), laterFact('below_zero_later_without')));
    expect(screen.queryByTestId('answer-caution', opts)).toBeNull();
    expect(String(summary().props.accessibilityLabel)).not.toMatch(/^Caution/);
  });

  it('a Household answer shows the sign the same way (Q3 A)', async () => {
    await frame(withFact(ledgerRun('N02'), laterFact('below_zero_later_without')), { scopeLabel: 'Household · Flat 4B' });
    expect(screen.getByTestId('answer-caution', opts)).toBeTruthy();
  });

  it('with Reduce Motion on the sign renders and no animation starts', async () => {
    mockKnown = true;
    await frame(withFact(ledgerRun('N02'), laterFact('below_zero_later_without')));
    expect(screen.getByTestId('answer-caution', opts)).toBeTruthy();
    expect(mockWithTiming).not.toHaveBeenCalled();
  });

  it('the saved "as checked" view shows the sign and keeps it still (Q3 A)', async () => {
    const r = withFact(ledgerRun('N02'), laterFact('below_zero_later_without'));
    await wrap(
      <AsCheckedAnswer
        stored={r.evaluation.result as unknown as Record<string, unknown>}
        dateText="Nov 1"
        currency={r.inputs.currency}
        today={r.inputs.asOf}
        once={false}
        onCantSee={noop}
      />,
    );
    expect(screen.getByTestId('answer-caution', opts)).toBeTruthy();
    expect(mockWithTiming).not.toHaveBeenCalled();
  });
});

describe('VerdictCard with no caution keeps its tree (08.1-24)', () => {
  it('renders the badge directly in the summary, with no caution row', async () => {
    await render(
      <ThemeProvider>
        <VerdictCard code="fits_month" variant="small_net" once={false} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('answer-caution', opts)).toBeNull();
    const badge = screen.getByTestId('answer-verdict-badge');
    expect(badge.parent?.props.testID ?? badge.parent?.parent?.props.testID).toBe('answer-verdict');
  });
});

describe('end to end on the real engine (SN-32 later dip, SN-34 control)', () => {
  const runCase = (id: string): Run => {
    const found = loadCases().find((c) => c.id === id);
    if (found === undefined) throw new RangeError(`no right-answers case ${id}`);
    const { inputs, check } = toEngineInputs(found.fixture);
    return { inputs, check, evaluation: judgeCheck(prepare(inputs), check) };
  };

  it('SN-32 shows the sign', async () => {
    await frame(runCase('SN-32'));
    expect(screen.getByTestId('answer-caution', opts)).toBeTruthy();
  });

  it('SN-34 does not', async () => {
    await frame(runCase('SN-34'));
    expect(screen.queryByTestId('answer-caution', opts)).toBeNull();
  });
});
