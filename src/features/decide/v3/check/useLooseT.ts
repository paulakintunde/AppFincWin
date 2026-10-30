// 05.3-24: translates a key assembled at run time (band layer words, item-type labels, the save status). The key set is
// closed and covered by the decideV3Ui copy tests, so the typed key check cannot see it.
import { useT } from '@/i18n';

export type LooseT = (key: string, params?: Record<string, string | number>) => string;

export function useLooseT(): LooseT {
  const t = useT();
  return (key, params) => String(t(key as never, params as never));
}
