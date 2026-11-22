// 09-21: option tables hold copy keys as data, and the typed `t` accepts only literal keys. Every key used by the onboarding
// screens lives in src/i18n/locales/onboarding (signed copy, 09-12).
import type { ParseKeys } from 'i18next';
import { useT } from '@/i18n';

export type Copy = (key: string, options?: Record<string, unknown>) => string;

export function useCopy(): Copy {
  const t = useT();
  return (key, options) => String((t as unknown as (k: ParseKeys, o?: Record<string, unknown>) => unknown)(key as ParseKeys, options));
}
