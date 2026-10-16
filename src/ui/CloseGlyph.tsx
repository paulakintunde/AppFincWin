/**
 * UI-SPEC Design System: the shipped close / remove mark -- two crossed bars drawn from Views (Phase 0 convention: a small
 * rotated-border glyph, never an icon font or a literal "×"). Used by the Undo toast's dismiss control and by removable
 * chips. Purely decorative: the surrounding control carries the accessible name.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface CloseGlyphProps {
  color: string;
  testID?: string;
}

export function CloseGlyph({ color, testID }: CloseGlyphProps) {
  return (
    <View style={styles.glyph} testID={testID} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[styles.bar, { backgroundColor: color, transform: [{ rotate: '45deg' }] }]} />
      <View style={[styles.bar, { backgroundColor: color, transform: [{ rotate: '-45deg' }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: {
    width: 12,
    height: 12,
  },
  bar: {
    position: 'absolute',
    top: 5,
    left: 0,
    width: 12,
    height: 2,
    borderRadius: 1,
  },
});
