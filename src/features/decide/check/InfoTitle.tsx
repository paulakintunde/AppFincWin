/**
 * 05-64 (D-70, UI-SPEC R6 rule I): a row title with its ⓘ. The label shrinks and wraps; the info button is the next flex
 * sibling, centred on the label's first line. The button comes from `useInfoSheet().button()` so closing the sheet returns
 * focus to it. The caller renders `handle.sheet` once.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '@/theme/layout';
import type { InfoSheetHandle } from '../ui/useInfoSheet';

const GLYPH = 16;

export interface InfoTitleProps {
  info: InfoSheetHandle;
  /** The title Text. */
  children: React.ReactNode;
  /** The title's line height, so the glyph sits on the first line. */
  lineHeight: number;
}

export function InfoTitle({ info, children, lineHeight }: InfoTitleProps): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.label}>{children}</View>
      <View style={{ marginLeft: space.gapSm, marginTop: Math.max(0, (lineHeight - GLYPH) / 2) }}>{info.button()}</View>
      {info.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', flexShrink: 1 },
  label: { flexShrink: 1 },
});
