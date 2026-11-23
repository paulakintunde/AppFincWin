// 10-04 (T-10-04-01..03): every Phase 10 string is in the catalogue, the owner's exact strings are verbatim, and the compliance voice holds.
import { DRAFT_COPY_KEYS, EXACT_SYSTEM_KEYS } from '../copyStatus';
import { i18n } from '../index';
import en from '../locales/en';

interface Leaf {
  path: string;
  value: string;
}

function collect(node: unknown, prefix: string): Leaf[] {
  if (typeof node === 'string') return [{ path: prefix, value: node }];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => collect(v, `${prefix}.${k}`));
  }
  return [];
}

const leaves = collect(en.system, 'system');
const t = (key: string, opts?: Record<string, unknown>): string => i18n.t(key as never, opts as never) as unknown as string;

const BANNED = /\badvice\b|\badvise|recommend|\bshould\b|you must|we suggest/i;

describe('system copy (10-04)', () => {
  it('has the seven-plus-push namespaces', () => {
    expect(Object.keys(en.system).sort()).toEqual(
      ['alerts', 'appLock', 'archive', 'ownData', 'push', 'queue', 'reviewer', 'security'].sort()
    );
    expect(leaves.length).toBeGreaterThan(150);
  });

  it('owner exact strings are verbatim', () => {
    expect(t('system.appLock.offerTitleFaceId')).toBe('Lock FincWin with Face ID?');
    expect(t('system.queue.fullBody', { count: 500 })).toBe(
      'You have 500 changes waiting to send. Connect to the internet to send them, then you can add more. Nothing is lost.'
    );
    expect(t('system.ownData.backupLine')).toBe('Backup copies are kept for 30 days, then they are gone too.');
    expect(t('system.ownData.saveCopyButton')).toBe('Save a copy of my records');
    expect(t('system.archive.intro')).toBe('Older months kept out of the way.');
    expect(t('system.archive.exportLink')).toBe('Export the archive');
    expect(t('system.archive.exportScope', { months: 'August 2026 and September 2026' })).toBe(
      'Only archived months: August 2026 and September 2026'
    );
    expect(
      t('system.ownData.walletImport.newAccountsTitle', { currencies: 'EUR and GBP', names: "'Wise EUR' and 'Wise GBP'" })
    ).toBe("This file has EUR and GBP balances. Create 'Wise EUR' and 'Wise GBP'?");
    expect(t('system.push.partnerLarge', { who: 'Sam', amount: '$320', category: 'Home' })).toBe('Sam spent $320 on Home');
  });

  it('reviewer entry is a visible link (D-30)', () => {
    expect(t('system.reviewer.link')).toBe('App review sign-in');
    expect(t('system.reviewer.failed')).toBe('That email and password did not work.');
  });

  it('push templates carry no note or payee param (D-12)', () => {
    for (const l of leaves.filter((x) => x.path.startsWith('system.push.'))) {
      expect(l.value).not.toMatch(/\{\{(note|payee|memo)\}\}/);
    }
  });

  it.each(leaves)('uses the compliance voice: $path', ({ value }) => {
    expect(value).not.toMatch(BANNED);
    expect(value).not.toContain('!');
    expect(value).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(value.trim().split(/\s+/).length).toBeLessThanOrEqual(25);
  });

  it('every non-exact leaf is tracked as draft', () => {
    const draft = new Set<string>(DRAFT_COPY_KEYS);
    const missing = leaves.map((l) => l.path).filter((p) => !EXACT_SYSTEM_KEYS.includes(p) && !draft.has(p));
    expect(missing).toEqual([]);
    for (const k of EXACT_SYSTEM_KEYS) expect(draft.has(k)).toBe(false);
  });
});
