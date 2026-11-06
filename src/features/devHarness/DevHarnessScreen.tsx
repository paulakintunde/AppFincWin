// 05.4-34 (BO-03, APP-04): the dev harness screen, reached only by its deep link (decide, dev harness route) in a dev or perf
// build (route gate: harnessEnabled). Linked from nowhere. The Record-as-bought harness shows in dev builds only.
import { Redirect } from 'expo-router';
import { APP_HOME_HREF } from '@/features/auth/appHome';
import { Screen } from '@/ui/Screen';
import { BoughtWriteHarness } from './BoughtWriteHarness';
import { EnginePerfHarness } from './EnginePerfHarness';
import { boughtHarnessEnabled, harnessEnabled } from './harnessEnabled';

export function DevHarnessScreen() {
  if (!harnessEnabled()) return <Redirect href={APP_HOME_HREF} />;
  return (
    <Screen scroll>
      <EnginePerfHarness />
      {boughtHarnessEnabled() ? <BoughtWriteHarness /> : null}
    </Screen>
  );
}
