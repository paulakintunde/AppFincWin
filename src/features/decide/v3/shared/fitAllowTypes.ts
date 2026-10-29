// 05.3: per-area text-fit allowlists. Each src/features/decide/v3/<area>/__tests__/fitAllow.ts exports FIT_ALLOW;
// decideTextFit.test.ts merges them with its inline lists. Paths are relative to src/features/decide.
export interface NumberAllow {
  readonly path: string;
  readonly kind: 'figure' | 'user-name' | 'input' | 'forwarded';
  readonly count: number;
  readonly reason: string;
}
export interface CountAllow {
  readonly path: string;
  readonly count: number;
  readonly reason: string;
}
export interface FitAllow {
  readonly number: readonly NumberAllow[];
  readonly geometry: readonly CountAllow[];
  readonly overlay: readonly CountAllow[];
}
