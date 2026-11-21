// 08.1-23 (T-08.1-68): the two plan 22 event kinds read as plain sentences naming who changed what.
import { renderHook } from '@testing-library/react-native';
import type { HouseholdEventRow } from '@/db/householdEvents';
import { useNoticeFormat } from '../noticeText';

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('../useMemberLabel', () => ({ useMemberLabel: () => (id: string | null) => (id === 'sam' ? 'Sam' : 'Someone') }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));

const event = (kind: string, params: Record<string, unknown> = {}): HouseholdEventRow =>
  ({ id: 'e1', household_id: 'h', kind, actor_id: 'sam', subject_id: null, ref_id: null, params, created_at: '2026-11-21T10:00:00Z' }) as HouseholdEventRow;

describe('household notices for the spending rule and joint purposes', () => {
  it('names who changed how spending is shared', async () => {
    const { result } = await renderHook(() => useNoticeFormat('h', 'Home'));
    expect(result.current.text(event('spend_rule_changed', { before: {}, after: {} }))).toBe('Sam changed how spending is shared.');
  });

  it('names the account whose purpose changed, or says a joint account when the name is missing', async () => {
    const { result } = await renderHook(() => useNoticeFormat('h', 'Home'));
    expect(result.current.text(event('joint_purpose_changed', { account_name: 'Bills pot' }))).toBe('Sam changed what Bills pot is for.');
    expect(result.current.text(event('joint_purpose_changed'))).toBe('Sam changed what a joint account is for.');
  });
});
