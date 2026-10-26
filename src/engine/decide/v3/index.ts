/**
 * Public API of engine/decide/v3 (05.1). The only path features/ may import (depcruise decide-engine-barrel-only).
 * Never re-exported from ../index.ts: the old barrel surface is pinned by engineBarrel.test.ts and public-api.test.ts,
 * and the old engine is deleted 2 weeks after switch-on (D-16).
 */
export type * from './types';
export * from './constants';
