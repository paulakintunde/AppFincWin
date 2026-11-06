/**
 * 05.4-36 BO-08 (D-13, D-146): the revision lock. A tester's phone runs the shadow samples once per DECIDE_ENGINE_REVISION, so the
 * revision must change whenever anything a phone would send changes. The hash covers, in order:
 *   1. the reviewed answers (reviewed/answers.json, parsed and re-written so line endings do not matter);
 *   2. every approved right-answer case: id, fixture and expected;
 *   3. the rounded shadow run (shadowRun) for the 6 samples on every reviewed-corpus input.
 * A change without a bump fails with "bump DECIDE_ENGINE_REVISION". After bumping:
 *   REVISION_WRITE=1 npx jest src/engine/decide/v3/shadow/__tests__/revision.test.ts
 * which refuses to record a new hash under the revision already in the lock.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { corpus } from '../../__tests__/reviewed/corpus';
import { loadCases } from '../../__tests__/rightAnswers/loader';
import type { V3Inputs } from '../../types';
import { DECIDE_ENGINE_REVISION } from '../revision';
import { shadowRun } from '../run';

const LOCK = path.join(__dirname, 'revision-lock.json');
const ANSWERS = path.join(__dirname, '../../__tests__/reviewed/answers.json');

interface Lock {
  readonly revision: string;
  readonly hash: string;
}

function revisionParts(): string[] {
  const parts: string[] = [];
  parts.push(JSON.stringify(JSON.parse(fs.readFileSync(ANSWERS, 'utf8'))));
  for (const c of loadCases().filter((k) => k.status === 'approved')) {
    parts.push(JSON.stringify({ id: c.id, fixture: c.fixture, expected: c.expected }));
  }
  const seen = new Set<V3Inputs>();
  for (const c of corpus()) {
    if (seen.has(c.inputs)) continue;
    seen.add(c.inputs);
    parts.push(JSON.stringify({ key: c.key, run: shadowRun(c.inputs) }));
  }
  return parts;
}

const hashOf = (parts: readonly string[]): string => createHash('sha256').update(parts.join('\n\u0000\n')).digest('hex');

/** The lock check, separate from the files so its outcomes can be tested. */
function checkLock(lock: Lock | null, revision: string, hash: string, write: boolean): { ok: true; write: Lock | null } | { ok: false; message: string } {
  if (write) {
    if (lock !== null && lock.revision === revision && lock.hash !== hash) {
      return { ok: false, message: `bump DECIDE_ENGINE_REVISION: refusing to record a new hash under ${revision}` };
    }
    return { ok: true, write: { revision, hash } };
  }
  if (lock === null) return { ok: false, message: 'no revision-lock.json: run with REVISION_WRITE=1' };
  if (lock.hash !== hash) {
    return lock.revision === revision
      ? { ok: false, message: `bump DECIDE_ENGINE_REVISION: what a shadow run sends changed under ${revision}` }
      : { ok: false, message: `record the hash for ${revision}: run with REVISION_WRITE=1` };
  }
  if (lock.revision !== revision) return { ok: false, message: `revision-lock.json is for ${lock.revision}; run with REVISION_WRITE=1` };
  return { ok: true, write: null };
}

describe('engine revision lock (D-13, D-146)', () => {
  it('the hash of answers, approved cases and rounded shadow runs matches the lock for this revision', () => {
    const lock = fs.existsSync(LOCK) ? (JSON.parse(fs.readFileSync(LOCK, 'utf8')) as Lock) : null;
    const out = checkLock(lock, DECIDE_ENGINE_REVISION, hashOf(revisionParts()), process.env.REVISION_WRITE === '1');
    if (out.ok && out.write !== null) fs.writeFileSync(LOCK, `${JSON.stringify(out.write, null, 2)}\n`);
    expect(out.ok ? 'ok' : out.message).toBe('ok');
  }, 120_000);

  it('covers every corpus input and the approved cases', () => {
    const parts = revisionParts();
    const inputs = new Set(corpus().map((c) => c.inputs)).size;
    const approved = loadCases().filter((k) => k.status === 'approved').length;
    expect(approved).toBeGreaterThan(0);
    expect(parts).toHaveLength(1 + approved + inputs);
  }, 120_000);

  describe('checkLock', () => {
    const lock = { revision: '05.4.1', hash: 'aaa' };
    it('passes on the same revision and hash', () => {
      expect(checkLock(lock, '05.4.1', 'aaa', false)).toEqual({ ok: true, write: null });
    });
    it('a changed answer without a bump fails with "bump DECIDE_ENGINE_REVISION"', () => {
      const out = checkLock(lock, '05.4.1', 'bbb', false);
      expect(out.ok).toBe(false);
      expect(out.ok ? '' : out.message).toMatch(/^bump DECIDE_ENGINE_REVISION/);
    });
    it('a bumped revision asks for the hash to be recorded', () => {
      expect(checkLock(lock, '05.4.2', 'bbb', false)).toEqual({ ok: false, message: 'record the hash for 05.4.2: run with REVISION_WRITE=1' });
    });
    it('a bumped revision with an unchanged hash still asks for the lock to be rewritten', () => {
      expect(checkLock(lock, '05.4.2', 'aaa', false)).toEqual({ ok: false, message: 'revision-lock.json is for 05.4.1; run with REVISION_WRITE=1' });
    });
    it('no lock fails', () => {
      expect(checkLock(null, '05.4.1', 'aaa', false)).toEqual({ ok: false, message: 'no revision-lock.json: run with REVISION_WRITE=1' });
    });
    it('write refuses a new hash under the same revision, and writes after a bump or with no lock', () => {
      expect(checkLock(lock, '05.4.1', 'bbb', true).ok).toBe(false);
      expect(checkLock(lock, '05.4.1', 'aaa', true)).toEqual({ ok: true, write: lock });
      expect(checkLock(lock, '05.4.2', 'bbb', true)).toEqual({ ok: true, write: { revision: '05.4.2', hash: 'bbb' } });
      expect(checkLock(null, '05.4.1', 'aaa', true)).toEqual({ ok: true, write: lock });
    });
  });
});
