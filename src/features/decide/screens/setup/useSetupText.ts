// 06.1-17: turns a SetupItem's status (a key and raw values) into the words on the checklist row. Money, dates and the ordinal
// day come from the same formatters the rest of the app uses; the engine-free rules never see English.
import { useCallback } from 'react';
import { useT } from '@/i18n';
import { formatOrdinal } from '@/i18n/ordinal';
import { money } from '@/engine/money';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import type { LocalDate } from '@/engine/decide/v3';
import { itemSentence } from '../answer/ReadinessFixList';
import { monthNameOf } from '../home/YourMonthCard';
import type { SetupItem, SetupItemId } from '../logic/setupProgress';

export interface SetupText {
  itemName(id: SetupItemId): string;
  status(item: SetupItem): string;
}

export function useSetupText(currency: string): SetupText {
  const t = useT();
  const fmt = useMoneyFormatter(false);
  const ordinal = useCallback(
    (day: number) => formatOrdinal(day, fmt.locale, t as (key: string, options?: Record<string, unknown>) => string),
    [fmt.locale, t],
  );
  const amount = useCallback((minor: number) => fmt.formatMoney(money(minor, currency)), [fmt, currency]);

  const itemName = useCallback((id: SetupItemId) => t(`decide.screens.setup.items.${id}`), [t]);
  const status = useCallback(
    (item: SetupItem): string => {
      const v = item.status.values;
      const base = 'decide.screens.setup.status.';
      switch (item.status.key) {
        case 'payDone':
          return t(`${base}payDone`, { amount: amount(Number(v.amountMinor)), ordinal: ordinal(Number(v.day)) });
        case 'billsDone':
          return t(`${base}billsDone`, { count: Number(v.count), monthly: amount(Number(v.monthlyMinor)) });
        case 'debtsOpen':
          return t(`${base}debtsOpen`, { count: Number(v.count), debt: String(v.debt) });
        case 'debtsDone':
          return t(`${base}debtsDone`, { debt: String(v.debt), ordinal: ordinal(Number(v.day)) });
        case 'netDone':
          return t(`${base}netDone`, { amount: amount(Number(v.amountMinor)) });
        case 'rulesDone':
          return t(`${base}rulesDone`, { count: Number(v.count) });
        case 'recordsOpenItems': {
          // 06.1-45 (A-SU-2): the count, then the first open item in the same sentence the answer screen uses.
          const head = t(`${base}recordsOpenItems`, { count: Number(v.count) });
          const first = item.status.first ?? null;
          if (first === null) return head;
          const sentence = itemSentence(first, String(v.asOf) as LocalDate, {
            money: amount,
            date: (d) => fmt.formatDate(d, 'medium'),
            monthName: (ym) => monthNameOf(ym, fmt.locale),
          }, t as unknown as (key: string, params?: Record<string, string | number>) => string);
          return `${head}\n${sentence}`;
        }
        case 'billsOpen':
          return t(`${base}billsOpen`, { count: Number(v.count) });
        case 'billsNone':
          return t('decide.screens.setup.status.billsNone');
        case 'rulesOpen':
          return t('decide.screens.setup.status.rulesOpen');
        case 'recordsOpen':
        case 'recordsDone':
          return t(`${base}${item.status.key}`, { date: fmt.formatDate(String(v.date), 'medium') });
        case 'debtsNone':
          return t('decide.screens.setup.status.debtsNone');
        case 'netNotSet':
          return t('decide.screens.setup.status.netNotSet');
        case 'rulesNone':
          return t('decide.screens.setup.status.rulesNone');
        default:
          return t('decide.screens.setup.status.open');
      }
    },
    [t, amount, ordinal, fmt],
  );
  return { itemName, status };
}
