// 09-12 (T-09-45, T-09-47): every Phase 9 string is the owner-signed text in 09-WORDING.md, and keeps the compliance voice.
import fs from 'fs';
import path from 'path';

import en from '../locales/en';

type Row = { key: string; text: string; status: string };

const WORDING = path.join(__dirname, '../../../.planning/phases/09-tiers-onboarding/09-WORDING.md');

function parseRows(): Row[] {
  const rows: Row[] = [];
  for (const line of fs.readFileSync(WORDING, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('| ')) continue;
    const cells = line
      .split(' | ')
      .map((c) => c.trim().replace(/^\|\s*/, '').replace(/\s*\|$/, ''));
    const [key, text, status] = cells;
    if (cells.length < 4 || key === undefined || text === undefined || status === undefined) continue;
    if (key === 'key' || !/^[A-Za-z]+\.[A-Za-z.]+$/.test(key)) continue;
    rows.push({ key, text, status });
  }
  return rows;
}

// The app uses typographic apostrophes (catalogue guard); 09-WORDING.md was signed with straight ones. Same text.
const straight = (v: unknown): unknown => (typeof v === 'string' ? v.split('’').join("'") : v);

function resolve(key: string): unknown {
  let node: unknown = en;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object') node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return node;
}

function collect(node: unknown, prefix: string): { path: string; value: string }[] {
  if (typeof node === 'string') return [{ path: prefix, value: node }];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => collect(v, `${prefix}.${k}`));
  }
  return [];
}

const rows = parseRows();
const phase9 = [
  ...collect(en.plans, 'plans'),
  ...collect(en.onboarding, 'onboarding'),
  ...collect(en.features, 'features'),
  ...collect(en.lock, 'lock'),
  ...collect(
    {
      trial: en.appLife.status.trial,
      planActive: en.appLife.status.planActive,
      trialEnding: en.appLife.status.trialEnding,
      paymentFailed: en.appLife.status.paymentFailed,
      readOnly: en.appLife.status.readOnly,
      waitingApproval: en.appLife.status.waitingApproval,
      coveredBy: en.appLife.status.coveredBy,
      freeAccess: en.appLife.status.freeAccess,
    },
    'appLife.status'
  ),
];

// Long disclosure and pledge lines the owner wrote or signed whole; the 25-word cap is for everything else.
const LONG_ALLOWED = new Set([
  'plans.paywall.startLine',
  'plans.paywall.pledge',
  'plans.doubleCover.body',
  'plans.doubleCover.defaultLine',
  'plans.leave.member',
  'onboarding.q.goal.why',
  'onboarding.q.share.why',
]);

describe('Phase 9 copy (09-WORDING.md)', () => {
  it('reads the signed wording file', () => {
    expect(rows.length).toBeGreaterThan(400);
  });

  it.each(rows.map((r) => [r.key, r.text]))('%s equals the signed text', (key, text) => {
    expect(straight(resolve(key))).toBe(text);
  });

  it('has no Phase 9 string without a signed row', () => {
    const signed = new Set(rows.map((r) => r.key));
    // features.items.* comes from the signed level map (09-LEVEL-MAP.md), not the wording file.
    const extra = phase9.filter((s) => !signed.has(s.path) && !s.path.startsWith('features.items.'));
    expect(extra.map((s) => s.path)).toEqual([]);
  });

  it('gives every feature in the level map a label and a sub-line', () => {
    const items = collect(en.features.items, 'features.items');
    expect(items.length).toBeGreaterThanOrEqual(32 * 2);
    expect(items.filter((s) => s.value.trim() === '')).toEqual([]);
  });

  it('uses no banned words and no emoji', () => {
    const banned =
      /\b(advice|advise|recommend\w*|should|you must|pro|premium|free forever|no card needed)\b/i;
    const bad = phase9.filter((s) => banned.test(s.value) || /\p{Extended_Pictographic}/u.test(s.value));
    expect(bad).toEqual([]);
  });

  it('keeps every line to 25 words unless it is a listed long disclosure', () => {
    const words = (v: string) => v.trim().split(/\s+/).length;
    const long = phase9.filter((s) => words(s.value) > 25 && !LONG_ALLOWED.has(s.path));
    expect(long.map((s) => `${s.path} (${words(s.value)})`)).toEqual([]);
  });

  it('keeps the owner exact lines verbatim', () => {
    expect(straight(en.plans.paywall.pledge)).toBe(
      "The price of your plan won't go up while your subscription stays active. Taxes set by your app store, or moving to a bigger plan, can change what you pay."
    );
    expect(straight(en.plans.paywall.startLine)).toBe(
      "Try everything free for 14 days. After the trial, choose a plan to continue. Subscriptions renew automatically until cancelled. Cancel anytime in You > Subscription or your app store's subscription settings."
    );
    expect(straight(en.plans.invite.thirdPersonTrial)).toBe(
      'Adding a 3rd person moves you to Household. Your free trial ends and {{price}} is charged today.'
    );
    expect(straight(en.plans.invite.soloConfirm.body)).toBe(
      'Adding a member needs a household plan. Your next bill would be {{monthly}} a month or {{yearly}} a year.'
    );
    expect(straight(en.plans.deleteWarning.body)).toBe(
      "Deleting your account doesn't cancel billing. Cancel in your app store first."
    );
    expect(straight(en.features.reasons.level)).toBe('Not in your level');
    expect(straight(en.features.reasons.household)).toBe('Not on for your household');
    expect(straight(en.features.reasons.plan)).toBe('Needs a plan');
    expect(straight(en.lock.savedOffline.title)).toBe('Saved on this phone. Choose a plan to sync');
  });
});
