/**
 * 05.4 FIN-27 / ARC-25 (D-18..D-21): the region tax table and its one lookup.
 */
import * as market from '../../../marketDefaults';
import { percent } from '../../../../payoff/types';
import * as defaults from '../defaults';
import * as lookup from '../lookup';
import { TAX_DEFAULTS } from '../defaults';
import { INCLUDED_COUNTRIES, lookupTaxDefault } from '../lookup';

const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];

describe('TAX_DEFAULTS', () => {
  const keys = Object.keys(TAX_DEFAULTS);

  it('has exactly 51 US rows (50 states + DC) and 13 Canadian rows, and nothing else', () => {
    expect(keys.filter((k) => k.startsWith('US-'))).toHaveLength(51);
    expect(keys.filter((k) => k.startsWith('CA-'))).toHaveLength(13);
    expect(keys).toHaveLength(64);
    expect(TAX_DEFAULTS['US-DC']).toBeDefined();
  });

  it('every row is dated and sourced, with a rate between 0% and 20%', () => {
    for (const k of keys) {
      const row = TAX_DEFAULTS[k]!;
      expect(row.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.source.length).toBeGreaterThan(10);
      expect(row.percent >= 0n).toBe(true);
      expect(row.percent <= percent('20')).toBe(true);
    }
  });

  it('holds the primary-source figures the right-answer table and the calculator lean on', () => {
    expect(TAX_DEFAULTS['US-CA']!.percent).toBe(percent('9.03'));
    expect(TAX_DEFAULTS['US-TX']!.percent).toBe(percent('8.2'));
    expect(TAX_DEFAULTS['US-AK']!.percent).toBe(percent('1.82'));
    for (const s of ['DE', 'MT', 'NH', 'OR']) expect(TAX_DEFAULTS[`US-${s}`]!.percent).toBe(percent('0'));
    expect(TAX_DEFAULTS['CA-ON']).toMatchObject({ percent: percent('13'), basis: 'hst' });
    expect(TAX_DEFAULTS['CA-NS']).toMatchObject({ percent: percent('14'), basis: 'hst' });
    expect(TAX_DEFAULTS['CA-QC']).toMatchObject({ percent: percent('14.975'), basis: 'gst_qst' });
    expect(TAX_DEFAULTS['CA-BC']).toMatchObject({ percent: percent('12'), basis: 'combined_gst_pst' });
    expect(TAX_DEFAULTS['CA-AB']).toMatchObject({ percent: percent('5'), basis: 'gst_only' });
  });

  it('is frozen', () => {
    expect(Object.isFrozen(TAX_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(INCLUDED_COUNTRIES)).toBe(true);
  });
});

describe('lookupTaxDefault', () => {
  it('a US state or Canadian province adds its usual rate, with its date and source', () => {
    const r = lookupTaxDefault({ country: 'US', subdivision: 'CA' });
    expect(r).toEqual({ kind: 'add', percent: percent('9.03'), basis: 'state_plus_average_local', asOf: '2026-07-01', source: TAX_DEFAULTS['US-CA']!.source });
    expect(lookupTaxDefault({ country: 'CA', subdivision: 'QC' })).toMatchObject({ kind: 'add', percent: percent('14.975'), basis: 'gst_qst' });
  });

  it('the UK and every EU member count the price as tax included, whatever the subdivision', () => {
    expect(INCLUDED_COUNTRIES).toEqual(['GB', ...EU]);
    for (const c of ['GB', ...EU]) {
      expect(lookupTaxDefault({ country: c, subdivision: null })).toEqual({ kind: 'included' });
      expect(lookupTaxDefault({ country: c, subdivision: 'X' })).toEqual({ kind: 'included' });
    }
  });

  it('no region, another country, or the US or Canada with no state or province, is unknown (no rate guessed, D-20)', () => {
    expect(lookupTaxDefault({ country: null, subdivision: null })).toEqual({ kind: 'unknown' });
    expect(lookupTaxDefault({ country: null, subdivision: 'CA' })).toEqual({ kind: 'unknown' });
    expect(lookupTaxDefault({ country: 'US', subdivision: null })).toEqual({ kind: 'unknown' });
    expect(lookupTaxDefault({ country: 'CA', subdivision: null })).toEqual({ kind: 'unknown' });
    expect(lookupTaxDefault({ country: 'AU', subdivision: 'NSW' })).toEqual({ kind: 'unknown' });
    expect(lookupTaxDefault({ country: 'US', subdivision: 'ZZ' })).toEqual({ kind: 'unknown' });
    expect(lookupTaxDefault({ country: 'US', subdivision: 'ON' })).toEqual({ kind: 'unknown' });
  });
});

describe('ARC-25 / 05.1 D-07: no default APR or rate field in any region-defaults module', () => {
  const offending = (v: unknown, path: string, out: string[]): void => {
    if (v === null || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (/apr|rate/i.test(k)) out.push(`${path}.${k}`);
      offending(x, `${path}.${k}`, out);
    }
  };

  it('no exported object in tax/ or marketDefaults.ts has a key named like apr or rate', () => {
    const out: string[] = [];
    for (const [name, mod] of Object.entries({ defaults, lookup, market })) {
      for (const [k, v] of Object.entries(mod)) {
        if (/apr|rate/i.test(k)) out.push(`${name}.${k}`);
        offending(v, `${name}.${k}`, out);
      }
    }
    // and nothing the lookup hands out carries one either
    offending(lookupTaxDefault({ country: 'US', subdivision: 'TX' }), 'lookup(US-TX)', out);
    expect(out).toEqual([]);
  });
});
