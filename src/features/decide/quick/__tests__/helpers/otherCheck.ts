/** 05-13 test helper: one other open check as the engine's StackedCheckInput (a cash buy at the given price). */
import type { StackedCheckInput } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { emptyCheckInputs, toEngineCheck } from '../../../snapshot/checkInputs';
import { CARD_CHOICE, TODAY, USD } from '../../../snapshot/__tests__/helpers/snapshotFixtures';

export function toEngineOther(price: number): StackedCheckInput {
  const inputs = { ...emptyCheckInputs('buy', TODAY), name: 'Laptop', advertised: price, method: 'cash' as const };
  const r = toEngineCheck(inputs, { currency: USD, cards: [CARD_CHOICE], dealerCap: minorUnits(5_000_000) });
  if (!r.ok) throw new Error('other check');
  return { check: r.check, purchaseRule: null };
}
