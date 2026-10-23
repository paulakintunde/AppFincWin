/**
 * UI-SPEC R6 rule I: the info button is the next flex sibling of its label, centred on the label's first line. Never
 * inline in a Text run, never absolutely positioned, never a negative margin.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '@/theme/layout';
import { InfoButton, type InfoTone } from './InfoButton';

const GLYPH = 16;

export interface InfoLabelProps {
  /** The label (a Text or a fragment of Texts). */
  children: React.ReactNode;
  term: string;
  onInfo: () => void;
  tone?: InfoTone;
  /** The label's line height, so the glyph centres on the first line. */
  lineHeight: number;
  gap?: number;
  buttonRef?: React.Ref<View>;
}

export function InfoLabel({
  children,
  term,
  onInfo,
  tone = 'light',
  lineHeight,
  gap = space.gapSm,
  buttonRef,
}: InfoLabelProps): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.label}>{children}</View>
      <View style={{ marginLeft: gap, marginTop: Math.max(0, (lineHeight - GLYPH) / 2) }}>
        <InfoButton term={term} onPress={onInfo} tone={tone} buttonRef={buttonRef} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  label: { flexShrink: 1 },
});
