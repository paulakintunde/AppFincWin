import en from '@/i18n/locales/en';

/** True when a dotted catalogue key resolves to a string (or a plural base with _one/_other) in en. */
export function resolvesInEn(key: string): boolean {
  let node: unknown = en;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string';
}
