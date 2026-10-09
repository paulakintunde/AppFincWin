import type { TransactionRow } from '@/db/rows';
import type { SeriesOffer } from '@/engine/recurring';

export function offer(n: number, previousMonth = '2026-09'): SeriesOffer {
  return {
    key: `name${n}|GBP|-1`,
    previousMonth,
    latestRowId: `r${n}`,
    suggestion: {
      key: `name${n}|GBP|-1`,
      name: `Name${n}`,
      amount: -1000 * n,
      currency: 'GBP',
      freq: 'monthly',
      anchorDate: '2026-10-05',
      rowIds: [`r${n}`],
    },
  };
}

export function rowsFor(...ns: number[]): Map<string, TransactionRow> {
  return new Map(
    ns.map((n) => [
      `r${n}`,
      { id: `r${n}`, local_date: '2026-10-05', category_id: null, account_id: 'a1', is_automatic: false } as unknown as TransactionRow,
    ])
  );
}
