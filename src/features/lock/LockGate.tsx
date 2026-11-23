// 10-21 (ACC-08, ACC-09, DSG-08, D-02, D-04): the AppState-driven gate around the whole app.
//  - Lock on and the time has passed (or a cold start): the LockScreen replaces the app. The app behind it is NOT
//    mounted, so a screen reader cannot reach it and nothing is read aloud (T-10-21-01).
//  - The AppCover is always the top-most child, lock on or off, signed in or out (T-10-21-02).
//  - Signed out, the lock is a pass-through.
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { registerLockWipe } from '@/services/lock/lockStore';
import { AppCover } from './AppCover';
import { subscribeLockChanged } from './lockEvents';
import { LockScreen } from './LockScreen';
import { useLockController } from './useLockController';

// Sign-out and account deletion clear the lock with the rest of the phone's data.
registerLockWipe();

export function LockGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status } = useAuth();
  const c = useLockController();
  const { refresh } = c;

  useEffect(() => subscribeLockChanged(() => void refresh()), [refresh]);
  useEffect(() => {
    if (status === 'signedOut') void refresh();
  }, [status, refresh]);

  const settings = c.state?.settings;
  const showLock = status === 'signedIn' && c.locked && settings !== undefined && settings.enabled;

  return (
    <View style={styles.root}>
      {!c.ready ? null : showLock && settings ? <LockScreen settings={settings} onUnlock={c.unlock} /> : children}
      <AppCover visible={c.coverVisible || !c.ready} />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
