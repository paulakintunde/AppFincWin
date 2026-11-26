// 10.1-24 (SCN-02, D-22): the device region's own date order, so a receipt date like 03/04/26 is read the way the user writes
// dates. Read from Intl for the resolved locale tag (useDeviceLocale), never hardcoded; falls back to month first.
import type { DateOrder } from '@/engine/receipt';

export function dateOrderFor(localeTag: string): DateOrder {
  try {
    const parts = new Intl.DateTimeFormat(localeTag, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
      new Date(Date.UTC(2001, 10, 22, 12)),
    );
    const order = parts.filter((p) => p.type === 'year' || p.type === 'month' || p.type === 'day').map((p) => p.type[0]);
    const key = order.join('');
    if (key === 'dmy') return 'DMY';
    if (key === 'ymd') return 'YMD';
    return 'MDY';
  } catch {
    return 'MDY';
  }
}
