/**
 * 09-17 (TIER-09, owner Q2): a text-link write control keeps its place when the plan is read-only and gains the
 * pinLock mark before its words. Not hidden, not greyed: the tap opens the locked sheet that names the action.
 */
import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Glyph } from '@/ui/icons/Glyph';
import { space } from '@/theme/layout';

export function LockedLabel({ gated, color, children }: { gated: boolean; color: string; children: ReactNode }) {
  if (!gated) return <>{children}</>;
  return (
    <View style={styles.row}>
      <Glyph name="pinLock" size={16} color={color} testID="lock-mark" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm } });
