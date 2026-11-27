// 10-22 (ALR-05, D-12): the log title for one alert, built from the whitelisted params only, with the same templates the push
// carried (system.push.*). A note or payee is never in the params, so it cannot appear here.
import { currencyCode, minorUnits, type Money } from '@/engine/money';
import type { AlertLogEntry } from '@/db/alerts';

type Translate = (key: string, options?: Record<string, string | number>) => string;
type FormatMoney = (money: Money) => string;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' && v !== '' ? v : fallback);

function money(p: Record<string, unknown>, field: string, format: FormatMoney): string {
  const n = p[field];
  const currency = str(p.currency, 'USD');
  return format({ amount: minorUnits(typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : 0), currency: currencyCode(currency) });
}

export function alertText(entry: Pick<AlertLogEntry, 'kind' | 'params'>, t: Translate, formatMoney: FormatMoney): string {
  const p = entry.params ?? {};
  switch (entry.kind) {
    case 'bills_due': {
      const lead = typeof p.lead_days === 'number' ? p.lead_days : 1;
      const when = lead <= 0 ? t('system.push.whenToday') : lead === 1 ? t('system.push.whenTomorrow') : t('system.push.whenInDays', { count: lead });
      return t('system.push.billsDue', { name: str(p.bill, t('system.alerts.billFallback')), amount: money(p, 'amount_minor', formatMoney), when });
    }
    case 'over_cap':
      return t('system.push.overCap', { category: str(p.category), amount: money(p, 'over_minor', formatMoney) });
    case 'goal_reached':
      return t('system.push.goalReached', { goal: str(p.goal), amount: money(p, 'amount_minor', formatMoney) });
    case 'large_txn':
      return t('system.push.largeOwn', { amount: money(p, 'amount_minor', formatMoney), category: str(p.category) });
    case 'low_balance':
      return t('system.push.lowBalance', { account: str(p.account), amount: money(p, 'amount_minor', formatMoney) });
    case 'partner_large': {
      const amount = money(p, 'amount_minor', formatMoney);
      const category = str(p.category);
      if (category === '') return t('system.push.partnerLargePrivate', { amount });
      if (p.hidden === true || str(p.who) === '') return t('system.push.partnerLargeHidden', { amount, category });
      return t('system.push.partnerLarge', { who: str(p.who), amount, category });
    }
    case 'digest':
      return t('system.push.digest', { parts: str(p.parts, t('system.alerts.deliveryDaily')) });
  }
}
