import { verdictRowFor } from '@/engine/decide/v3';
import type { Result } from '@/engine/decide/v3';
import type { StoredSeenV3 } from '@/db/decideChecks';
import { changedSinceOpened, changedSinceSaved } from '../answerChange';

const chip = verdictRowFor;
const stored = (code: StoredSeenV3['code'], variant: StoredSeenV3['variant'] = null): StoredSeenV3 => ({ v: 3, code, variant, readyBy: null, unspentAfter: null, lineFacts: [] });
const live = (code: Result['code'], variant: Result['variant'] = null): Result =>
  ({ code, variant, readyBy: null, facts: [], split: [], notices: [], missing: [], reasons: [], layers: [], band: null }) as unknown as Result;

describe('changedSinceOpened', () => {
  it('shows with from and to chips when the code differs', () => {
    expect(changedSinceOpened('not_yet', 'not_covered', 'fits_unspent', null)).toEqual({
      show: true,
      fromKey: chip('not_yet', 'not_covered').chipKey,
      toKey: chip('fits_unspent', null).chipKey,
    });
  });
  it('shows when only the variant differs', () => {
    expect(changedSinceOpened('not_yet', 'payday', 'not_yet', 'not_covered').show).toBe(true);
  });
  it('hidden when code and variant match', () => {
    expect(changedSinceOpened('not_yet', 'not_covered', 'not_yet', 'not_covered').show).toBe(false);
  });
});

describe('changedSinceSaved', () => {
  it('null stored never shows', () => {
    expect(changedSinceSaved(null, live('fits_month')).show).toBe(false);
  });
  it('shows when the code changed', () => {
    const t = changedSinceSaved(stored('not_yet', 'not_covered'), live('fits_unspent'));
    expect(t).toEqual({ show: true, fromKey: chip('not_yet', 'not_covered').chipKey, toKey: chip('fits_unspent', null).chipKey });
  });
  it('hidden when nothing changed', () => {
    expect(changedSinceSaved(stored('fits_month'), live('fits_month')).show).toBe(false);
  });
});
