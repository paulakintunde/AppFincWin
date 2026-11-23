// 10-24 (D-14, UI-SPEC 4c): inside an archived month every write button stays in place and explains the restore step instead of
// writing. useWriteGate reads this context. A client promise, not a database rule: a queued write from another device is never
// refused (RESEARCH Pattern 9). The sheet is the app's own Sheet, small, declarative, with no haptic.
import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Pill } from '@/ui/Pill';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface ArchivedMonthGateValue {
  month: string;
  /** Opens the 'Restore to change this month' sheet. */
  openRestore: () => void;
}

const ArchivedMonthGateContext = createContext<ArchivedMonthGateValue | null>(null);

export interface ArchivedMonthGateProviderProps {
  month: string;
  onRestore: () => void;
  children: ReactNode;
}

export function ArchivedMonthGateProvider({ month, onRestore, children }: ArchivedMonthGateProviderProps): React.JSX.Element {
  const t = useT() as unknown as Translate;
  const { colors, pairing } = useTheme();
  const [visible, setVisible] = useState(false);
  const openRestore = useCallback(() => setVisible(true), []);
  const value = useMemo(() => ({ month, openRestore }), [month, openRestore]);
  const close = (): void => setVisible(false);
  return (
    <ArchivedMonthGateContext.Provider value={value}>
      {children}
      <Sheet visible={visible} onDismiss={close}>
        <View style={styles.column} testID="archived-restore-sheet">
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
            {t('system.archive.restoreSheetTitle')}
          </Text>
          <Pill
            label={t('system.archive.restoreMonth')}
            variant="primary"
            onPress={() => {
              close();
              onRestore();
            }}
          />
          <Pill label={t('system.archive.keepReading')} variant="secondary" onPress={close} />
        </View>
      </Sheet>
    </ArchivedMonthGateContext.Provider>
  );
}

/** The archived-month scope, or null outside one (write gates then behave as before). */
export function useArchivedMonthGate(): ArchivedMonthGateValue | null {
  return useContext(ArchivedMonthGateContext);
}

const styles = StyleSheet.create({ column: { gap: space.groupGap } });
