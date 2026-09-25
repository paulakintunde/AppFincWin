import en from '../locales/en';
import { AWAITING_COPY_KEYS, DRAFT_COPY_KEYS } from '../copyStatus';
import { i18n } from '../index';

interface Leaf {
  path: string;
  value: string;
}

function collectLeaves(node: unknown, prefix = ''): Leaf[] {
  if (typeof node === 'string') {
    return [{ path: prefix, value: node }];
  }
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      collectLeaves(value, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [];
}

function getByPath(node: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, node);
}

const leaves = collectLeaves(en);

// CLAUDE.md compliance: never "advice", "recommendation", "you should", and never a
// claim that data stays on the device (D-15) — see T-00-12-01.
const FORBIDDEN_VOICE = /\badvice\b|recommend|you should|stays? on (this|your) device|figures stay/i;

describe('en catalogue', () => {
  it('has at least one leaf string', () => {
    expect(leaves.length).toBeGreaterThan(0);
  });

  it.each(leaves)('uses no straight apostrophe: $path', ({ value }) => {
    expect(value).not.toContain("'");
  });

  it.each(leaves)('uses no forbidden compliance language: $path', ({ value }) => {
    expect(value).not.toMatch(FORBIDDEN_VOICE);
  });
});

describe('copyStatus keys resolve in en', () => {
  it('has no copy still awaiting the user (release blocker when non-empty)', () => {
    expect(AWAITING_COPY_KEYS).toEqual([]);
  });

  it.each(DRAFT_COPY_KEYS)('DRAFT_COPY_KEYS key "%s" resolves to a string', (key) => {
    expect(typeof getByPath(en, key)).toBe('string');
  });
});

describe('typed t()', () => {
  it('returns a fixed catalogue string', () => {
    expect(i18n.t('update.heading')).toBe('Update needed');
  });

  it('pluralises signOut.confirm.body via count', () => {
    expect(i18n.t('signOut.confirm.body', { count: 3 })).toMatch(/^3 changes/);
    expect(i18n.t('signOut.confirm.body', { count: 1 })).toMatch(/^1 change not/);
  });
});
