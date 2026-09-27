/**
 * Public API of `engine/undo/`. Downstream plans (the data layer's undo mutation, plan
 * 02-09's server RPC contract, the History screen) import from here, not from the
 * individual files directly.
 */
export * from './types';
export * from './inverse';
