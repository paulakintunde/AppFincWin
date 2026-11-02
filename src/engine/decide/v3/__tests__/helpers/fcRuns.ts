// One place for fast-check run counts: FC_RUNS overrides; Stryker runs get a small cap.
export function fcRuns(defaultRuns: number): number {
  const override = Number(process.env.FC_RUNS);
  if (process.env.FC_RUNS && Number.isFinite(override) && override > 0) return override;
  if (process.env.STRYKER_MUTATOR_RUNNER) return Math.min(defaultRuns, 10);
  return defaultRuns;
}
