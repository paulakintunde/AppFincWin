import { readFileSync } from 'fs';
import { join } from 'path';
import { percent } from '../../payoff/types';
import * as constants from '../constants';
import * as lineDefaults from '../lineDefaults';

function importsOf(file: string): string[] {
  const src = readFileSync(join(__dirname, '..', file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);
}

describe('D-16 leaves import no old engine', () => {
  it('potTypes.ts imports only money types', () => {
    expect(importsOf('potTypes.ts')).toEqual(['../money/types']);
  });

  it('lineDefaults.ts imports only payoff types', () => {
    expect(importsOf('lineDefaults.ts')).toEqual(['../payoff/types']);
  });

  it('bisectCore.ts imports only money types', () => {
    expect(importsOf('bisectCore.ts')).toEqual(['../money/types']);
  });

  it('pots.ts has no path to the old types or constants files', () => {
    const imports = importsOf('pots.ts');
    expect(imports).toEqual(
      expect.arrayContaining(['../money/types', '../payoff/types', '../recurring/schedule', '../time/localDate', './potTypes'])
    );
    for (const i of imports) {
      expect(['./types', './constants', './assess']).not.toContain(i);
    }
  });
});

describe('D-11 values unchanged', () => {
  it('line defaults read the same through both modules', () => {
    for (const m of [constants, lineDefaults]) {
      expect(m.DEFAULT_DSR_LINE).toBe(percent('36'));
      expect(m.DEFAULT_HOUSING_LINE).toBe(percent('28'));
      expect(m.DEFAULT_UNSECURED_INCOME_MULTIPLE).toBe(12);
    }
  });

  it('the set-aside bound is still 500', () => {
    expect(constants.MAX_SET_ASIDE_POTS).toBe(500);
  });
});
