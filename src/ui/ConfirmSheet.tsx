/**
 * UI-SPEC Design System: the shared destructive/blocking confirmation sheet, built on
 * Sheet + Pill (T-02-19-01: destructive actions always render danger-styled and require
 * this explicit confirmation where the UI-SPEC calls for one).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Sheet } from './Sheet';
import { Pill } from './Pill';

export interface ConfirmSheetProps {
  visible: boolean;
  title?: string;
  body?: string;
  /** 05 D-73: a component body (e.g. a list) rendered after the body text. */
  children?: React.ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Swipe-down or back dismissal; defaults to onCancel so a prompt can treat dismissal differently from Cancel. */
  onDismiss?: () => void;
}

export function ConfirmSheet({
  visible,
  title,
  body,
  children,
  cancelLabel,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
  onDismiss,
}: ConfirmSheetProps) {
  const { colors, pairing } = useTheme();
  const bodyStyle = { ...textRole(pairing, 'body'), color: colors.ink };

  return (
    <Sheet visible={visible} onDismiss={onDismiss ?? onCancel}>
      <View style={styles.column}>
        {title ? (
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
            {title}
          </Text>
        ) : null}
        {body !== undefined ? <Text style={bodyStyle}>{body}</Text> : null}
        {children}
        <View style={styles.actions}>
          <Pill label={cancelLabel} variant="secondary" onPress={onCancel} />
          <Pill label={confirmLabel} variant={destructive ? 'danger' : 'primary'} onPress={onConfirm} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: space.groupGap,
  },
  actions: {
    flexDirection: 'row',
    gap: space.gapMd,
  },
});
