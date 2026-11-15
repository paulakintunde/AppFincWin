// 06.1-11 (CO-D-57): the month picture and the past-month bars on the same Prepared the home answer uses.
import { useMemo } from 'react';
import { monthPicture, pastMonthBars, type MonthBar, type MonthPicture } from '@/engine/decide/v3';
import { useDecideV3 } from '@/data/queries/decideV3';

export function useMonthPicture(): { picture: MonthPicture | null; bars: MonthBar[] } {
  const { prepared } = useDecideV3();
  return useMemo(() => (prepared === null ? { picture: null, bars: [] } : { picture: monthPicture(prepared), bars: [...pastMonthBars(prepared)] }), [prepared]);
}
