// NAV-01 / D-01 / D-02 / D-05 / D-22 / D-38. JS Tabs with the bespoke bar (CLAUDE.md: never
// unstable-native-tabs). backBehavior 'none' because BackHistoryProvider owns cross-tab back.
// Detail screens are OUTER-stack siblings of this group, so they cover the bar and the FAB. The
// first-account gate lives here so neither Home nor Activity renders without an account.
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import { needsFirstAccount } from '@/features/record/setup/firstAccountGate';
import { useRecordContext } from '@/features/record/useRecordContext';
import { Fab } from '@/shell/fab/Fab';
import { FabProvider } from '@/shell/fab/FabProvider';
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
  return (
    <FabProvider>
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
      </View>
    </FabProvider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
