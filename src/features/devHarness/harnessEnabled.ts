// 05.4-34 (BO-03, APP-04; T-05.4-34-01, T-05.4-34-03): the dev harness gates. Read at call time so a test can switch them.
// The route (engine timing) opens in a dev build or a build made with EXPO_PUBLIC_PERF=1. The Record-as-bought harness writes
// real rows to the one production database, so it opens in a dev build only, never in a perf build.

/** True in a dev build, or in any build made with EXPO_PUBLIC_PERF=1. */
export function harnessEnabled(): boolean {
  return __DEV__ || process.env.EXPO_PUBLIC_PERF === '1';
}

/** True in a dev build only. */
export function boughtHarnessEnabled(): boolean {
  return __DEV__;
}
