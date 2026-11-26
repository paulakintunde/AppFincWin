// 10.1-30 (D-29): a statement import that matches an existing split line (duplicate, pay-match or reconcile) never removes or
// rewrites its category_parts. The pipeline never reads or writes parts; what it writes for a matched line is only status, date
// and amount (mark-paid), and a split line is not offered as a transfer leg. If the total changes, the parts stay as they were
// (the gap shows, D-03).
import { minorUnits } from '@/engine/money';
import type { BuiltinCategoryKey } from '@/engine/categorize';
import type { PendingOccurrence } from '@/engine/recurring';
import type { DraftRow, ExistingRow, FormatProfile, StatementDraft } from '@/engine/statement';
import { buildPreview, toImportCommit, type CommitDecisions, type ExistingInfo, type PreviewAccount, type PreviewInput } from '../importPipeline';

const PROFILE = {
  accountFamily: 'deposit',
  positiveMeans: 'money-in',
  balanceMeans: 'available',
  statedLimit: null,
  decidedBy: 'user',
} as unknown as FormatProfile;
const ACCOUNT = { id: 'acc-1', currency: 'GBP', kind: 'checking', creditLimit: null, overdraftLimit: null } as unknown as PreviewAccount;

function row(index: number, over: Partial<DraftRow> = {}): DraftRow {
  return {
    index,
    localDate: '2026-09-01',
    description: 'SHOP',
    magnitude: minorUnits(5000),
    marker: 'minus',
    rawAmount: '-50.00',
    balanceMagnitude: null,
    balanceMarker: 'none',
    rawBalance: null,
    currency: 'GBP',
    externalId: null,
    trnType: null,
    issues: [],
    ...over,
  };
}
function draft(rows: DraftRow[]): StatementDraft {
  return {
    source: 'csv',
    layoutSignature: 'date|description|amount',
    accountHint: 'bank',
    currency: 'GBP',
    rows,
    statedOpening: null,
    statedClosing: null,
    available: null,
    statedLimit: null,
    balanceLabel: null,
    labels: [],
    periodStart: null,
    periodEnd: null,
    warnings: [],
  };
}
function input(d: StatementDraft, over: Partial<PreviewInput> = {}): PreviewInput {
  return {
    draft: d,
    profile: PROFILE,
    format: 'csv',
    account: ACCOUNT,
    accounts: [],
    existing: [],
    pending: [],
    transferCandidates: [],
    perEur: new Map(),
    learned: new Map(),
    builtinIds: new Map<BuiltinCategoryKey, string>(),
    storedOpeningForFile: null,
    ...over,
  };
}
const NEW_IDS = () => {
  let n = 0;
  return () => `id-${++n}`;
};
const CTX = {
  householdId: 'hh-1',
  accountId: 'acc-1',
  timeZone: 'Europe/London',
  transferCategoryId: 'cat-transfer',
  accounts: [],
  existingById: new Map<string, ExistingInfo>(),
  accountVersion: 1,
  remember: null as { signature: string; id: string } | null,
};
const decisions = (over: Partial<CommitDecisions> = {}): CommitDecisions => ({
  included: new Set<number>(),
  categories: new Map(),
  links: new Map(),
  orphans: new Map(),
  payMatches: new Set(),
  acceptLimit: false,
  ...over,
});

// A split line as the import sees it: the stored row carries category_parts, but the pipeline's inputs have no such field.
const SPLIT_PARTS = [
  { c: 'cat-groc', a: -3000 },
  { c: 'cat-dine', a: -2000 },
];
const splitExisting: ExistingRow & { category_parts: typeof SPLIT_PARTS } = {
  id: 'split-1',
  localDate: '2026-09-01',
  amount: -5000,
  name: 'SHOP',
  externalId: null,
  importFormat: null,
  category_parts: SPLIT_PARTS,
};

function pendingSplit(localDate: string): { pending: PendingOccurrence; info: ExistingInfo } {
  return {
    pending: { id: 'split-p', version: 3, localDate, amount: -5000, currency: 'GBP', name: 'SHOP', accountId: 'acc-1' },
    info: { version: 3, category_id: 'cat-groc', local_date: localDate, original_amount: -5000, status: 'pending', transfer_id: null },
  };
}

describe('import over an existing split line (D-29)', () => {
  it('a duplicate match only names the line; nothing is written for it and its parts are untouched', () => {
    const p = buildPreview(input(draft([row(0)]), { existing: [splitExisting] }));
    expect(p.rows[0]?.duplicate).toEqual({ kind: 'existing', id: 'split-1', by: 'match' });
    expect(p.rows[0]?.included).toBe(false);
    const { rows, finalize } = toImportCommit(p, decisions({ included: new Set() }), CTX, 'b', NEW_IDS());
    expect(rows).toEqual([]);
    expect(finalize.links).toEqual([]);
    expect(finalize.markPaid).toEqual([]);
    expect(splitExisting.category_parts).toEqual(SPLIT_PARTS);
  });

  it('a reconcile match writes no parts and no category fields', () => {
    const p = buildPreview(input(draft([row(0)]), { existing: [splitExisting] }));
    const { rows, finalize } = toImportCommit(p, decisions({ included: new Set() }), CTX, 'b', NEW_IDS());
    for (const r of rows) expect(r).not.toHaveProperty('category_parts');
    expect(JSON.stringify(finalize)).not.toContain('category_parts');
  });

  it('a pay-match patches only status, date and amount, never category_id or category_parts', () => {
    const { pending, info } = pendingSplit('2026-09-02');
    const p = buildPreview(input(draft([row(0)]), { pending: [pending] }));
    expect(p.rows[0]?.payMatch).toEqual({ pendingId: 'split-p', automatic: false });
    const ctx = { ...CTX, existingById: new Map([['split-p', info]]) };
    const { finalize } = toImportCommit(p, decisions({ included: new Set([0]), payMatches: new Set([0]) }), ctx, 'b', NEW_IDS());
    expect(finalize.markPaid).toHaveLength(1);
    const m = finalize.markPaid[0]!;
    expect(Object.keys(m.patch).sort()).toEqual(['local_date', 'original_amount', 'status']);
    expect(Object.keys(m.before).sort()).toEqual(['local_date', 'original_amount', 'status']);
    expect(JSON.stringify(m.patch)).not.toMatch(/category/);
  });

  it('a pay-match whose total differs moves only original_amount; the parts stay so the split shows the gap', () => {
    const { pending, info } = pendingSplit('2026-09-01');
    const p = buildPreview(input(draft([row(0, { magnitude: minorUnits(5400), rawAmount: '-54.00' })]), { pending: [pending] }));
    expect(p.rows[0]?.payMatch).not.toBeNull();
    const ctx = { ...CTX, existingById: new Map([['split-p', info]]) };
    const { finalize } = toImportCommit(p, decisions({ included: new Set([0]), payMatches: new Set([0]) }), ctx, 'b', NEW_IDS());
    expect(finalize.markPaid[0]?.patch).toMatchObject({ status: 'paid', original_amount: -5400 });
    expect(Object.keys(finalize.markPaid[0]!.patch)).not.toContain('category_parts');
  });
});
