// NAV-01 / D-01 / D-02 / D-05 / D-22 / D-38. JS Tabs with the bespoke bar (CLAUDE.md: never
// unstable-native-tabs). backBehavior 'none' because BackHistoryProvider owns cross-tab back.
// Detail screens are OUTER-stack siblings of this group, so they cover the bar and the FAB. The
// first-account gate lives here so neither Home nor Activity renders without an account.
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import { needsFirstAccount } from '@/features/record/setup/firstAccountGate';
import { DECIDE_OPEN } from '@/features/decide/availability';
import { DecideShellHost } from '@/features/decide/DecideShellHost';
import { ShellEntryHost } from '@/features/record/entry/ShellEntryHost';
import { useRecordContext } from '@/features/record/useRecordContext';
import { Fab } from '@/shell/fab/Fab';
import { FabQuickMenu } from '@/shell/fab/FabQuickMenu';
import { TabBar } from '@/shell/tabBar/TabBar';
import { TabSlideIn } from '@/shell/tabBar/TabSlideIn';
import { availableTabs } from '@/shell/tabBar/availableTabs';
import { isTabId } from '@/shell/tabBar/tabs';

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
        screenOptions={{ headerShown: false, animation: 'none' }}
        screenLayout={({ children, route, navigation }) =>
          isTabId(route.name) ? (
            <TabSlideIn tab={route.name} navigation={navigation}>
              {children}
            </TabSlideIn>
          ) : (
            children
          )
        }
      >
        {availableTabs().map((id) => (
          <Tabs.Screen key={id} name={id} />
        ))}
      </Tabs>
      <Fab />
      <FabQuickMenu />
      <ShellEntryHost />
      {/* quick-261025-f46: its 'newCheck' registration feeds both the FAB quick menu and You > Add, so hiding it removes "New check" everywhere. */}
      {DECIDE_OPEN ? <DecideShellHost /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
