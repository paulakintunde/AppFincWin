import en from '@/i18n/locales/en';

function stringAt(key: string): boolean {
  let node: unknown = en;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string';
}

/** True when a dotted catalogue key resolves to a string (or a plural base with _one/_other) in en. */
export function resolvesInEn(key: string): boolean {
  return stringAt(key) || (stringAt(`${key}_one`) && stringAt(`${key}_other`));
}
