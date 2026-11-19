import { firstRunTarget, onboardingModeOf, setupDone, type FirstRunInput } from '../firstRun';

const base: FirstRunInput = {
  pendingInvite: null,
  setup: null,
  setupLoading: false,
  setupError: false,
  members: 1,
  isOwner: true,
};

describe('firstRunTarget', () => {
  it('a pending invite goes to join, before anything else', () => {
    expect(firstRunTarget({ ...base, pendingInvite: 'ABCD-EFGH-JKMN', setupLoading: true })).toBe('join');
    expect(firstRunTarget({ ...base, pendingInvite: 'ABCD-EFGH-JKMN', setupError: true })).toBe('join');
  });

  it('waits while the setup row loads', () => {
    expect(firstRunTarget({ ...base, setupLoading: true })).toBe('checking');
  });

  it('no setup row and not a partner: first run', () => {
    expect(firstRunTarget(base)).toEqual({ onboarding: 'first_run' });
  });

  it('a setup row not completed (resume) and not a partner: first run', () => {
    expect(firstRunTarget({ ...base, setup: { completedAt: null, partnerVersion: false, level: null } })).toEqual({
      onboarding: 'first_run',
    });
  });

  it('no setup row in a household they joined (others, not owner): partner', () => {
    expect(firstRunTarget({ ...base, members: 2, isOwner: false })).toEqual({ onboarding: 'partner' });
  });

  it('the owner of a shared household is not a partner', () => {
    expect(firstRunTarget({ ...base, members: 3, isOwner: true })).toEqual({ onboarding: 'first_run' });
  });

  it('a partner run started on another device resumes as partner', () => {
    expect(firstRunTarget({ ...base, setup: { completedAt: null, partnerVersion: true } })).toEqual({ onboarding: 'partner' });
  });

  it('completed setup (including a backfilled existing user) goes home', () => {
    expect(firstRunTarget({ ...base, setup: { completedAt: '2026-11-01T00:00:00Z', partnerVersion: false, level: 4 } })).toBe('home');
  });

  it('an abandoned partner run (level set, not completed) goes home on Everyday', () => {
    expect(firstRunTarget({ ...base, members: 2, isOwner: false, setup: { completedAt: null, partnerVersion: true, level: 2 } })).toBe(
      'home'
    );
  });

  it('a setup read error goes home, never traps the person', () => {
    expect(firstRunTarget({ ...base, setupError: true })).toBe('home');
  });
});

describe('helpers', () => {
  it('setupDone', () => {
    expect(setupDone(null)).toBe(false);
    expect(setupDone(undefined)).toBe(false);
    expect(setupDone({ completedAt: null, partnerVersion: false })).toBe(false);
    expect(setupDone({ completedAt: 'x', partnerVersion: false })).toBe(true);
    expect(setupDone({ completedAt: null, partnerVersion: true, level: 2 })).toBe(true);
  });

  it('onboardingModeOf', () => {
    expect(onboardingModeOf({ onboarding: 'partner' })).toBe('partner');
    expect(onboardingModeOf('home')).toBeNull();
  });
});
