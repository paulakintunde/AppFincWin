import { evaluate } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';
import { loadAllVariableCases } from '../../../../../engine/decide/v3/__tests__/golden/variableIncomeLoader';
import { insteadModel } from '../insteadModel';

jest.setTimeout(60000);

// The engine leaves out a deposit figure past the safe range (never shown wrong); the model then carries null views.
jest.mock('@/engine/decide/v3', () => {
  const actual = jest.requireActual('@/engine/decide/v3');
  return {
    ...actual,
    insteadFutures: (input: unknown) => {
      const f = actual.insteadFutures(input);
      return { ...f, deposit: { ...f.deposit, views: [] } };
    },
  };
});

describe('insteadModel with no deposit views', () => {
  it('has a zero figure of 0 and null views, with or without a typed rate', () => {
    const cases = loadAllVariableCases();
    const ev = cases.map((c) => evaluate(c.inputs, c.check)).find((e) => e.purchase !== null);
    if (ev === undefined) throw new Error('no purchase in the goldens');
    for (const userRate of [null, percent('4.25')]) {
      const m = insteadModel({ ev, userRate, years: 5, everydayCut: minorUnits(0) });
      const d = m!.cards.find((x) => x.id === 'deposit')!;
      expect(d).toMatchObject({ zeroFigure: 0, zeroView: null, view: null });
    }
  });
});
