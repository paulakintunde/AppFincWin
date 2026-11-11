// 06.1-14 (D-18, APP-10): the values a verdict row's title and body ask for ({{month}}, {{left}}, {{below}} ...). Only figures the engine
// states elsewhere under the same name and meaning are filled: the after-buy block (month, left), the overdraft facts, the borrowing
// facts and the safety-net facts. A placeholder with no such source is left out of the map, and the card then leaves that sentence
// out rather than print a brace or guess a figure. Pure: no React, no i18next.
import type { Fact, Result } from '@/engine/decide/v3';
import type { SayDeps } from '../logic/sayResult';

type Values = Readonly<Record<string, unknown>>;

const firstFact = (r: Result, ...codes: string[]): Values | undefined => {
  for (const code of codes) {
    const hit = r.facts.find((f: Fact) => f.code === code);
    if (hit !== undefined) return hit.values;
  }
  return undefined;
};

/** 'YYYY-MM' or 'YYYY-MM-DD' as the screen writes it. */
const dateText = (deps: SayDeps, v: unknown): string | undefined => (typeof v === 'string' ? deps.date(v) : undefined);

/** The after-buy figure the answer leads with (a plan leads with the usual month, a one-off with this month). */
export function leadFigure(r: Result): number {
  const a = r.afterBuy;
  return a.lead === 'usualMonth' && a.usualMonth !== null ? a.usualMonth : a.month;
}

export function verdictValues(r: Result, deps: SayDeps): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  const set = (key: string, value: string | undefined): void => {
    if (value !== undefined && value !== '') out[key] = value;
  };
  const money = (v: unknown): string | undefined => (typeof v === 'number' ? deps.money(v, deps.currency) : undefined);
  const plain = (v: unknown): string | undefined => (typeof v === 'number' || typeof v === 'string' ? String(v) : undefined);

  set('month', dateText(deps, r.afterBuy.monthName));
  set('left', money(leadFigure(r)));
  set('zero', deps.money(0, deps.currency));

  const od = firstFact(r, 'overdraft_use', 'overdraft_not_cleared');
  if (od !== undefined) {
    set('account', typeof od['accountId'] === 'string' ? deps.names.account(od['accountId']) : undefined);
    set('below', money(od['below']));
    set('days', plain(od['days']));
    set('date', dateText(deps, od['date']));
  }
  const cost = firstFact(r, 'overdraft_use', 'overdraft_cost_90d');
  if (cost !== undefined) {
    set('rate', plain(cost['rate']));
    set('cost', money(cost['cost']));
  }

  const borrow = firstFact(r, 'interest_is_a_cost');
  if (borrow !== undefined) {
    set('interest', money(borrow['interest']));
    set('total', money(borrow['total']));
  }

  // fitsUsesNet: {{left}} is what stays in the safety net, not the month's figure.
  const net = r.code === 'fits_uses_net' || r.code === 'emergency_use' ? firstFact(r, 'net_used') : undefined;
  if (net !== undefined) {
    set('used', money(net['used']));
    const stays = firstFact(r, 'net_left');
    if (stays !== undefined) set('left', money(stays['left']));
    const refill = firstFact(r, 'net_refill');
    if (refill !== undefined) set('months', plain(refill['months']));
  }
  const extra = r.variant === 'extra_savings' ? firstFact(r, 'extra_savings_used') : undefined;
  if (extra !== undefined) {
    set('used', money(extra['used']));
    set('above', money(extra['above']));
  }
  return out;
}

/** True when every {{placeholder}} in the template has a value, so the sentence can be shown whole. */
export function isFilled(template: string, values: Readonly<Record<string, string>>): boolean {
  return [...template.matchAll(/\{\{(\w+)\}\}/g)].every((m) => values[m[1] as string] !== undefined);
}
