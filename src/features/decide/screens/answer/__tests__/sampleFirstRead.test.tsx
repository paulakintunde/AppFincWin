// Quick 261124-2bs (09-UI-SPEC 4): the sample look-around answer gets the First read treatment. Stage word in the top-bar
// sub-line, "Based on sample figures" as the basis line, no StageLine import link. Off (the default) nothing changes.
import React from 'react';
import { screen } from '@testing-library/react-native';
import type { TestInstance as ReactTestInstance } from 'test-renderer';
import type { Evaluation, MonthModel } from '@/engine/decide/v3';
import en from '@/i18n/locales/en';
import { wrap } from '@/test/stepProps';
import { AnswerFrame } from '../AnswerFrame';
import { ledgerRun, viewOf, type Run } from './fixtures';

jest.setTimeout(60000);
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/ui/haptics', () => ({ hapticTick: jest.fn(), hapticTap: jest.fn(), hapticWarn: jest.fn() }));

const noop = (): void => undefined;
const S = en.decide.screens.stage;

function textOf(n: ReactTestInstance): string {
  return n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}
const allText = (): string => textOf(screen.root as unknown as ReactTestInstance);

/** A deeper answer: four full months, records basis. */
function deeper(run: Run): Evaluation {
  const e = run.evaluation;
  const month = {
    ...e.month,
    monthsUsed: ['2026-01', '2026-02', '2026-03', '2026-04'],
    incomePicture: { treated: 'steady', fullMonths: 4 },
  } as unknown as MonthModel;
  return {
    ...e,
    month,
    result: { ...e.result, confidence: { ...e.result.confidence, basis: { kind: 'records', months: 4, upTo: '2026-11-09' } }, caveats: [] },
  } as unknown as Evaluation;
}

async function render(sample: boolean) {
  const r = ledgerRun('N02');
  return wrap(
    <AnswerFrame
      check={viewOf(r)}
      evaluation={deeper(r)}
      said={{ currency: r.inputs.currency, today: r.inputs.asOf }}
      onAction={noop}
      onOption={noop}
      onCantSee={noop}
      onImport={noop}
      sample={sample}
    />,
  );
}

describe('sample answer: First read treatment', () => {
  it('sample on a deeper evaluation: first-read stage word, sample basis line, no StageLine', async () => {
    await render(true);
    expect(allText()).toContain(S.word.first_read);
    expect(screen.getByTestId('answer-basis').props.children).toBe('Based on sample figures');
    expect(screen.queryByTestId('answer-stage-line')).toBeNull();
    expect(screen.queryByTestId('answer-stage-link')).toBeNull();
  });

  it('not sample (default): no stage word and the engine basis sentence', async () => {
    await render(false);
    expect(allText()).not.toContain(S.word.first_read);
    expect(textOf(screen.getByTestId('answer-basis'))).toContain('Based on your last 4 months of records');
  });
});
