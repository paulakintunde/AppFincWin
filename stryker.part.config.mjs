// 05.4-43 (D-172): one part of the sharded full mutation run (.github/workflows/mutation-full.yml).
// Same settings as stryker.config.mjs, but a part's own score covers only its slice, so the part never breaks the
// build: scripts/mutation-merge.mjs applies the 90% bar (D-174) to the merged score of every part.
// MUTATORS_EXCLUDED (comma list of Stryker mutator names) leaves those mutators out of this part. Only re-runs of
// chosen entries (`--only`) set it, to run a function-wide BlockStatement apart from the rest of its stretch
// (scripts/mutation-shards.mjs planOnly).
import base from './stryker.config.mjs';

const excluded = (process.env.MUTATORS_EXCLUDED ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export default {
  ...base,
  ...(excluded.length > 0
    ? { mutator: { ...base.mutator, excludedMutations: [...(base.mutator?.excludedMutations ?? []), ...excluded] } }
    : {}),
  thresholds: { ...base.thresholds, break: null },
  reporters: ['progress-append-only', 'json'],
};
