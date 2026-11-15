import en from '@/i18n/locales/en';
import * as maps from '../codeMaps';

function has(path: string): boolean {
  let node: unknown = en;
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object') return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string';
}

describe('codeMaps', () => {
  it('every method code maps to a catalogue key that exists', () => {
    const keys: string[] = [];
    for (const value of Object.values(maps)) keys.push(...Object.values(value as Record<string, string>));
    expect(keys).toHaveLength(6);
    expect(keys.filter((k) => !has(k))).toEqual([]);
  });
});
