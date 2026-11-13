// NAV-01 / D-01 / D-02 / D-05 / D-22 / D-38. JS Tabs with the bespoke bar (CLAUDE.md: never
// unstable-native-tabs). backBehavior 'none' because BackHistoryProvider owns cross-tab back.
// Detail screens are OUTER-stack siblings of this group, so they cover the bar and the FAB. The
// first-account gate lives here so neither Home nor Activity renders without an account.
import { Profiler } from 'react';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import { needsFirstAccount } from '@/features/record/setup/firstAccountGate';
import { DECIDE_OPEN } from '@/features/decide/availability';
import { DecideShellHost } from '@/features/decide/DecideShellHost';
import { DecideShadowHost } from '@/features/decide/shadow/DecideShadowHost';
import { ShellEntryHost } from '@/features/record/entry/ShellEntryHost';
import { useRecordContext } from '@/features/record/useRecordContext';
import { Fab } from '@/shell/fab/Fab';
import { FabQuickMenu } from '@/shell/fab/FabQuickMenu';
import { TabBar } from '@/shell/tabBar/TabBar';
import { TabSlideIn } from '@/shell/tabBar/TabSlideIn';
import { availableTabs, isTabAvailable } from '@/shell/tabBar/availableTabs';
import { isTabId } from '@/shell/tabBar/tabs';
import { perfEnabled } from '@/features/decide/perf/perfMarks';
import { probeCommit } from '@/data/perf/cacheProbe';
import { DecideV3Scope } from '@/data/queries/decideV3';

export default function TabsLayout() {
  const rc = useRecordContext();
  const accounts = useAccounts(rc.householdId ?? undefined);
  const gate = needsFirstAccount({
    loading: !rc.ready || accounts.isLoading,
    isError: accounts.isError,
    accounts: accounts.data,
  });
  if (gate) return <Redirect href="/setup/account" />;
  // FabProvider is mounted in app/(app)/_layout.tsx so You, an outer-stack screen, reads the same quick actions.
  return (
    <View style={styles.fill}>
      <Tabs
        backBehavior="none"
        tabBar={(props) => <TabBar {...props} />}
        // 06.1-73 (DB-1): an unfocused tab no longer re-renders on every cache change (27-28 hidden Home commits per Decide
        // write on the emulator). It renders again, with the latest data, when it is focused.
        screenOptions={{ headerShown: false, animation: 'none', freezeOnBlur: true }}
        screenLayout={({ children, route, navigation }) => {
          // 06.1-72 (G-73-1): Decide home's hooks share one run of the Decide reads.
          const content = DECIDE_OPEN && route.name === 'decide' ? <DecideV3Scope>{children}</DecideV3Scope> : children;
          const screen = isTabId(route.name) ? (
            <TabSlideIn tab={route.name} navigation={navigation}>
              {content}
            </TabSlideIn>
          ) : (
            content
          );
          // 06.1-73: perf builds count each tab's commits (route name only); otherwise the screen renders as before.
          return perfEnabled() ? (
            <Profiler id={`tab.${route.name}`} onRender={probeCommit}>
              {screen}
            </Profiler>
          ) : (
            screen
          );
        }}
      >
        {availableTabs().map((id) => (
          <Tabs.Screen key={id} name={id} />
        ))}
        {/* 06-15: grow.tsx exists before the tab opens (D-03); href null keeps it unlisted and unlinkable until 06-20 flips TAB_AVAILABILITY.grow */}
        {isTabAvailable('grow') ? null : <Tabs.Screen name="grow" options={{ href: null }} />}
      </Tabs>
      <Fab />
      <FabQuickMenu />
      <ShellEntryHost />
      {/* quick-261025-f46: its 'newCheck' registration feeds both the FAB quick menu and You > Add, so hiding it removes "New check" everywhere. */}
      {DECIDE_OPEN ? <DecideShellHost /> : null}
      {/* 05.4-36 BO-08: quiet shadow runs for consenting testers only (profiles.decide_shadow); renders nothing, also while Decide is off. */}
      <DecideShadowHost />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
