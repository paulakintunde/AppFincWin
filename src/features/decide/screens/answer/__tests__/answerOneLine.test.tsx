// 06.1-67 (H-6, G-10, CS-1, CS-4, CS-5, CS-7, CB-13 / FQ9, DS-3, DN-4): the answer's own one-line budget, apart from 06.1-60's
// oneLineBudget.test.tsx. "The answer" is what sits above the options: the notice line, the verdict card (counted as one sentence,
// the verdict line) and the facts. A sentence is text ending in ". ? !" outside a control's own words (button, link, header). A
// tight verdict shows at most two before anything is opened; Why? then opens every fact and notice, so none is lost (T-06.1-67-01).
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';
import type { TestInstance as ReactTestInstance } from 'test-renderer';
import type { Evaluation, Notice } from '@/engine/decide/v3';
import en from '@/i18n/locales/en';
import { wrap } from '@/test/stepProps';
import { AnswerFrame, type AnswerAction } from '../AnswerFrame';
import { MoreDetailRows, type DetailRow } from '../MoreDetailRows';
import { GiveMoreSheet } from '../info/GiveMoreSheet';
import { giveMoreCount } from '../../logic/answerLines';
import type { Line } from '../../logic/sayResult';
import { ledgerRun, viewOf, type Run } from './fixtures';

jest.setTimeout(60000);
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn() }));

const noop = (): void => undefined;
const LABEL_ROLES = new Set(['button', 'link', 'header', 'radio', 'tab']);

function textOf(n: ReactTestInstance): string {
  return n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}
const split = (text: string): string[] =>
  text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => /[.?!]$/.test(s));

/** Sentences under `root` outside control labels; the verdict card counts as one (the verdict line). */
function sentencesIn(root: ReactTestInstance): string[] {
  const out: string[] = [];
  const walk = (n: ReactTestInstance, skip: boolean): void => {
    if (n.props?.testID === 'answer-verdict') {
      out.push('<verdict>');
      return;
    }
    const role: unknown = n.props?.accessibilityRole;
    const inLabel = skip || (typeof role === 'string' && LABEL_ROLES.has(role));
    if (n.type === 'Text') {
      if (!inLabel) out.push(...split(textOf(n)));
      return;
    }
    for (const c of n.children) if (typeof c !== 'string') walk(c, inLabel);
  };
  walk(root, false);
  return out;
}

/** The answer above the options: the notice line, then the verdict area. */
function answerSentences(): string[] {
  const notices = screen.queryByTestId('answer-notices');
  return [...(notices === null ? [] : sentencesIn(notices)), ...sentencesIn(screen.getByTestId('answer-verdict-area'))];
}

async function frame(r: Run, evaluation: Evaluation = r.evaluation) {
  const actions: AnswerAction[] = [];
  await wrap(
    <AnswerFrame
      check={viewOf(r)}
      evaluation={evaluation}
      said={{ currency: r.inputs.currency, today: r.inputs.asOf }}
      onAction={(a) => actions.push(a)}
      onOption={noop}
      onCantSee={noop}
    />,
  );
  await screen.findByTestId('answer-verdict');
  return actions;
}

const notice = (code: Notice['code'], values: Record<string, unknown> = {}): Notice => ({ code, values }) as unknown as Notice;

/** DS-3: the six grey lines from the device walk (06.1-FLOW-AUDIT-DEVICE.md row DS-3), on the tight N04 answer. */
function sixCaveats(r: Run): Evaluation {
  const base = r.evaluation;
  return {
    ...base,
    result: {
      ...base.result,
      notices: [
        notice('unsaved_changes'),
        notice('month_heading_short', { month: '2026-11', short: 7145 }),
        notice('month_looks_under_logged', { month: '2026-02' }),
        notice('month_looks_under_logged', { month: '2026-10' }),
        notice('tax_not_included'),
        notice('account_use_unknown', { count: 4 }),
      ],
    },
  };
}

describe('the answer, short line first (06.1-67, H-6, CS-1)', () => {
  it('N04 is a tight verdict with more than one fact (the budget has something to hold back)', () => {
    const { result } = ledgerRun('N04').evaluation;
    expect(result.variant).toBe('tight');
    expect(result.facts.length).toBeGreaterThan(1);
  });

  it('a tight verdict shows at most two sentences before Why? is opened: the verdict line and the first fact', async () => {
    const r = ledgerRun('N04');
    await frame(r);
    const shown = answerSentences();
    expect(shown.length).toBeLessThanOrEqual(2);
    expect(shown[0]).toBe('<verdict>');
    expect(screen.getByTestId('answer-fact-0')).toBeTruthy();
    expect(screen.queryByTestId('answer-fact-1')).toBeNull();
    expect(screen.getByTestId('answer-facts-why')).toBeTruthy();
  });

  it('Why? opens every other fact, in the engine order: no fact is lost (T-06.1-67-01)', async () => {
    const r = ledgerRun('N04');
    await frame(r);
    const before = textOf(screen.getByTestId('answer-facts'));
    await fireEvent.press(screen.getByTestId('answer-facts-why'));
    const facts = screen.getByTestId('answer-facts');
    const indexes = within(facts)
      .getAllByTestId(/^answer-fact-\d+$/)
      .map((n) => Number(String(n.props.testID).slice('answer-fact-'.length)));
    // every engine fact has its row (free help only where its More detail row exists; N04 is not one of those)
    expect(indexes).toEqual(r.evaluation.result.facts.map((_f, i) => i));
    expect(textOf(facts).length).toBeGreaterThan(before.length);
    expect(screen.getByText(en.decide.screens.common.less)).toBeTruthy();
  });

  it('reading order: verdict, first fact, Why?, then the rest once opened', async () => {
    await frame(ledgerRun('N04'));
    await fireEvent.press(screen.getByTestId('answer-facts-why'));
    const ids = screen
      .getAllByTestId(/^answer-(verdict|fact-\d+|facts-why)$/)
      .map((n) => String(n.props.testID));
    expect(ids[0]).toBe('answer-verdict');
    expect(ids[1]).toBe('answer-fact-0');
    expect(ids[2]).toBe('answer-facts-why');
    expect(ids.slice(3).every((id) => /^answer-fact-\d+$/.test(id))).toBe(true);
  });
});

describe('DS-3: one notice above the verdict, the rest behind Why?', () => {
  it('the six-caveat case shows only the one that changes the answer most, above the verdict', async () => {
    const r = ledgerRun('N04');
    await frame(r, sixCaveats(r));
    const above = screen.getByTestId('answer-notices');
    expect(within(above).getAllByTestId(/^answer-notice-/)).toHaveLength(1);
    expect(within(above).getByTestId('answer-notice-month_heading_short')).toBeTruthy();
    expect(screen.queryByTestId('answer-notice-unsaved_changes')).toBeNull();
    expect(screen.queryByTestId('answer-notice-tax_not_included')).toBeNull();
    // the notice line plus the verdict line plus the first fact
    expect(answerSentences().length).toBeLessThanOrEqual(3);
  });

  it('Why? opens the other five notices, after the facts', async () => {
    const r = ledgerRun('N04');
    await frame(r, sixCaveats(r));
    await fireEvent.press(screen.getByTestId('answer-facts-why'));
    const body = screen.getByTestId('answer-facts-why-body');
    expect(within(body).getByTestId('answer-notice-unsaved_changes')).toHaveTextContent(en.decide.v3.notice.unsaved_changes);
    expect(within(body).getAllByTestId('answer-notice-month_looks_under_logged')).toHaveLength(2);
    expect(within(body).getByTestId('answer-notice-tax_not_included')).toHaveTextContent(en.decide.v3.notice.tax_not_included);
    expect(within(body).getByTestId('answer-notice-account_use_unknown')).toBeTruthy();
    const ids = within(body)
      .getAllByTestId(/^answer-(fact-\d+|notice-.+)$/)
      .map((n) => String(n.props.testID));
    const firstNotice = ids.findIndex((id) => id.startsWith('answer-notice-'));
    expect(ids.slice(firstNotice).every((id) => id.startsWith('answer-notice-'))).toBe(true);
  });

  it('an answer whose only notice is unsaved changes still shows it above the verdict (CO-D-113)', async () => {
    const r = ledgerRun('N04');
    const base = r.evaluation;
    await frame(r, { ...base, result: { ...base.result, notices: [notice('unsaved_changes')] } });
    expect(within(screen.getByTestId('answer-notices')).getByTestId('answer-notice-unsaved_changes')).toBeTruthy();
  });
});

describe('CS-4: missing figures are one short line; the list lives in Give it more to go on', () => {
  function withMissing(r: Run, codes: readonly string[]): Evaluation {
    const base = r.evaluation;
    return { ...base, result: { ...base.result, missing: codes as unknown as Evaluation['result']['missing'] } };
  }

  it('two missing figures read as one line, with no Fix list inline; its More opens the sheet', async () => {
    const r = ledgerRun('N04');
    const actions = await frame(r, withMissing(r, ['everyday_unknown', 'records_look_behind']));
    const line = screen.getByTestId('answer-missing-more');
    expect(line).toHaveTextContent('2 figures are missing. More');
    expect(line.props.accessibilityLabel).toBe('2 figures are missing. More');
    expect(screen.queryByText('Fix')).toBeNull();
    await fireEvent.press(line);
    expect(actions).toEqual([{ kind: 'giveMore' }]);
  });

  it('one missing figure reads "One figure is missing."', async () => {
    const r = ledgerRun('N04');
    await frame(r, withMissing(r, ['everyday_unknown']));
    expect(screen.getByTestId('answer-missing-more')).toHaveTextContent('One figure is missing. More');
  });

  it('no missing figure, no line', async () => {
    await frame(ledgerRun('N04'));
    expect(screen.queryByTestId('answer-missing-more')).toBeNull();
  });
});

describe('free help lives only in its More detail row (CS-4)', () => {
  const helpFact = (r: Run): Evaluation => {
    const base = r.evaluation;
    return { ...base, result: { ...base.result, facts: [...base.result.facts, { code: 'free_help', values: { name: 'NFCC' } }] as Evaluation['result']['facts'] } };
  };

  it('a US answer (a service is listed) keeps the free-help sentence out of the facts', async () => {
    const r = ledgerRun('N04');
    await wrap(
      <AnswerFrame check={{ ...viewOf(r), country: 'US' }} evaluation={helpFact(r)} said={{ currency: r.inputs.currency, today: r.inputs.asOf }} onAction={noop} onOption={noop} onCantSee={noop} />,
    );
    await fireEvent.press(await screen.findByTestId('answer-facts-why'));
    expect(screen.queryByText(/gives money help at no cost/)).toBeNull();
  });

  it('with no service listed for the country, the sentence stays a fact', async () => {
    const r = ledgerRun('N04');
    await wrap(
      <AnswerFrame check={{ ...viewOf(r), country: 'ZZ' }} evaluation={helpFact(r)} said={{ currency: r.inputs.currency, today: r.inputs.asOf }} onAction={noop} onOption={noop} onCantSee={noop} />,
    );
    await fireEvent.press(await screen.findByTestId('answer-facts-why'));
    expect(screen.getByText('NFCC gives money help at no cost.')).toBeTruthy();
  });
});

describe('CS-5: the Give it more count equals the lines the sheet lists', () => {
  const line = (code: string, text: string): Line => ({ key: `k.${code}`, code, text });
  const list = {
    nextStep: line('add_records', 'More months of records give this more to go on.'),
    readiness: [line('past_month_missing', 'A past month is missing.'), line('spending_missing', 'Spending is missing.')],
    missing: [line('no_income_figures', 'No regular income is set up yet.')],
  };

  it('the row says 4 and the sheet lists 4 lines', async () => {
    const count = giveMoreCount(list);
    await wrap(<MoreDetailRows runningValue="none" showStops={false} giveMoreCount={count} showHelp={false} showSideBySide={false} onOpen={noop} />);
    await screen.findByTestId('answer-more-detail');
    expect(screen.getByTestId('answer-detail-giveMore')).toHaveTextContent('4 ways to give it more to go on');
    await wrap(<GiveMoreSheet {...list} onOpenMissing={noop} onClose={noop} />);
    await screen.findByTestId('give-more-next');
    const listed = [...screen.queryAllByTestId('give-more-next'), ...screen.queryAllByTestId('give-more-readiness'), ...screen.queryAllByTestId('give-more-missing')];
    expect(listed).toHaveLength(count);
  });

  it('no "Remind me" anywhere in the sheet (FQ9, CB-13)', async () => {
    await wrap(<GiveMoreSheet {...list} onOpenMissing={noop} onClose={noop} />);
    await screen.findByTestId('give-more-next');
    expect(screen.queryByText(/Remind me/)).toBeNull();
    expect(screen.queryByTestId('give-more-remind')).toBeNull();
  });
});

describe('CS-7 and DN-4: More detail rows', () => {
  const rows = (over: Partial<React.ComponentProps<typeof MoreDetailRows>> = {}) => {
    const opened: DetailRow[] = [];
    const ui = (
      <MoreDetailRows runningValue="none counted · Add" showStops showSideBySide giveMoreCount={2} showHelp onOpen={(k) => opened.push(k)} {...over} />
    );
    return { ui, opened };
  };
  const order = (): string[] =>
    screen
      .getAllByTestId(/^answer-detail-[a-zA-Z]+$/)
      .map((n) => String(n.props.testID));

  it('chevrons on exactly the two rows that leave the answer', async () => {
    await wrap(rows().ui);
    await screen.findByTestId('answer-more-detail');
    const chevrons = screen.getAllByTestId(/^answer-detail-.+-chevron$/).map((n) => String(n.props.testID));
    expect(chevrons).toEqual(['answer-detail-running-chevron', 'answer-detail-sideBySide-chevron']);
  });

  it('Full cost, with tax calls its own row, never Running costs', async () => {
    const { ui, opened } = rows();
    await wrap(ui);
    await screen.findByTestId('answer-more-detail');
    await fireEvent.press(screen.getByTestId('answer-detail-fullCost'));
    expect(opened).toEqual(['fullCost']);
  });

  it('the rows keep their order when the answer changes; rows that come and go sit last', async () => {
    await wrap(rows({ giveMoreCount: 0, showHelp: false }).ui);
    await screen.findByTestId('answer-more-detail');
    const before = order();
    await screen.rerender(rows({ giveMoreCount: 3, showHelp: true }).ui);
    const after = order();
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length)).toEqual(['answer-detail-giveMore', 'answer-detail-help']);
    expect(before.slice(0, 3)).toEqual(['answer-detail-running', 'answer-detail-fullCost', 'answer-detail-monthAfter']);
  });

  it('while the answer updates the rows take no tap', async () => {
    const { ui, opened } = rows({ updating: true });
    await wrap(ui);
    await screen.findByTestId('answer-more-detail');
    const full = screen.getByTestId('answer-detail-fullCost');
    expect(full.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(full);
    expect(opened).toEqual([]);
  });
});
