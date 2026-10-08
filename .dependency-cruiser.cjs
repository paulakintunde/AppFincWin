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
