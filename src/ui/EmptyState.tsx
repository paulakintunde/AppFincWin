/**
 * UI-SPEC Design System: the shared empty-state block (Activity/Accounts/Categories with
 * no rows) -- a heading (body role) and a body line (label role, muted).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export interface EmptyStateProps {
  heading: string;
  body: string;
}

export function EmptyState({ heading, body }: EmptyStateProps) {
  const { colors, pairing } = useTheme();
  const headingStyle = { ...textRole(pairing, 'body'), color: colors.ink };
  const bodyStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  return (
    <View style={styles.container}>
      <Text style={headingStyle}>{heading}</Text>
      <Text style={bodyStyle}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: space.gapSm,
  },
});
