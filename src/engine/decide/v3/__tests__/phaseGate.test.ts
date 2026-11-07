/**
 * 05.4-43 (QA-02, QA-03): the end-of-phase conditions, asserted in code.
 * - QA-03: no rule pending between the engine and the plain calculator (PENDING_RULES empty).
 * - QA-02: every approved right-answer case passes, so every knownRed list is empty; household stays to_do (6 cases).
 * - No draft case is left except drafts added from shadow-run surprises (marked "from shadow run").
 *
 * OPEN_AT_43 is what was still open when 05.4-43 was built (2026-11-06): the PLAIN-PLANS pending entry (no plan
 * closed it, 05.4-27 D-107) and ten drafts waiting for owner approval (SN-16 D-52; SN-17..SN-20 D-61/D-62;
 * SN-21..SN-24 and BR-16 D-63/D-65, 05.4-51). The list may only shrink: a new pending rule or a new draft fails this
 * test, and the phase gate is met when both lists are empty (the todo below). Closing them is an owner decision
 * reported by 05.4-43; do not add to this list.
 */
import { PENDING_RULES } from './crosscheck/pendingRules';
import { loadCases, loadKnownRed } from './rightAnswers/loader';
import { TOPICS } from './rightAnswers/schema';

const OPEN_AT_43 = {
  pending: ['PLAIN-PLANS'],
  drafts: ['BR-16', 'SN-16', 'SN-17', 'SN-18', 'SN-19', 'SN-20', 'SN-21', 'SN-22', 'SN-23', 'SN-24'],
};

const fromShadow = (c: { expertNote: string | null; ownerReason: string | null }): boolean =>
  /from shadow run/i.test(`${c.expertNote ?? ''} ${c.ownerReason ?? ''}`);

describe('05.4 phase gate', () => {
  it('QA-03: no pending rule beyond those open when 05.4-43 was built (the list only shrinks)', () => {
    const pending = PENDING_RULES.map((r) => r.fixId);
    expect(pending.filter((id) => !OPEN_AT_43.pending.includes(id))).toEqual([]);
  });

  it('QA-02: every knownRed list is empty', () => {
    for (const topic of TOPICS) expect({ topic, red: loadKnownRed(topic) }).toEqual({ topic, red: [] });
  });

  it('household has exactly 6 cases, all to_do', () => {
    const household = loadCases().filter((c) => c.topic === 'household');
    expect(household).toHaveLength(6);
    expect(household.every((c) => c.status === 'to_do')).toBe(true);
  });

  it('no draft outside household except shadow-run drafts and those open when 05.4-43 was built', () => {
    const drafts = loadCases()
      .filter((c) => c.topic !== 'household' && c.status === 'draft' && !fromShadow(c)) // 06-20: goals cases owner-approved 2026-11-07, no longer exempt
      .map((c) => c.id);
    expect(drafts.filter((id) => !OPEN_AT_43.drafts.includes(id))).toEqual([]);
  });

  it.todo('phase gate met: PENDING_RULES is empty and no draft is left (empty OPEN_AT_43)');
});
