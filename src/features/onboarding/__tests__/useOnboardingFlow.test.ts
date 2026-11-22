import { act, renderHook } from '@testing-library/react-native';
import { deriveIncomeShape } from '../deriveIncomeShape';
import { buildApply, featuresOn, progressOf, stepsFor, useOnboardingFlow } from '../useOnboardingFlow';

const mockSave = jest.fn();
const mockReplace = jest.fn();
const mockSetHome = jest.fn();
const mockTrack = jest.fn();
let mockSetup: Record<string, unknown> | null = null;
let mockConsent: { loading: boolean; consent: 'granted' | 'declined' | null } = { loading: false, consent: null };
let mockHolds: Record<string, boolean> = {};

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/features/levels/useUserSetup', () => ({ useUserSetup: () => ({ data: mockSetup, loading: false }) }));
jest.mock('@/data/mutations/userSetup', () => ({
  useSaveUserSetup: () => ({ saveUserSetup: (v: unknown) => mockSave(v) }),
  useReplaceFeatureSwitches: () => ({ replaceFeatureSwitches: (v: unknown) => mockReplace(v) }),
}));
jest.mock('@/features/consent/useConsent', () => ({ useConsent: () => mockConsent }));
jest.mock('@/features/levels/useHoldsData', () => ({ useHoldsData: () => mockHolds }));
jest.mock('@/data/queries/moneyPrefs', () => ({ useMoneyPrefs: () => ({ prefs: { home_currency: 'USD' } }) }));
jest.mock('@/data/mutations/moneyPrefs', () => ({ useUpdateMoneyPrefs: () => ({ setHomeCurrency: (c: string) => mockSetHome(c) }) }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: { income_types: ['salary_or_wages'], income_pattern: null } }) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockSetup = null;
  mockConsent = { loading: false, consent: null };
  mockHolds = {};
});

describe('stepsFor and progress', () => {
  it('first_run is 11 questions, analytics, summary', () => {
    expect(stepsFor('first_run')).toEqual(['goal', 'cur', 'acct', 'shape', 'inc', 'freq', 'debt', 'inv', 'share', 'watch', 'save', 'analytics', 'summary']);
  });
  it('first_run drops analytics once consent is answered', () => {
    expect(stepsFor('first_run', false)).not.toContain('analytics');
  });
  it('partner is 9 questions with no cur or share', () => {
    const s = stepsFor('partner');
    expect(s).toEqual(['goal', 'acct', 'shape', 'inc', 'freq', 'debt', 'inv', 'watch', 'save', 'analytics', 'summary']);
    expect(s).not.toContain('cur');
    expect(s).not.toContain('share');
  });
  it('rerun is 11 plus summary, never analytics', () => {
    const s = stepsFor('rerun');
    expect(s).not.toContain('analytics');
    expect(s).toHaveLength(12);
  });
  it('labels progress 3 of 11 and 3 of 9, and does not count analytics', () => {
    expect(progressOf('first_run', 'acct')).toEqual({ n: 3, total: 11 });
    expect(progressOf('partner', 'shape')).toEqual({ n: 3, total: 9 });
    expect(progressOf('first_run', 'analytics')).toBeNull();
  });
});

describe('deriveIncomeShape', () => {
  it('salary only with no season change is steady', () => {
    expect(deriveIncomeShape(['salary_or_wages'], null)).toBe('steady');
    expect(deriveIncomeShape(['salary_or_wages'], 'steady')).toBe('steady');
  });
  it('an irregular or self-employed value is lumpy', () => {
    expect(deriveIncomeShape(['salary_or_wages', 'freelance'], null)).toBe('lumpy');
    expect(deriveIncomeShape(['own_business'], null)).toBe('lumpy');
  });
  it('income that changes by season is lumpy', () => {
    expect(deriveIncomeShape(['salary_or_wages'], 'seasonal')).toBe('lumpy');
    expect(deriveIncomeShape(null, 'variable')).toBe('lumpy');
  });
});

describe('buildApply', () => {
  it('skipping everything is Everyday with source skipped', () => {
    const p = buildApply({ mode: 'first_run', answers: {}, homeCurrency: 'USD' });
    expect(p.level).toBe(2);
    expect(p.source).toBe('skipped');
    expect(p.allSkipped).toBe(true);
  });
  it('keeps features that hold records on in a re-run', () => {
    const p = buildApply({ mode: 'rerun', answers: { goal: 'track' }, homeCurrency: 'USD', holdsData: { savingsGoals: true } });
    expect(p.level).toBe(1);
    expect(p.switches.goals).toBe(true);
  });
  it('does not add hold-data switches on first run', () => {
    const p = buildApply({ mode: 'first_run', answers: { goal: 'track' }, homeCurrency: 'USD', holdsData: { savingsGoals: true } });
    expect(p.switches.goals).toBeUndefined();
  });
  it('counts features on with overrides', () => {
    expect(featuresOn(1, {})).toBe(5);
    expect(featuresOn(1, { goals: true })).toBe(6);
  });
});

describe('useOnboardingFlow', () => {
  it('skip stores no answer, advances and saves resume_step', async () => {
    const { result } = await renderHook(() => useOnboardingFlow({ mode: 'first_run' }));
    await act(async () => result.current.skip('goal'));
    expect(result.current.step).toBe('cur');
    expect(result.current.answers.goal).toBeUndefined();
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', patch: expect.objectContaining({ resumeStep: 'cur' }), baseVersion: 0 }));
    expect(mockTrack).toHaveBeenCalledWith('onboarding_question_answered', { step: 'goal', skipped: true });
  });

  it('an answer is kept and saved with the answers', async () => {
    const { result } = await renderHook(() => useOnboardingFlow({ mode: 'first_run' }));
    await act(async () => result.current.answer('goal', 'debt'));
    expect(result.current.answers.goal).toBe('debt');
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({ answers: { goal: 'debt' }, resumeStep: 'cur' }) }));
  });

  it('skipRest jumps to analytics when shown, else to the summary', async () => {
    const a = await renderHook(() => useOnboardingFlow({ mode: 'first_run' }));
    await act(async () => a.result.current.skipRest());
    expect(a.result.current.step).toBe('analytics');
    mockConsent = { loading: false, consent: 'granted' };
    const b = await renderHook(() => useOnboardingFlow({ mode: 'first_run' }));
    await act(async () => b.result.current.skipRest());
    expect(b.result.current.step).toBe('summary');
  });

  it('reopening starts at resume_step with answers kept', async () => {
    mockSetup = { version: 3, resumeStep: 'debt', answers: { goal: 'save' }, level: null };
    const { result } = await renderHook(() => useOnboardingFlow({ mode: 'first_run' }));
    expect(result.current.step).toBe('debt');
    expect(result.current.answers.goal).toBe('save');
  });

  it('back moves one step and keeps answers', async () => {
    const { result } = await renderHook(() => useOnboardingFlow({ mode: 'first_run' }));
    await act(async () => result.current.answer('goal', 'stop'));
    await act(async () => result.current.back());
    expect(result.current.step).toBe('goal');
    expect(result.current.answers.goal).toBe('stop');
  });

  it('apply (first run, all skipped) writes level 2, skipped source, switches and events', async () => {
    const { result } = await renderHook(() => useOnboardingFlow({ mode: 'first_run' }));
    let out: { level: number } | undefined;
    await act(async () => {
      out = result.current.apply();
    });
    expect(out).toEqual({ level: 2 });
    expect(mockReplace).toHaveBeenCalledWith({ userId: 'u1', map: {} });
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({ level: 2, levelSource: 'skipped', resumeStep: null }) }));
    expect(mockTrack).toHaveBeenCalledWith('onboarding_level_assigned', { level: '2', source: 'skipped' });
    expect(mockTrack).toHaveBeenCalledWith('onboarding_finished', { mode: 'first_run', skipped_all: true });
  });

  it('apply uses levelFor and applyOnb for real answers and writes the chosen home currency', async () => {
    const { result } = await renderHook(() => useOnboardingFlow({ mode: 'first_run' }));
    await act(async () => result.current.answer('goal', 'debt'));
    await act(async () => result.current.answer('cur', 'EUR'));
    await act(async () => {
      result.current.apply();
    });
    expect(mockReplace).toHaveBeenCalledWith({ userId: 'u1', map: { debts: true, payoffPlan: true } });
    expect(mockSave).toHaveBeenLastCalledWith(expect.objectContaining({ patch: expect.objectContaining({ level: 3, levelSource: 'answers' }) }));
    expect(mockSetHome).toHaveBeenCalledWith('EUR');
  });

  it('apply (rerun) tracks level_changed and writes nothing per step', async () => {
    mockSetup = { version: 2, level: 2, answers: { goal: 'stop' }, resumeStep: null };
    const { result } = await renderHook(() => useOnboardingFlow({ mode: 'rerun' }));
    await act(async () => result.current.answer('goal', 'debt'));
    expect(mockSave).not.toHaveBeenCalled();
    await act(async () => {
      result.current.apply();
    });
    expect(mockTrack).toHaveBeenCalledWith('level_changed', { from: '2', to: '3', source: 'rerun' });
    expect(mockSetHome).not.toHaveBeenCalled();
  });

  it('rerun keeps features that hold records on when the level drops', async () => {
    mockSetup = { version: 2, level: 3, answers: {}, resumeStep: null };
    mockHolds = { debts: true };
    const { result } = await renderHook(() => useOnboardingFlow({ mode: 'rerun' }));
    await act(async () => result.current.answer('goal', 'track'));
    await act(async () => {
      result.current.apply();
    });
    expect(mockReplace).toHaveBeenCalledWith({ userId: 'u1', map: expect.objectContaining({ debts: true }) });
  });

  it('keepWhatIHave writes nothing and returns the toast key', async () => {
    mockSetup = { version: 2, level: 3, answers: {}, resumeStep: null };
    const { result } = await renderHook(() => useOnboardingFlow({ mode: 'rerun' }));
    let out: { toastKey: string } | undefined;
    await act(async () => {
      out = result.current.keepWhatIHave();
    });
    expect(out).toEqual({ toastKey: 'onboarding.rerun.keepToast' });
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('abandoning the partner version leaves Everyday with no other write', async () => {
    const { result } = await renderHook(() => useOnboardingFlow({ mode: 'partner' }));
    await act(async () => result.current.abandon());
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ patch: { level: 2, levelSource: 'skipped', partnerVersion: true } }));
  });

  it('no analytics prop carries an amount', async () => {
    const { result } = await renderHook(() => useOnboardingFlow({ mode: 'first_run' }));
    await act(async () => result.current.answer('acct', { name: 'Main', balanceMinor: 123456 }));
    for (const call of mockTrack.mock.calls) expect(JSON.stringify(call[1])).not.toContain('123456');
  });
});
