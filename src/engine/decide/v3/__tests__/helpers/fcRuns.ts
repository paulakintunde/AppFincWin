// One place for fast-check run counts: FC_RUNS overrides; Stryker runs get a small cap.
export function fcRuns(defaultRuns: number): number {
  const override = Number(process.env.FC_RUNS);
  if (process.env.FC_RUNS && Number.isFinite(override) && override > 0) return override;
  if (process.env.STRYKER_MUTATOR_RUNNER) return Math.min(defaultRuns, 10);
  return defaultRuns;
}

// A property's "the draws reached this case at all" check only holds on a full run: under Stryker or FC_RUNS=10
// too few people are drawn. Hand-pinned tests cover those answers either way.
export function isFullRun(defaultRuns: number): boolean {
  return fcRuns(defaultRuns) >= 100;
}
