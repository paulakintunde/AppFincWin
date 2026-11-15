/**
 * 06.1-57 (A-ST-4, T-06.1-57-01): the Price step's preset one-off row for dealer and documentation fees. It starts off and carries
 * no amount: switching it on opens an empty amount field, and only a typed amount counts. The row's state lives in the check's free
 * answers ('L0.' prefix, kept by the stored-check reader); what it adds is part of oneOffFees, changed by the difference only, so the
 * "+ Add a one-off cost" lines already in oneOffFees stay as they are.
 */
import { minorUnits } from '@/engine/money';
import type { CheckV2 } from '@/engine/decide/v3';

export const KEY_DEALER_FEES = 'L0.dealer_fees';

export interface PresetFee {
  on: boolean;
  /** Minor units as typed; null until typed. */
  amount: number | null;
}

export function dealerFeesOf(check: CheckV2): PresetFee {
  const raw = check.layerAnswers[KEY_DEALER_FEES];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { on: false, amount: null };
  const r = raw as Record<string, unknown>;
  const amount = typeof r.amount === 'number' && Number.isFinite(r.amount) && r.amount >= 0 ? Math.round(r.amount) : null;
  return { on: r.on === true, amount };
}

/** What the row adds to the up-front amount: its typed amount while it is on, else nothing. */
export function presetAdds(fee: PresetFee): number {
  return fee.on && fee.amount !== null ? fee.amount : 0;
}

export function withDealerFees(check: CheckV2, next: PresetFee): CheckV2 {
  const delta = presetAdds(next) - presetAdds(dealerFeesOf(check));
  return {
    ...check,
    oneOffFees: minorUnits(Math.max(0, Number(check.oneOffFees) + delta)),
    layerAnswers: { ...check.layerAnswers, [KEY_DEALER_FEES]: { on: next.on, amount: next.amount } },
  };
}
