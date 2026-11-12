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
  it('every engine code maps to a catalogue key that exists', () => {
    const keys: string[] = [maps.UNEXPLAINED];
    for (const [name, value] of Object.entries(maps)) {
      if (name === 'UNEXPLAINED' || name === 'WARNING_TONE') continue;
      keys.push(...Object.values(value as Record<string, string>));
    }
    expect(keys.length).toBeGreaterThan(60);
    expect(keys.filter((k) => !has(k))).toEqual([]);
  });

  it('marks the month and owe warnings hard and the rest soft', () => {
    expect(maps.WARNING_TONE.month).toBe('hard');
    expect(maps.WARNING_TONE.owe).toBe('hard');
    expect(Object.values(maps.WARNING_TONE).filter((t) => t === 'soft')).toHaveLength(5);
  });
});
