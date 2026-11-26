import { renderHook } from '@testing-library/react-native';
import { useArchiveState } from '../useArchiveState';

const mockAccess = { on: true };
const mockMonths: { data: string[] | undefined } = { data: ['2026-08', '2026-07'] };
const mockArchive = jest.fn();
const mockRestore = jest.fn();

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => ({ members: 2 }) }));
jest.mock('@/features/levels/useFeatureAccess', () => ({ useFeatureAccess: () => mockAccess }));
jest.mock('@/data/queries/archivedMonths', () => ({ useArchivedMonths: () => mockMonths }));
jest.mock('@/data/mutations/archivedMonths', () => ({
  useArchiveMonth: () => ({ archiveMonth: mockArchive }),
  useRestoreMonth: () => ({ restoreMonth: mockRestore }),
}));

describe('useArchiveState', () => {
  beforeEach(() => {
    mockAccess.on = true;
    mockMonths.data = ['2026-08', '2026-07'];
    mockArchive.mockClear();
    mockRestore.mockClear();
  });

  it('returns the person own archived months as a set when enabled', async () => {
    const { result } = await renderHook(() => useArchiveState());
    expect(result.current.enabled).toBe(true);
    expect([...result.current.archived].sort()).toEqual(['2026-07', '2026-08']);
    expect(result.current.count).toBe(2);
    expect(result.current.shared).toBe(true);
  });

  it('is empty when the feature is off (archived months show normally)', async () => {
    mockAccess.on = false;
    const { result } = await renderHook(() => useArchiveState());
    expect(result.current.enabled).toBe(false);
    expect(result.current.archived.size).toBe(0);
    expect(result.current.count).toBe(0);
  });

  it('is empty while the query has no data', async () => {
    mockMonths.data = undefined;
    const { result } = await renderHook(() => useArchiveState());
    expect(result.current.archived.size).toBe(0);
  });

  it('archive and restore call the 10-03 mutations with the signed-in user', async () => {
    const { result } = await renderHook(() => useArchiveState());
    result.current.archive('2026-06');
    result.current.restore('2026-08');
    expect(mockArchive).toHaveBeenCalledWith({ userId: 'u1', month: '2026-06' });
    expect(mockRestore).toHaveBeenCalledWith({ userId: 'u1', month: '2026-08' });
  });
});
