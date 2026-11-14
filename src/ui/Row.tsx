/**
 * UI-SPEC Design System: the shared list row, used for every settings-style, field-picker and list row.
 * 06.2 D-09: two heights, slots, real arrow. A row is at least 52 tall with one line and 64 with two (minimum heights;
 * text still grows at large font sizes). Left to right: optional leading slot (a 36 IconTile, avatar or ring), gap 12,
 * the title and second line, the value or amount, at most one small status (D-06), then the arrow icon.
 * Row knows no categories: callers pass an IconTile in `leading`.
 */
import React, { isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Glyph } from '@/ui/icons/Glyph';
import { IconTile } from '@/ui/icons/IconTile';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSize, rowHeight, space, step, tile } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export type RowAmountTone = 'ink' | 'positive' | 'danger';

export interface RowProps {
  label: string;
  value?: string;
  leading?: ReactNode;
  chevron?: boolean;
  dense?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** S-IN-09: a choice row's selected state, announced as such rather than only as a check mark. */
  selected?: boolean;
  /** REC-22: an optional second line under the label (meta size), e.g. a category's usage. */
  sublabel?: string;
  sublabelTone?: 'inkMuted' | 'warn1';
  /** A row that shows its value but cannot be opened (announced disabled). */
  disabled?: boolean;
  /** D-31: opt in to the bodyStrong role for the label (card item names). Settings and field rows leave it off. */
  emphasis?: boolean;
  /** 06.2 D-09: the amount slot, right-aligned, tabular, bodyStrong. A caller showing money in passes its leading '+' (D-14). */
  amount?: string;
  /** 'positive' draws the accent (money in); 'danger' only for over cap, short or debt (D-14). Spending stays ink. */
  amountTone?: RowAmountTone;
  /** 06.2 D-06: at most one small status (a StatusBadge), after the amount. */
  status?: ReactNode;
  /** The status word spoken in the row's sentence when the row is pressable. */
  statusText?: string;
}

export function Row({
  label,
  value,
  leading,
  chevron = false,
  dense = false,
  onPress,
  accessibilityLabel,
  selected,
  sublabel,
  sublabelTone = 'inkMuted',
  disabled = false,
  emphasis = false,
  amount,
  amountTone = 'ink',
  status,
  statusText,
}: RowProps) {
  const { colors, pairing } = useTheme();
  const labelStyle = { ...textRole(pairing, emphasis ? 'bodyStrong' : 'body'), color: colors.ink };
  const valueStyle = { ...textRole(pairing, 'body'), color: colors.inkMuted };
  const amountColor = amountTone === 'positive' ? colors.accent : amountTone === 'danger' ? colors.danger : colors.ink;
  const amountStyle = {
    ...textRole(pairing, 'bodyStrong'),
    color: amountColor,
    fontVariant: ['tabular-nums' as const],
    textAlign: 'right' as const,
  };
  // Dense rows are field rows: they keep their padding and the one-line height.
  const minHeight = sublabel && !dense ? rowHeight.two : rowHeight.one;
  const isTile = isValidElement(leading) && leading.type === IconTile;

  const content = (
    <View style={[styles.row, { paddingVertical: dense ? space.rowPadDense : step.tight }]}>
      {leading ? (
        <View testID="row-leading" style={isTile ? styles.leadingTile : styles.leading}>
          {leading}
        </View>
      ) : null}
      {sublabel ? (
        <View style={styles.label}>
          <Text style={labelStyle}>{label}</Text>
          <Text style={{ ...textRole(pairing, 'label'), color: colors[sublabelTone] }}>{sublabel}</Text>
        </View>
      ) : (
        <Text style={[styles.label, labelStyle]}>{label}</Text>
      )}
      {value ? <Text style={valueStyle}>{value}</Text> : null}
      {amount ? (
        <Text testID="row-amount" style={amountStyle}>
          {amount}
        </Text>
      ) : null}
      {status ? <View testID="row-status">{status}</View> : null}
      {chevron ? <Glyph name="arrowRight" size={iconSize.inline} color={colors.inkFaint} /> : null}
    </View>
  );

  if (onPress) {
    // The row is read as one sentence: title, second line, amount, status word.
    const spoken = [label, sublabel, amount, statusText].filter((s): s is string => typeof s === 'string' && s !== '').join(', ');
    return (
      <Pressable
        testID="row-root"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? spoken}
        // C-WR-08: the label above overrides the child text, so the current selection would
        // otherwise never be announced ("Category, button"). Expose it as the value instead.
        accessibilityValue={value ? { text: value } : undefined}
        accessibilityState={selected === undefined && !disabled ? undefined : { ...(selected === undefined ? {} : { selected }), ...(disabled ? { disabled: true } : {}) }}
        disabled={disabled ? true : undefined}
        onPress={onPress}
        style={[styles.root, { minHeight }]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View testID="row-root" style={[styles.root, { minHeight }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: step.row,
  },
  leading: {
    justifyContent: 'center',
  },
  leadingTile: {
    width: tile.row,
    height: tile.row,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
});
