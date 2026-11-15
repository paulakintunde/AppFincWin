import { VERDICT_TABLE, verdictRowFor, type Code, type Variant } from '@/engine/decide/v3';

import { STATE_GLYPH, stateForVerdict, type StateTone } from '../stateForVerdict';

const TONES: readonly StateTone[] = ['fits', 'tight', 'net', 'extra', 'short', 'cond', 'notYet'];

function split(key: string): [string, string | null] {
  const dot = key.indexOf('.');
  return dot < 0 ? [key, null] : [key.slice(0, dot), key.slice(dot + 1)];
}

describe('stateForVerdict (UX-03, UX-09, D-16)', () => {
  it.each(Object.keys(VERDICT_TABLE))('%s has a state, a glyph and a chip word', (key) => {
    const [code, variant] = split(key);
    const s = stateForVerdict(code, variant);
    expect(TONES).toContain(s.tone);
    expect(s.glyph).toBe(STATE_GLYPH[s.tone]);
    const once = variant === 'tight_once';
    const engineVariant = variant === 'tight_once' || variant === 'tight_plan' ? 'tight' : variant;
    const row = verdictRowFor(code as Code, engineVariant as Variant | null, once);
    expect(row.chipKey.length).toBeGreaterThan(0);
  });

  it('never shows a plain Fits when the month is already short, the net is empty or small, or the net is used (CMP-F14)', () => {
    for (const key of Object.keys(VERDICT_TABLE)) {
      const [code, variant] = split(key);
      const risky = variant === 'month_already_short' || variant === 'no_net' || variant === 'small_net' || code === 'fits_uses_net';
      if (risky) expect(stateForVerdict(code, variant).tone).not.toBe('fits');
    }
  });

  it.each<[string, string | null, StateTone, string]>([
    ['fits_month', null, 'fits', 'sCheck'],
    ['fits_unspent', null, 'fits', 'sCheck'],
    ['fits_unspent', 'extra_savings', 'extra', 'sUp'],
    ['fits_month', 'tight', 'tight', 'sOver'],
    ['fits_month', 'tight_once', 'tight', 'sOver'],
    ['fits_unspent', 'tight', 'tight', 'sOver'],
    ['fits_unspent', 'tight_plan', 'tight', 'sOver'],
    ['fits_month', 'low_month', 'tight', 'sOver'],
    ['fits_unspent', 'no_net', 'tight', 'sOver'],
    ['fits_month', 'small_net', 'tight', 'sOver'],
    ['fits_unspent', 'costly_debt', 'tight', 'sOver'],
    ['fits_month', 'month_short_small', 'tight', 'sOver'],
    ['fits_unspent', 'month_short_moderate', 'tight', 'sOver'],
    ['fits_unspent', 'month_short_moderate_extra', 'tight', 'sOver'],
    ['fits_by_borrowing', 'month_short_small', 'tight', 'sOver'],
    ['not_yet', 'payday', 'tight', 'sOver'],
    ['fits_uses_overdraft', null, 'tight', 'sOver'],
    ['fits_uses_overdraft', 'not_cleared', 'tight', 'sOver'],
    ['fits_uses_net', null, 'net', 'lock'],
    ['fits_uses_net', 'protection_off', 'net', 'lock'],
    ['emergency_use', null, 'net', 'lock'],
    ['fits_by_borrowing', null, 'cond', 'sHalf'],
    ['fits_by_borrowing', 'borrowing_costs_more', 'cond', 'sHalf'],
    ['fits_on_your_answer', null, 'cond', 'sHalf'],
    ['monthly_short', null, 'short', 'sDown'],
    ['fits_month', 'month_already_short', 'short', 'sDown'],
    ['fits_on_your_answer', 'month_already_short', 'short', 'sDown'],
    ['not_yet', null, 'notYet', 'sClock'],
    ['not_yet', 'not_covered', 'notYet', 'sClock'],
    ['needs_input', null, 'notYet', 'sClock'],
  ])('%s.%s -> %s / %s (UI-SPEC table)', (code, variant, tone, glyph) => {
    expect(stateForVerdict(code, variant)).toEqual({ tone, glyph });
  });

  it('falls back to the base row tone for a variant with no row of its own', () => {
    expect(stateForVerdict('fits_month', 'protection_off')).toEqual({ tone: 'fits', glyph: 'sCheck' });
    expect(stateForVerdict('monthly_short', 'payday')).toEqual({ tone: 'short', glyph: 'sDown' });
    expect(stateForVerdict('needs_input', 'payday')).toEqual({ tone: 'notYet', glyph: 'sClock' });
    expect(stateForVerdict('fits_uses_overdraft', 'payday')).toEqual({ tone: 'tight', glyph: 'sOver' });
  });

  it('reads a code the screens do not know yet as Not yet', () => {
    expect(stateForVerdict('some_future_code', null)).toEqual({ tone: 'notYet', glyph: 'sClock' });
    expect(stateForVerdict('some_future_code', 'payday')).toEqual({ tone: 'notYet', glyph: 'sClock' });
  });

  it('gives each of the seven states its own glyph', () => {
    expect(new Set(Object.values(STATE_GLYPH)).size).toBe(7);
    expect(Object.isFrozen(STATE_GLYPH)).toBe(true);
  });
});
