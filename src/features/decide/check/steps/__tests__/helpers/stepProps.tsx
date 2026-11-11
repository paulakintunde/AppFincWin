/** 05-14 test helper: StepProps over a real computeCheck result (fixtures from 05-06/07), with plain fake formatters. */
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { computeCheck } from '../../../../snapshot/computeCheck';
import { emptyCheckInputs } from '../../../../snapshot/checkInputs';
import type { CheckInputs, SnapshotResult } from '../../../../snapshot/types';
import { EMPTY_STACK } from '../../../../snapshot/types';
import { TODAY, loggedSource } from '../../../../snapshot/__tests__/helpers/snapshotFixtures';
import type { StepProps } from '../../../stepTypes';

// 06.1-07 shim: removed by 06.1-36 (wrap moved to src/test/stepProps by 06.1-40)
export { wrap } from '@/test/stepProps';
export { TODAY };

export const whole: MoneyFormatter = {
  formatMoney: (m) => `$${Math.round(Number(m.amount) / 100)}`,
  formatMoneyA11y: (m) => `${Math.round(Number(m.amount) / 100)} dollars`,
  formatDate: (d) => `on ${d}`,
  locale: 'en-US',
};
export const exact: MoneyFormatter = {
  formatMoney: (m) => `$${(Number(m.amount) / 100).toFixed(2)}`,
  formatMoneyA11y: (m) => `${(Number(m.amount) / 100).toFixed(2)} dollars`,
  formatDate: (d) => `on ${d}`,
  locale: 'en-US',
};

export function buy(over: Partial<CheckInputs> = {}): CheckInputs {
  return { ...emptyCheckInputs('buy', TODAY), name: 'Laptop', advertised: 150_000, method: 'cash', ...over };
}

export function stepProps(inputs: CheckInputs, over: Partial<StepProps> = {}, source: SnapshotResult = loggedSource()): StepProps {
  return {
    inputs,
    update: jest.fn(),
    computation: computeCheck(source, inputs),
    source,
    goToStep: jest.fn(),
    whole,
    exact,
    today: TODAY,
    readOnly: false,
    stack: EMPTY_STACK,
    ...over,
  };
}
