// 08.1-20 (DCU-10, CMP-F12, T-08.1-47/48): where the stage shows on the answer. First read and Full answer show only below 3 full
// months; at 3 or more no stage word shows anywhere. The first caveat skips quick_estimates and few_months while a StageLine shows,
// and About still lists them. The basis names the window used; a long pay window gets its own row.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { TestInstance as ReactTestInstance } from 'test-renderer';
import type { Basis, Caveat, Evaluation, MonthModel } from '@/engine/decide/v3';
import en from '@/i18n/locales/en';
import { wrap } from '@/test/stepProps';
import { stageReadingOf } from '../../logic/stageReading';
import { AnswerFrame } from '../AnswerFrame';
import { AboutSheet } from '../info/AboutSheet';
import { ledgerRun, viewOf, type Run } from './fixtures';

jest.setTimeout(60000);
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/ui/haptics', () => ({ hapticTick: jest.fn(), hapticTap: jest.fn(), hapticWarn: jest.fn() }));

const noop = (): void => undefined;
const S = en.decide.screens.stage;
const UP_TO = '2026-11-09';

interface Over {
  basis: Basis;
  caveats?: Caveat[];
  months?: number;
  fullMonths?: number;
  treated?: 'steady' | 'variable';
}

function evalOf(run: Run, o: Over): Evaluation {
  const e = run.evaluation;
  const months = o.months ?? 0;
  const month = {
    ...e.month,
    monthsUsed: Array.from({ length: months }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`),
    incomePicture: { treated: o.treated ?? 'steady', fullMonths: o.fullMonths ?? months },
  } as unknown as MonthModel;
  return {
    ...e,
    month,
    result: { ...e.result, confidence: { ...e.result.confidence, basis: o.basis }, caveats: o.caveats ?? [] },
  } as unknown as Evaluation;
}

const first = (): Over => ({ basis: { kind: 'quick_estimates' }, months: 0 });
const two = (): Over => ({ basis: { kind: 'partial', used: 2, lookedFor: 3, upTo: UP_TO }, months: 2 });
const four = (): Over => ({ basis: { kind: 'records', months: 4, upTo: UP_TO }, months: 4 });

const caveat = (code: string): Caveat => ({ code, values: code === 'few_months' ? { months: 2, lookedFor: 3 } : {} }) as unknown as Caveat;

function textOf(n: ReactTestInstance): string {
  return n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}
const allText = (): string => textOf(screen.root as unknown as ReactTestInstance);

async function render(o: Over, onImport: () => void = noop) {
  const r = ledgerRun('N02');
  return wrap(
    <AnswerFrame check={viewOf(r)} evaluation={evalOf(r, o)} said={{ currency: r.inputs.currency, today: r.inputs.asOf }} onAction={noop} onOption={noop} onCantSee={noop} onImport={onImport} />
  );
}

describe('08.1-20 StageLine under the basis sentence', () => {
  it('first read: the sentence, the import link, and the typed-figures basis', async () => {
    await render(first());
    expect(screen.getByText(S.line.first_read)).toBeTruthy();
    expect(screen.getByText(S.line.importLink)).toBeTruthy();
    expect(screen.getByTestId('answer-basis').props.children).toBe('Based on the figures you typed, not your records.');
  });

  it('full answer with 2 months names the window and links to add earlier months', async () => {
    await render(two());
    expect(screen.getByText('A full answer from 2 of 3 months. Three months add pay swings and what could move this answer.')).toBeTruthy();
    expect(screen.getByText(S.line.addLink)).toBeTruthy();
    expect(textOf(screen.getByTestId('answer-basis'))).toContain('Based on your last 2 months of records');
  });

  it('deeper: no StageLine and no stage word anywhere on the answer', async () => {
    await render(four());
    expect(screen.queryByTestId('answer-stage-line')).toBeNull();
    expect(allText()).not.toContain('First read');
    expect(allText()).not.toContain('Full answer');
    expect(textOf(screen.getByTestId('answer-basis'))).toContain('Based on your last 4 months of records');
  });

  it('pressing the link calls onImport', async () => {
    const onImport = jest.fn();
    await render(first(), onImport);
    fireEvent.press(screen.getByTestId('answer-stage-link'));
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});

describe('08.1-20 the pay-window row', () => {
  it('a variable earner judged over 9 months gets the row; a steady earner gets none', async () => {
    await render({ ...four(), months: 9, basis: { kind: 'records', months: 9, upTo: UP_TO }, treated: 'variable' });
    expect(screen.getByTestId('answer-pay-window')).toBeTruthy();
    expect(allText()).toContain('Pay is judged over your last 9 months.');
  });

  it('a steady earner gets none', async () => {
    await render({ ...four(), months: 9, basis: { kind: 'records', months: 9, upTo: UP_TO } });
    expect(screen.queryByTestId('answer-pay-window')).toBeNull();
  });
});

describe('08.1-20 caveat order (CMP-F12)', () => {
  it('first read: quick_estimates is not the caveat under the answer; no_debts_recorded is', async () => {
    await render({ ...first(), caveats: [caveat('quick_estimates'), caveat('no_debts_recorded')] });
    const shown = textOf(screen.getByTestId('answer-caveat'));
    expect(shown).toBe(en.decide.v3.caveat.no_debts_recorded);
  });

  it('full with only few_months: no caveat under the answer', async () => {
    await render({ ...two(), caveats: [caveat('few_months')] });
    expect(screen.queryByTestId('answer-caveat')).toBeNull();
  });

  it('reading order is basis, pay window, stage line, caveat, caveat line', async () => {
    await render({ basis: { kind: 'partial', used: 2, lookedFor: 3, upTo: UP_TO }, months: 2, caveats: [caveat('no_debts_recorded')] });
    const ids = screen
      .getAllByTestId(/^answer-(basis|pay-window|stage-line|caveat|caveat-line)$/)
      .map((n) => String(n.props.testID))
      .filter((id, i, all) => all.indexOf(id) === i);
    expect(ids).toEqual(['answer-basis', 'answer-stage-line', 'answer-caveat', 'answer-caveat-line']);
  });
});

describe('08.1-20 About this answer', () => {
  const sheet = (stageOver: Over, caveats: Caveat[] = []) => {
    const r = ledgerRun('N02');
    const e = evalOf(r, { ...stageOver, caveats });
    return wrap(<AboutSheet result={e.result} stage={stageReadingOf(e)} country={null} said={{ currency: r.inputs.currency, today: r.inputs.asOf }} onClose={noop} />);
  };

  it('first read lists the stage row, the all-three held-back row and the 12 months line; both caveats stay', async () => {
    await sheet(first(), [caveat('quick_estimates'), caveat('few_months')]);
    expect(screen.getByText(S.about.stageRow.first_read)).toBeTruthy();
    expect(screen.getByText(S.about.heldBack.all)).toBeTruthy();
    expect(screen.getByText(S.about.howFar)).toBeTruthy();
    expect(screen.getAllByTestId('about-caveat')).toHaveLength(2);
  });

  it('deeper with 2 full pay months lists only the two pay parts and no stage row', async () => {
    await sheet({ ...four(), fullMonths: 2 });
    expect(screen.queryByTestId('about-stage')).toBeNull();
    expect(screen.getByText(S.about.heldBack.pay)).toBeTruthy();
    expect(screen.getByText(S.about.howFar)).toBeTruthy();
  });

  it('only what could move this answer: the rare-mix row', async () => {
    await sheet({ basis: { kind: 'partial', used: 2, lookedFor: 3, upTo: UP_TO }, months: 2, fullMonths: 3 });
    expect(screen.getByText(S.about.heldBack.answerRange)).toBeTruthy();
  });

  it('every part on: no stage or held-back row, the 12 months line stays', async () => {
    await sheet(four());
    expect(screen.queryByTestId('about-stage')).toBeNull();
    expect(screen.queryByTestId('about-held-back')).toBeNull();
    expect(screen.getByText(S.about.howFar)).toBeTruthy();
  });
});
