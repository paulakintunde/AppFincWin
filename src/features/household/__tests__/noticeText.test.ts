// 09-19: the plan_* household events read as one sentence each in the notices list (Owner P4 covers both double-cover modes).
import { renderHook } from '@testing-library/react-native';
import type { HouseholdEventRow } from '@/db/householdEvents';

const NAMES: Record<string, string> = { 'u-bea': 'Bea', 'u-alex': 'Alex' };
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u-me' } }) }));
jest.mock('@/features/household/useMemberLabel', () => ({ useMemberLabel: () => (id: string | null) => (id ? NAMES[id] ?? 'Former member' : 'Former member') }));
jest.mock('@/ui/money/useMoneyFormatter', () => ({ useMoneyFormatter: () => ({ formatMoney: () => '' }) }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US' }) }));

import { useNoticeFormat } from '../noticeText';

jest.setTimeout(30000);

const ev = (kind: string, params: Record<string, unknown> = {}, over: Partial<HouseholdEventRow> = {}): HouseholdEventRow => ({
  id: 'e1', household_id: 'h1', kind, actor_id: null, subject_id: null, ref_id: null, params, created_at: '2026-11-19T10:00:00Z', ...over,
});

async function format() {
  const { result } = await renderHook(() => useNoticeFormat('h1', 'The Flat'));
  return result.current.text;
}

describe('useNoticeFormat plan events', () => {
  it('approval needed names someone you invited and the home', async () => {
    const text = await format();
    expect(text(ev('plan_approval_needed', { needed_plan_size: 6 }))).toBe('Someone you invited wants to join The Flat. Approve to change your plan.');
  });

  it('payer left and payment failed carry the name and the grace date', async () => {
    const text = await format();
    expect(text(ev('plan_payer_left', { grace_until: '2026-11-26T12:00:00Z' }, { subject_id: 'u-bea' }))).toBe(
      'Bea left and no longer pays for this home. Full access continues until Nov 26, 2026.',
    );
    expect(text(ev('plan_grace', { grace_until: '2026-11-26T12:00:00Z' }, { subject_id: 'u-bea' }))).toBe(
      'Bea’s payment did not go through. Your home keeps full access until Nov 26, 2026.',
    );
  });

  it('takeover, lock and downgrade offer', async () => {
    const text = await format();
    expect(text(ev('plan_takeover', { previous_payer: 'u-alex', payer: 'u-bea' }))).toBe('Bea now pays for this home');
    expect(text(ev('plan_locked'))).toBe('The Flat’s plan has ended.');
    expect(text(ev('plan_downgrade_offer', { plan_size: 2 }))).toBe('A smaller plan fits');
  });

  it('plan_recovered_after_takeover names the payer whose plan stays', async () => {
    const text = await format();
    expect(text(ev('plan_recovered_after_takeover', { payer: 'u-bea', chosen_by: 'default' }))).toBe(
      'Bea’s plan now covers The Flat. You do not need yours for it. Cancel it in your app store. Your store decides on any refund.',
    );
  });

  it('plan_double_cover mode choose reads the two-plans line', async () => {
    const text = await format();
    expect(text(ev('plan_double_cover', { mode: 'choose', new_payer: 'u-bea', old_payer: 'u-alex' }))).toMatch(/^Two plans cover this home\. Pick one\./);
  });

  it('plan_double_cover mode extra tells the extra payer their plan is not needed', async () => {
    const text = await format();
    expect(text(ev('plan_double_cover', { mode: 'extra', payer: 'u-bea' }))).toBe(
      'Bea now covers The Flat. You do not need your plan for it. Cancel it in your app store. Your store decides on any refund.',
    );
  });
});
