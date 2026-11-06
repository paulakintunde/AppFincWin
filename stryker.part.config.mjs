// 05.4-43 (D-172): one part of the sharded full mutation run (.github/workflows/mutation-full.yml).
// Same settings as stryker.config.mjs, but a part's own score covers only its slice, so the part never breaks the
// build: scripts/mutation-merge.mjs applies the 90% bar (D-174) to the merged score of every part.
import base from './stryker.config.mjs';

export default {
  ...base,
  thresholds: { ...base.thresholds, break: null },
  reporters: ['progress-append-only', 'json'],
};
