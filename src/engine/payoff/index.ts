/**
 * Public API of `engine/payoff/`. Consumers: engine/decide in this phase;
 * Phase 6 Grow's payoff planner reuses amortise/futureValue/simulateMinimum.
 * Keep this surface stable.
 */
export * from './types';
export * from './constants';
export * from './amortise';
export * from './impliedApr';
export * from './futureValue';
export * from './simulateMinimum';
export * from './rateSchedule';
export * from './futureValuePath';
