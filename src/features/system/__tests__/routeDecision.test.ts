import { resolveRoute } from '../routeDecision';

describe('resolveRoute', () => {
  it('routes to update-required when the gate is blocked, even for a signed-in user', () => {
    expect(resolveRoute({ gate: 'blocked', auth: 'signedIn' })).toBe('update-required');
  });

  it('routes to update-required when the gate is blocked and auth is still loading', () => {
    expect(resolveRoute({ gate: 'blocked', auth: 'loading' })).toBe('update-required');
  });

  it('routes to welcome when the gate is ok and the user is signed out', () => {
    expect(resolveRoute({ gate: 'ok', auth: 'signedOut' })).toBe('welcome');
  });

  it('routes to app when the gate is ok and the user is signed in', () => {
    expect(resolveRoute({ gate: 'ok', auth: 'signedIn' })).toBe('app');
  });

  it('routes to splash while the gate is still checking', () => {
    expect(resolveRoute({ gate: 'checking', auth: 'signedOut' })).toBe('splash');
  });

  it('routes to splash while auth is still loading, even once the gate is ok', () => {
    expect(resolveRoute({ gate: 'ok', auth: 'loading' })).toBe('splash');
  });
});
