/**
 * 05.4-08 (ENG-28, D-14): the reviewed diff. Today's v3 answer on a fixed corpus is compared with the approved answer
 * recorded in answers.json. Any difference fails the build until `node scripts/reviewed-diff.mjs --write <FIX-ID>` lists it
 * and the owner approves it (`--approve`). answers.json is rewritten only by --approve (T-05.4-08-02); every changes.json
 * entry needs a fix ID, a reason of 20+ characters and approved true (T-05.4-08-01).
 */
import * as fs from 'fs';
import * as path from 'path';
import { corpus, currentAnswers, type ReviewedAnswer, type ReviewedChange } from './corpus';
import { loadPersons } from '../golden/adapter';
import auditFile from '../golden/audit-personas.json';

const MIN_REASON = 20;
const DIR = __dirname;


const approvedAnswers = JSON.parse(fs.readFileSync(path.join(DIR, 'answers.json'), 'utf8')) as Record<string, ReviewedAnswer>;
const changes = (JSON.parse(fs.readFileSync(path.join(DIR, 'changes.json'), 'utf8')) as { changes: ReviewedChange[] }).changes;

describe('reviewed diff (previous v3 answer vs new v3 answer)', () => {
  it('corpus is deterministic and large enough: 5 checks per person plus 200 generated cases', () => {
    const a = corpus();
    const b = corpus();
    expect(a.map((c) => c.key)).toEqual(b.map((c) => c.key));
    expect(a.map((c) => c.inputs)).toEqual(b.map((c) => c.inputs));
    expect(new Set(a.map((c) => c.key)).size).toBe(a.length);
    const persons = loadPersons().length + (auditFile as unknown as { persons: unknown[] }).persons.length;
    expect(a.length).toBeGreaterThanOrEqual(200 + persons * 5);
  });

  it('answers.json covers exactly the corpus keys', () => {
    expect(Object.keys(approvedAnswers).sort()).toEqual(corpus().map((c) => c.key).sort());
  });

  it('every corpus answer equals the approved answer; a difference is listed by key', () => {
    const now = currentAnswers();
    const differing = Object.keys(now).filter((k) => JSON.stringify(now[k]) !== JSON.stringify(approvedAnswers[k]));
    expect(differing.map((k) => `${k}: ${JSON.stringify(approvedAnswers[k])} -> ${JSON.stringify(now[k])}`)).toEqual([]);
  });

  it('every listed change has a fix ID, a reason of 20+ characters and is approved', () => {
    const bad = changes.filter((c) => !(c.fixId.trim() !== '' && c.reason.trim().length >= MIN_REASON && c.approved === true));
    expect(bad.map((c) => `${c.fixId || '(no fix id)'} ${c.key}`)).toEqual([]);
  });

  it('every listed change names a key that is in the corpus', () => {
    const keys = new Set(corpus().map((c) => c.key));
    expect(changes.filter((c) => !keys.has(c.key)).map((c) => c.key)).toEqual([]);
  });
});
