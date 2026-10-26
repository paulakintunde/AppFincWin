/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'engine-only-internal-src',
      severity: 'error',
      comment: 'FND-04: engine/ may import only from engine/ inside src.',
      from: { path: '^src/engine' },
      to: { path: '^src/', pathNot: '^src/engine' },
    },
    {
      name: 'engine-no-reach-impure',
      severity: 'error',
      comment:
        'FND-04 transitive: nothing reachable from engine/ may be db/data/state/services/ui/features or react/react-native/expo.',
      from: { path: '^src/engine' },
      to: {
        path: '^src/(db|data|state|services|ui|features)|node_modules/(react|react-native|expo[^/]*|@supabase|posthog-react-native)/',
        reachable: true,
      },
    },
    {
      name: 'fx-fetch-only-from-writes',
      severity: 'error',
      comment:
        '02-DECISION-fx-on-demand.md item 5: only write paths may ask the server to fetch FX rates; balances, totals and Decide read stored rates only.',
      from: { pathNot: '^src/(db|data/mutations|data/sync)/' },
      to: { path: '^src/db/fxResolve' },
    },
    {
      name: 'fx-fetch-never-from-reads',
      severity: 'error',
      comment:
        '02-DECISION-fx-on-demand.md item 5: read hooks and the engine (incl. Phase 4 Decide) must not reach the fetch door, even through another module. 05-01: Decide snapshot builder and screens read stored rates only.',
      from: { path: '^src/(data/queries|engine|features/decide)/' },
      to: { path: '^src/db/fxResolve', reachable: true },
    },
    {
      name: 'decide-engine-barrel-only',
      severity: 'error',
      comment:
        '05-01 / DEC-12: Phase 5 reaches the Decide engine only through its public barrel (04-12). 05.1 (D-15): the v3 engine has its own barrel, v3/index.ts.',
      from: { path: '^src/', pathNot: '^src/engine/' },
      to: { path: '^src/engine/(decide|payoff)/(?!index\\.ts$|v3/index\\.ts$)' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '__tests__|\\.test\\.tsx?$' },
  },
};
