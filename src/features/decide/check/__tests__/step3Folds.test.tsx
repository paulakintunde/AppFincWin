import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { SOLE_SHARE } from '@/engine/decide';
import { Step3FoldList, defaultOpenFold, type SectionKey, type Step3FoldArgs } from '../step3Folds';
import { BasisDetailRow } from '../BasisDetailRow';
import { ref } from '../../copy/types';
import { buy, stepProps, wrap } from '../steps/__tests__/helpers/stepProps';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import { TODAY } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import type { CheckInputs } from '../../snapshot/types';
import type { StepProps } from '../stepTypes';

jest.setTimeout(30000);
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('../../charts/CashPathChart', () => ({ CashPathChart: () => null }));
jest.mock('@/features/record/entry/entryHost', () => ({ openEntry: jest.fn() }));

const FITS: Partial<CheckInputs> = { advertised: 150_000, method: 'cash' };
const BREAKS: Partial<CheckInputs> = { advertised: 1_150_000, method: 'cash' };

function argsFor(step: StepProps, over: Partial<Step3FoldArgs> = {}): Step3FoldArgs {
  return {
    step,
    household: { memberCount: 1, memberNames: [], share: SOLE_SHARE },
    setbackResultIds: [],
    lineName: (id) => id,
    onOpenActivity: jest.fn(),
    onSwitchToWait: jest.fn(),
    assumptions: { meta: step.source.meta, stack: step.stack, conversions: step.source.conversions, basisItems: [] },
    ...over,
  };
}

async function folds(step: StepProps, openKey: SectionKey | null = null, over: Partial<Step3FoldArgs> = {}) {
  return wrap(<Step3FoldList {...argsFor(step, over)} openKey={openKey} onOpenChange={jest.fn()} />);
}

const fold = (title: string) => screen.queryByLabelText(new RegExp(`^${title}, `));

function investProps(over: Partial<CheckInputs> = {}): StepProps {
  return stepProps({ ...emptyCheckInputs('invest', TODAY), name: 'Fund', advertised: 20_000, method: 'lump', ...over });
}

describe('step 3 folds', () => {
  it('D-74 What breaks opens by default only with warnings', () => {
    expect(defaultOpenFold(stepProps(buy(BREAKS)).computation)).toBe('whatBreaks');
    expect(defaultOpenFold(stepProps(buy(FITS)).computation)).toBeNull();
    expect(defaultOpenFold(null)).toBeNull();
  });

  it('D-74 folds appear only when present', async () => {
    const fits = stepProps(buy(FITS));
    const view = await folds(fits);
    for (const title of ['What breaks', 'The month, line by line', 'Cash path, next 90 days', 'Where it lands', 'Assumptions in play']) expect(fold(title)).toBeTruthy();
    expect(screen.getByLabelText('What breaks, Nothing breaks')).toBeTruthy();
    for (const title of ['What would make it work', 'With the expected income', 'Who pays what']) expect(fold(title)).toBeNull();
    const breaking = stepProps(buy(BREAKS));
    expect(breaking.computation.options.length).toBeGreaterThan(0);
    await view.rerender(<Step3FoldList {...argsFor(breaking)} openKey={null} onOpenChange={jest.fn()} />);
    expect(fold('What would make it work')).toBeTruthy();
    await view.rerender(
      <Step3FoldList {...argsFor(breaking, { household: { memberCount: 2, memberNames: ['A', 'B'], share: SOLE_SHARE } })} openKey={null} onOpenChange={jest.fn()} />
    );
    expect(fold('Who pays what')).toBeNull(); // household scope is needed as well as two members
    await view.rerender(
      <Step3FoldList
        {...argsFor(stepProps(buy({ ...BREAKS, scope: 'household' })), { household: { memberCount: 2, memberNames: ['A', 'B'], share: SOLE_SHARE } })}
        openKey={null}
        onOpenChange={jest.fn()}
      />
    );
    expect(fold('Who pays what')).toBeTruthy();
  });

  it('D-74 the folds follow the R2 order', async () => {
    await folds(stepProps(buy(BREAKS)));
    const titles = ['What breaks', 'The month, line by line', 'Cash path, next 90 days', 'Where it lands', 'What would make it work', 'Assumptions in play'];
    const labels = screen.getAllByRole('button').map((b) => String(b.props.accessibilityLabel ?? ''));
    const seen = titles.map((t) => labels.findIndex((l) => l.startsWith(`${t}, `)));
    expect(seen.every((i) => i >= 0)).toBe(true);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it('D-82 investment fold 7 shows the projection or the Amount and schedule link', async () => {
    const withReturn = investProps({ investReturnText: '5' });
    expect(withReturn.computation.check?.kind).toBe('invest');
    const view = await folds(withReturn, 'ifInvested');
    expect(screen.getByLabelText(/^What it could grow to, /)).toBeTruthy();
    expect(screen.queryByText('If it went into investing instead')).toBeNull();
    expect(screen.getByText(/^About \$\d+ after \d+ months? at 5% a year\. A projection at the rate you entered, not a forecast\.$/)).toBeTruthy();
    expect(screen.getAllByLabelText('About Expected return').length).toBeGreaterThan(0); // the expectedReturn ⓘ

    const none = investProps();
    await view.rerender(<Step3FoldList {...argsFor(none)} openKey="ifInvested" onOpenChange={jest.fn()} />);
    expect(screen.getByLabelText('What it could grow to, No expected return set')).toBeTruthy();
    expect(screen.getByText('No expected return set. One can be typed on the Amount and schedule step.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Amount and schedule'));
    expect(none.goToStep).toHaveBeenCalledWith(2);
  });

  it('D-82 an out-of-range projection reads too large', async () => {
    await folds(investProps({ investReturnText: '100', advertised: 1_000_000_000_000, lumpHorizonMonths: 600 }), 'ifInvested');
    expect(screen.getAllByText('Too large to project at this rate').length).toBeGreaterThan(0);
  });

  it('D-74 purchase checks keep the investing fold with its own title', async () => {
    const p = stepProps(buy({ ...FITS, projectionRates: ['5'] }));
    expect(p.computation.investmentViews).not.toBeNull();
    await folds(p);
    expect(fold('If it went into investing instead')).toBeTruthy();
    expect(fold('What it could grow to')).toBeNull();
  });
});

describe('basis detail row', () => {
  it('D-70 the provisional basis item carries its ⓘ', async () => {
    await wrap(<BasisDetailRow items={[ref('decide.depth.currency.provisional', { count: 2, date: '2026-10-14' })]} />);
    expect(screen.getAllByLabelText(/^About /)).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText(/^About /));
    expect(screen.getByText(/dated 2026-10-14/)).toBeTruthy();
  });

  it('D-70 a basis row without a provisional item has no ⓘ', async () => {
    await wrap(<BasisDetailRow items={[ref('decide.depth.cardMin.basis')]} />);
    expect(screen.queryAllByLabelText(/^About /)).toHaveLength(0);
  });
});
