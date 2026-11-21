// 08.1-14 (D-05..D-08, DS-4, UI-SPEC section 3): the answer lines 08.1 adds or changes.
// - D-08 / DS-4: the card's date line says when it would be bought ("If you buy it today.") and never "Bought today." on an unbought
//   check; once recorded as bought, "Bought on {date}." shows once (the outcome line) and the card drops its "If you buy it" line.
// - D-07: below_zero_without is the BelowZeroLine directly under the verdict card (tight tint, stateTight glyph, "Warning"), before the
//   facts, and FactLines does not say it again. {{zero}} follows the show-cents setting.
// - D-05: the Not yet ready date says what it means (above {{zero}} for the next 90 days).
// - D-06: "Not within a year at your current pace." takes the ready date's place; the cheaper one and Save for it lead the actions.
import React from 'react';
import { screen } from '@testing-library/react-native';
import { judgeCheck, prepare, type Fact, type Result } from '@/engine/decide/v3';
import { toEngineInputs } from '@/engine/decide/v3/__tests__/rightAnswers/fixture';
import { loadCases } from '@/engine/decide/v3/__tests__/rightAnswers/loader';
import { wrap } from '@/test/stepProps';
import { stateColors } from '@/theme/tokens';
import en from '@/i18n/locales/en';
import { AsCheckedAnswer } from '../../past/AsCheckedAnswer';
import { AnswerFrame, type AnswerFrameProps } from '../AnswerFrame';
import { ledgerRun, viewOf, type Run } from './fixtures';

jest.setTimeout(60000);

jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));

const opts = { includeHiddenElements: true };
const noop = (): void => undefined;

const belowZero = (date = '2026-12-14'): Fact => ({ code: 'below_zero_without', values: { date, zero: 0 } }) as unknown as Fact;

/** The same run with the result changed (facts first, as the engine puts D-06 / D-07 first). */
function withResult(r: Run, change: (res: Result) => Partial<Result>): Run {
  const result: Result = { ...r.evaluation.result, ...change(r.evaluation.result) };
  return { ...r, evaluation: { ...r.evaluation, result } };
}

const withBelowZero = (r: Run): Run => withResult(r, (res) => ({ facts: [belowZero(), ...res.facts] }));

async function frame(r: Run, over: Partial<AnswerFrameProps['check']> = {}, showCents = true, onOption = noop) {
  return wrap(
    <AnswerFrame
      check={{ ...viewOf(r), ...over }}
      evaluation={r.evaluation}
      said={{ currency: r.inputs.currency, today: r.inputs.asOf, showCents }}
      onAction={noop}
      onOption={onOption}
      onCantSee={noop}
      onImport={noop}
    />,
  );
}

/** Every testID in the rendered tree, in document (reading) order. */
function idsInOrder(): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const n = node as { props?: { testID?: unknown }; children?: unknown };
    if (typeof n.props?.testID === 'string') out.push(n.props.testID);
    walk(n.children ?? null);
  };
  walk(screen.toJSON());
  return out;
}

/** Every visible string under a node, in order. */
function textsUnder(testID: string): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    walk((node as { children?: unknown }).children ?? null);
  };
  const json = screen.toJSON();
  const find = (node: unknown): unknown => {
    if (node === null || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const c of node) {
        const hit = find(c);
        if (hit !== null) return hit;
      }
      return null;
    }
    const n = node as { props?: { testID?: unknown }; children?: unknown };
    if (n.props?.testID === testID) return n;
    return find(n.children ?? null);
  };
  walk(find(json));
  return out;
}

describe('D-08 / DS-4: the date line on the verdict card', () => {
  it('an unbought check reads "If you buy it today." and never "Bought today."', async () => {
    await frame(ledgerRun('N02'));
    expect(String(screen.getByTestId('answer-verdict').props.accessibilityLabel)).not.toMatch(/Bought today/);
    expect(screen.getByText('If you buy it today.')).toBeTruthy();
    expect(screen.queryByText(/Bought today/, opts)).toBeNull();
  });

  it('after Record as bought: "Bought on {date}." once, and the card drops its "If you buy it" line', async () => {
    await frame(ledgerRun('N02'), { outcome: 'Bought on Nov 12.' });
    expect(screen.getAllByText('Bought on Nov 12.')).toHaveLength(1);
    expect(screen.queryByText(/If you buy it/, opts)).toBeNull();
    expect(screen.queryByText(/Bought today/, opts)).toBeNull();
  });

  it('no locale string says "Bought today."', () => {
    expect(JSON.stringify(en)).not.toMatch(/Bought today/);
  });
});

describe('D-07: the BelowZeroLine', () => {
  it('sits directly under the verdict card and before the first fact, with the glyph, "Warning" and the sentence', async () => {
    await frame(withBelowZero(ledgerRun('N02')));
    const line = screen.getByTestId('answer-below-zero', opts);
    expect(line).toBeTruthy();
    expect(screen.getByTestId('glyph-stateTight', opts)).toBeTruthy();
    const words = textsUnder('answer-below-zero');
    expect(words[0]).toBe('Warning');
    expect(words[1]).toMatch(/^Your account goes below \$0\.00 on .+ even without this\.$/);
    const ids = idsInOrder();
    const verdict = ids.indexOf('answer-verdict');
    const below = ids.indexOf('answer-below-zero');
    const firstFact = ids.findIndex((id) => id.startsWith('answer-fact-'));
    expect(verdict).toBeGreaterThanOrEqual(0);
    expect(below).toBeGreaterThan(verdict);
    expect(firstFact).toBeGreaterThan(below);
  });

  it('is spoken "Warning. " then the sentence, and is said once (FactLines skips it)', async () => {
    await frame(withBelowZero(ledgerRun('N02')));
    const label = String(screen.getByTestId('answer-below-zero', opts).props.accessibilityLabel);
    expect(label).toMatch(/^Warning\. Your account goes below \$0\.00 on .+ even without this\.$/);
    expect(screen.getAllByText(/even without this\./, opts)).toHaveLength(1);
  });

  it('uses the tight tint: #8A5A1B on #FBEFD6', async () => {
    await frame(withBelowZero(ledgerRun('N02')));
    const style = [screen.getByTestId('answer-below-zero', opts).props.style].flat(5) as Record<string, unknown>[];
    expect(style.some((s) => s?.['backgroundColor'] === stateColors.tight.tint)).toBe(true);
    expect(stateColors.tight).toMatchObject({ color: '#8A5A1B', tint: '#FBEFD6' });
  });

  it('with cents off the zero reads "$0"', async () => {
    await frame(withBelowZero(ledgerRun('N02')), {}, false);
    expect(textsUnder('answer-below-zero')[1]).toMatch(/^Your account goes below \$0 on /);
  });

  it('a short verdict stays first, and the verdict word does not change', async () => {
    const r = ledgerRun('N09'); // monthly_short
    await frame(r);
    const plainBadge = String(screen.getByTestId('answer-verdict-badge').props.accessibilityLabel);
    screen.unmount();
    await frame(withBelowZero(r));
    expect(String(screen.getByTestId('answer-verdict-badge').props.accessibilityLabel)).toBe(plainBadge);
    const ids = idsInOrder();
    expect(ids.indexOf('answer-verdict')).toBeLessThan(ids.indexOf('answer-below-zero'));
  });

  it('no fact = no line', async () => {
    await frame(ledgerRun('N02'));
    expect(screen.queryByTestId('answer-below-zero', opts)).toBeNull();
  });

  it('the saved "as checked" view shows the line too, not as a fact', async () => {
    const r = withBelowZero(ledgerRun('N02'));
    await wrap(
      <AsCheckedAnswer stored={r.evaluation.result as unknown as Record<string, unknown>} dateText="Nov 1" currency={r.inputs.currency} today={r.inputs.asOf} once={false} onCantSee={noop} />,
    );
    expect(screen.getByTestId('answer-below-zero', opts)).toBeTruthy();
    expect(screen.getAllByText(/even without this\./, opts)).toHaveLength(1);
  });

  it('end to end: the real engine on SN-31 shows the line', async () => {
    const found = loadCases().find((c) => c.id === 'SN-31');
    if (found === undefined) throw new RangeError('no SN-31');
    const { inputs, check } = toEngineInputs(found.fixture);
    const run: Run = { inputs, check, evaluation: judgeCheck(prepare(inputs), check) };
    expect(run.evaluation.result.facts.some((f) => f.code === 'below_zero_without')).toBe(true);
    await frame(run);
    expect(screen.getByTestId('answer-below-zero', opts)).toBeTruthy();
  });
});

describe('D-05: the ready-by sentence on a Not yet answer', () => {
  it('names the ready date and what it means (above zero for the next 90 days)', async () => {
    const r = ledgerRun('N05'); // not_yet, not_covered, ready later
    await frame(r);
    const label = String(screen.getByTestId('answer-verdict').props.accessibilityLabel);
    expect(label).toMatch(/Ready by [A-Z][a-z]+ \d{4}\. Based on your records, buying then keeps your account above \$0\.00 for the next 90 days\./);
  });

  it('the en text keeps {{zero}}, never a literal $0', () => {
    const body = en.decide.v3.verdict.notYetNotCovered.body;
    expect(body).toContain('{{zero}}');
    expect(body).not.toMatch(/\$0/);
  });
});

describe('D-06: no date within a year', () => {
  const beyond = (r: Run): Run => withResult(r, (res) => ({ readyBy: null, facts: [{ code: 'not_within_year', values: {} } as unknown as Fact, ...res.facts] }));

  it('"Not within a year at your current pace." replaces the ready-by line', async () => {
    await frame(beyond(ledgerRun('N05')));
    expect(screen.getByText('Not within a year at your current pace.')).toBeTruthy();
    expect(String(screen.getByTestId('answer-verdict').props.accessibilityLabel)).not.toMatch(/Ready by/);
  });

  it('the cheaper one, then Save for it, lead the action bar with equal weight', async () => {
    const onOption = jest.fn();
    await frame(beyond(ledgerRun('N05')), {}, true, onOption);
    const words = textsUnder('answer-actions');
    expect(words.slice(0, 2)).toEqual(['Cheaper one', 'Save for it']);
    expect(words).toContain('I bought it');
    const cheaper = screen.getByTestId('answer-action-cheaper');
    const save = screen.getByTestId('answer-action-saveFor');
    expect(cheaper.props.accessibilityRole).toBe('button');
    expect(save.props.accessibilityRole).toBe('button');
    // equal visual weight: the same pill look
    expect(JSON.stringify([cheaper.props.style].flat(5))).toBe(JSON.stringify([save.props.style].flat(5)));
    // the cheaper one is not offered twice
    expect(screen.queryByTestId('answer-option-cheaper')).toBeNull();
  });

  it('without a cheaper price, Save for it leads', async () => {
    await frame(beyond(ledgerRun('N05')), { options: ['later'] });
    expect(textsUnder('answer-actions')[0]).toBe('Save for it');
    expect(screen.queryByTestId('answer-action-cheaper')).toBeNull();
  });

  it('a normal answer keeps the bar as it was: I bought it, then Save for it', async () => {
    await frame(ledgerRun('N02'));
    expect(textsUnder('answer-actions').slice(0, 2)).toEqual(['I bought it', 'Save for it']);
  });
});

describe('08.1-14 wording changes', () => {
  it('the later-dip facts read "on {{date}}" (FOLLOWUPS 24|14)', () => {
    expect(en.decide.v3.fact.below_zero_later_without).toBe('Later on, your account goes below {{zero}} on {{date}} even without this.');
    expect(en.decide.v3.fact.below_zero_later_with).toBe('With this, your account goes below {{zero}} on {{date}}.');
    expect(en.decide.v3.fact.below_zero_without).toBe('Your account goes below {{zero}} on {{date}} even without this.');
  });
});
