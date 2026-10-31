// 05.3-71: which payment-plan fields are still needed, mirroring the engine's missing rules (judge/purchase.ts), plus the
// default "later" first-payment date. Pure: no React, no I/O. Dates are 'YYYY-MM-DD' strings, computed in UTC arithmetic.
import type { PayV2 } from '@/engine/decide/v3';

export type PlanNeed = 'plan_rate_missing' | 'first_payment_not_chosen' | 'pause_interest_not_answered' | 'first_payment_passed';

export function planNeeds(pay: PayV2, today: string): readonly PlanNeed[] {
  if (pay.mode !== 'plan') return [];
  const out: PlanNeed[] = [];
  if (pay.apr === null && pay.quotedPayment === null) out.push('plan_rate_missing');
  const fp = pay.firstPayment;
  if (fp === null) out.push('first_payment_not_chosen');
  else if (fp.kind === 'deferred') {
    if (fp.interestDuringPause === null) out.push('pause_interest_not_answered');
    if (fp.firstDate < today) out.push('first_payment_passed');
  }
  return out;
}

const pad = (n: number): string => String(n).padStart(2, '0');

function parts(iso: string): { y: number; m: number; d: number } {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map((p) => parseInt(p, 10));
  return { y, m, d };
}

/** The next day. */
export function tomorrowOf(today: string): string {
  const { y, m, d } = parts(today);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The same day next month, clamped to that month's last day. */
export function laterDateDefault(today: string): string {
  const { y, m, d } = parts(today);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // m is 1-based, so month index m is next month
  const t = new Date(Date.UTC(y, m, Math.min(d, last)));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
