/**
 * 05-101 / 05-109 (D-87, R16.3): one running-cost row with the dashed Amount field. The D-33 prompt rows and a user-added cost
 * whose amount is still empty share it. A 44-wide checkbox column is reserved from the start (empty until an amount exists),
 * "Counted once an amount is typed" sits under the name while empty, a press anywhere on the row focuses the field, and the
 * checkbox keeps its own 44 target once shown. An optional remove control follows the field (user-added costs only).
 */
import React, { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { useFontScale } from '@/theme/FontScaleProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import type { TextInput } from '@/ui/TextInput';
import { hapticSelection } from '@/ui/haptics';
import { MoneyInput } from '../../../ui/MoneyInput';
import { STACK_FONT_SCALE, useShouldStack } from '../../../ui/textFit';

const FIELD_WIDTH = 112; // R16.3: the Amount field at 1.0x, growing with the text scale
const BOX_SIZE = 22;
const BOX_BORDER = 1.5;
const BOX_RADIUS = 6;
// IN-D06: the remove mark is a short dash, as in CheckRow
const REMOVE_MARK = { width: 12, height: 2, radius: 1 } as const;

/** R16.3: the Amount field's width, 112 at 1.0x and growing with the text scale; undefined (full width) once the row stacks. */
export function useFieldWidth(): number | undefined {
  const stacked = useShouldStack();
  const scale = useFontScale();
  return stacked ? undefined : Math.round(FIELD_WIDTH * Math.min(Math.max(scale, 1), STACK_FONT_SCALE));
}

export interface AmountRowProps {
  name: string;
  /** The row's current amount in minor units (0 or less = empty). */
  amount: number;
  counted: boolean;
  note: string;
  currency: string;
  /** Formats the amount for the counted / not-counted labels. */
  format: (minor: number) => string;
  readOnly: boolean;
  /** The typed amount, null while empty or invalid. */
  onAmountChange: (minor: number | null) => void;
  onToggleCounted: () => void;
  onRemove?: () => void;
  removeA11yLabel?: string;
}

export function AmountRow({ name, amount, counted, note, currency, format, readOnly, onAmountChange, onToggleCounted, onRemove, removeA11yLabel }: AmountRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const fieldRef = useRef<TextInput>(null);
  const stacked = useShouldStack();
  const fieldWidth = useFieldWidth();
  const hasAmount = amount > 0;
  const isCounted = hasAmount && counted;
  const amountText = hasAmount ? format(amount) : '';
  const sub = !hasAmount ? t('decide.depth.running.typeToCount') : !counted ? t('decide.depth.running.notCounted') : note !== '' ? note : null;
  const checkboxLabel = hasAmount
    ? isCounted
      ? t('decide.depth.running.rowA11yCounted', { name, amount: amountText })
      : `${name}, ${amountText}, ${t('decide.depth.running.notCounted')}`
    : undefined;

  return (
    // R16.3: a press anywhere on the row focuses the Amount field; the row itself is not a focus stop
    <Pressable accessible={false} disabled={readOnly} onPress={() => fieldRef.current?.focus()} style={[styles.row, stacked && styles.rowStacked]}>
      <View style={styles.main}>
        <View style={styles.checkboxColumn}>
          {hasAmount ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isCounted, disabled: readOnly }}
              accessibilityLabel={checkboxLabel}
              disabled={readOnly}
              onPress={() => {
                hapticSelection();
                onToggleCounted();
              }}
              style={({ pressed }) => [styles.checkboxTarget, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <View
                style={[
                  styles.box,
                  { borderColor: isCounted ? colors.ink : colors.line4, backgroundColor: isCounted ? colors.ink : 'transparent' },
                ]}
              />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.nameBlock} {...(hasAmount ? {} : { accessible: true, accessibilityLabel: t('decide.depth.running.rowA11yEmpty', { name }) })}>
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>{name}</Text>
          {sub ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{sub}</Text> : null}
        </View>
      </View>
      <View style={[styles.fieldWrap, stacked && styles.fieldWrapStacked]}>
        <View style={stacked ? styles.fieldGrow : undefined}>
          <MoneyInput
            value={hasAmount ? amount : null}
            currency={currency}
            onChange={onAmountChange}
            label={t('decide.costs.aMonth')}
            accessibilityLabel={t('decide.depth.running.amountFieldA11y', { name })}
            placeholder={t('decide.depth.running.amountPlaceholder')}
            readOnly={readOnly}
            amountField={{ width: fieldWidth }}
            inputRef={fieldRef}
          />
        </View>
        {onRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={removeA11yLabel}
            accessibilityState={{ disabled: readOnly }}
            disabled={readOnly}
            onPress={onRemove}
            style={styles.remove}
          >
            <View style={[styles.removeBar, { backgroundColor: colors.inkDim }]} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: space.gapSm },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  checkboxColumn: { width: space.touchMin, minHeight: space.touchMin },
  checkboxTarget: { width: space.touchMin, minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  box: { width: BOX_SIZE, aspectRatio: 1, borderRadius: BOX_RADIUS, borderWidth: BOX_BORDER },
  nameBlock: { flex: 1 },
  fieldWrap: { flexDirection: 'row', alignItems: 'center' },
  fieldWrapStacked: { alignSelf: 'stretch' },
  fieldGrow: { flex: 1 },
  remove: { width: space.touchMin, height: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  removeBar: { width: REMOVE_MARK.width, height: REMOVE_MARK.height, borderRadius: REMOVE_MARK.radius },
});
