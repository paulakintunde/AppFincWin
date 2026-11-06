/**
 * 05.4-41 (D-15, D-150..D-153): the wording guard.
 *
 * Always: every owner-worded key on the review page is in en.ts, and every placeholder on the page has a sample value.
 * The lock: only once a signed copy exists (the owner signs before Grow starts, D-150). Until then the lock check is skipped,
 * never failed. After the sign-off, any change to a locked string fails here until it is signed again.
 */
import en from '../locales/en';
import {
  changedKeys,
  DECISION_MAP,
  fillSample,
  hashOf,
  leaves,
  LOCKED_ROOTS,
  lockedHash,
  lockedLeaves,
  nodeAt,
  OTHER_KEYS,
  placeholdersOf,
  readSigned,
  readSignoff,
  SAMPLE_VALUES,
  signRecord,
} from './wordingScope';

const all = leaves(en, '');
const signoff = readSignoff();
const signed = readSigned();
const isSigned = signoff.signedAt !== null || signed !== null;
const pageKeys = [...Object.keys(lockedLeaves(en)), ...OTHER_KEYS];

describe('wording review scope (D-15)', () => {
  it('every owner-worded key on the page is in en.ts', () => {
    expect(Object.keys(DECISION_MAP).filter((k) => all[k] === undefined)).toEqual([]);
  });

  it('every owner-worded key is inside the locked groups', () => {
    expect(Object.keys(DECISION_MAP).filter((k) => !LOCKED_ROOTS.some((r) => k.startsWith(`${r}.`)))).toEqual([]);
  });

  it('every decision id is a D-number', () => {
    for (const dec of Object.values(DECISION_MAP)) expect(dec.id).toMatch(/^D-\d+[a-z]?$/);
  });

  it('the 48 plan-06 lines are all in en.ts and outside the lock (D-151)', () => {
    expect(OTHER_KEYS).toHaveLength(48);
    expect(OTHER_KEYS.filter((k) => all[k] === undefined)).toEqual([]);
    expect(OTHER_KEYS.filter((k) => LOCKED_ROOTS.some((r) => k.startsWith(`${r}.`)))).toEqual([]);
  });

  it('every locked group exists', () => {
    for (const r of LOCKED_ROOTS) expect(typeof nodeAt(en, r)).toBe('object');
  });

  it('every placeholder on the page has a sample value, so each string also reads filled', () => {
    const missing = new Set<string>();
    for (const k of pageKeys) for (const p of placeholdersOf(all[k] as string)) if (SAMPLE_VALUES[p] === undefined) missing.add(`${p} (${k})`);
    expect([...missing]).toEqual([]);
    for (const k of pageKeys) expect(fillSample(k, all[k] as string)).not.toMatch(/\{\{/);
  });

  it('fills count as 1 on an _one key', () => {
    expect(fillSample('history.confirmTitle_one', 'Undo {{count}} change?')).toBe('Undo 1 change?');
    expect(fillSample('history.confirmTitle_other', 'Undo {{count}} changes?')).toBe('Undo 3 changes?');
  });
});

describe('sign-off mechanism (D-153)', () => {
  it('signRecord gives the owner, the date, a 64-hex hash and the signed text', () => {
    const r = signRecord(en, '2026-11-05');
    expect(r.signoff).toEqual({ signedAt: '2026-11-05', by: 'owner', hash: lockedHash(en) });
    expect(r.signoff.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOf(r.signed)).toBe(r.signoff.hash);
    expect(Object.keys(r.signed)).toEqual(Object.keys(r.signed).slice().sort());
  });

  it('refuses a date that is not YYYY-MM-DD', () => {
    expect(() => signRecord(en, '5 Nov')).toThrow(RangeError);
  });

  it('the hash moves when one locked string changes, and changedKeys names it', () => {
    const before = lockedLeaves(en);
    const key = 'legal.decideAnswer.footer';
    const after = { ...before, [key]: `${before[key] as string}!` };
    expect(hashOf(after)).not.toBe(hashOf(before));
    expect(changedKeys(before, after)).toEqual([key]);
    const { [key]: _gone, ...removed } = before;
    expect(changedKeys(before, removed)).toEqual([key]);
  });

  it('the hash does not depend on key order', () => {
    const before = lockedLeaves(en);
    const reversed = Object.fromEntries(Object.entries(before).reverse());
    expect(hashOf(reversed)).toBe(hashOf(before));
  });

  it('nothing is signed in 05.4 yet: the record is empty and no signed copy exists (D-150)', () => {
    if (isSigned) return; // after the owner signs, the lock below takes over
    expect(signoff).toEqual({ signedAt: null, by: null, hash: null });
    expect(signed).toBeNull();
  });
});

describe('wording lock (D-15, active once signed)', () => {
  (isSigned ? it : it.skip)('locked Decide wording matches the owner’s sign-off', () => {
    expect(signoff.by).toBe('owner');
    expect(signoff.signedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(signed).not.toBeNull();
    const now = lockedLeaves(en);
    const changed = changedKeys(signed ?? {}, now);
    if (lockedHash(en) !== signoff.hash || changed.length > 0) {
      throw new Error(
        `Decide wording changed after sign-off: run npm run wording:page and get the owner's sign-off (D-15). Changed: ${changed.join(', ')}`
      );
    }
    expect(hashOf(signed ?? {})).toBe(signoff.hash);
  });
});
