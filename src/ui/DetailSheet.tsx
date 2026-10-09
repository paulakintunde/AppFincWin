/**
 * CONTEXT D-27 / 02.2-UI-SPEC section 5: read-only detail sheet shell (header slot,
 * label/value rows, stacked actions). Built on Sheet; Phase 3 swaps Sheet internals and
 * keeps these props. Deliberately no bottom-sheet library import.
 */
import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Sheet, SheetScroll } from './Sheet';

export interface DetailSheetProps {
  visible: boolean;
  onDismiss: () => void;
  accessibilityLabel: string;
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}

export function DetailSheet({
  visible,
  onDismiss,
  accessibilityLabel,
  leading,
  title,
  subtitle,
  trailing,
  note,
  children,
  actions,
}: DetailSheetProps) {
  const { colors, pairing } = useTheme();
  return (
    <Sheet visible={visible} onDismiss={onDismiss} accessibilityLabel={accessibilityLabel}>
      <View style={styles.header}>
        {leading}
        <View style={styles.headerText}>
          <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{title}</Text>
          {subtitle ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{subtitle}</Text> : null}
        </View>
        {trailing}
      </View>
      <SheetScroll>
        {note}
        {children}
      </SheetScroll>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </Sheet>
  );
}

export interface DetailRowProps {
  label: string;
  value: string | null;
  tone?: 'ink' | 'accent' | 'danger' | 'inkMuted';
  emptyText: string;
}

export function DetailRow({ label, value, tone = 'ink', emptyText }: DetailRowProps) {
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.fill1 }]}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{label}</Text>
      <Text style={{ ...textRole(pairing, 'body'), color: colors[tone] }}>{value ?? emptyText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingBottom: space.cardPad },
  headerText: { flex: 1 },
  row: {
    paddingVertical: space.rowPadDense,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.gapMd,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actions: { gap: space.gapSm, paddingTop: space.cardPad },
});
