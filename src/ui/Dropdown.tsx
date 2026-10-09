/**
 * CONTEXT D-27: reusable anchored menu (title, radio-dot rows, optional sub-labels, pill or
 * settings-row trigger). Built to 02.2-UI-SPEC sections 1-2 because 03-UI-SPEC has no
 * dropdown contract; Phase 3 adopts this component unchanged.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { useReduceMotion } from '@/theme/motion';
import { textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';

export interface DropdownOption<K extends string> {
  key: K;
  label: string;
  subLabel?: string;
  triggerLabel?: string;
}

export interface DropdownProps<K extends string> {
  title: string;
  options: readonly DropdownOption<K>[];
  value: K;
  onSelect: (key: K) => void;
  triggerA11yLabel: string;
  disabled?: boolean;
  variant?: 'pill' | 'row';
  rowLabel?: string;
}

// Component geometry (not tokens): radio dot and chevron sizes.
const DOT_SIZE = 18;
const DOT_INNER = 8;
const CHEVRON_SIZE = 7;

export function Dropdown<K extends string>({
  title,
  options,
  value,
  onSelect,
  triggerA11yLabel,
  disabled = false,
  variant = 'pill',
  rowLabel,
}: DropdownProps<K>) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const reduced = useReduceMotion();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value);
  const currentLabel = current?.triggerLabel ?? current?.label ?? '';
  const label = textRole(pairing, 'label');
  const body = textRole(pairing, 'body');

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={triggerA11yLabel}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={
          variant === 'pill'
            ? [styles.pillTrigger, { backgroundColor: colors.fill1, opacity: disabled ? 0.5 : 1 }]
            : [styles.rowTrigger, { opacity: disabled ? 0.5 : 1 }]
        }
      >
        {variant === 'row' ? (
          <Text style={[body, styles.rowLabel, { color: colors.ink }]}>{rowLabel}</Text>
        ) : null}
        <Text style={{ ...label, color: variant === 'pill' ? colors.ink : colors.inkMuted }}>{currentLabel}</Text>
        <View style={[styles.chevron, { borderColor: colors.inkMuted }]} />
      </Pressable>
      <Modal
        transparent
        visible={open}
        animationType={reduced ? 'none' : 'fade'}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.scrim}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.close')}
          onPress={() => setOpen(false)}
        />
        <View pointerEvents="box-none" style={styles.menuWrap}>
          <View style={[styles.menu, { backgroundColor: colors.surface }]}>
            <Text style={{ ...label, color: colors.inkMuted, padding: space.rowPad }}>{title}</Text>
            {options.map((o) => {
              const selected = o.key === value;
              return (
                <Pressable
                  key={o.key}
                  accessibilityRole="button"
                  accessibilityLabel={o.subLabel ? `${o.label}, ${o.subLabel}` : o.label}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    hapticSelection();
                    setOpen(false);
                    onSelect(o.key);
                  }}
                  style={styles.option}
                >
                  <View
                    testID={`dropdown-dot-${o.key}`}
                    style={[styles.dot, { borderColor: selected ? colors.accent : colors.fill1 }]}
                  >
                    {selected ? <View style={[styles.dotInner, { backgroundColor: colors.accent }]} /> : null}
                  </View>
                  <View style={styles.optionText}>
                    <Text style={{ ...body, color: colors.ink }}>{o.label}</Text>
                    {o.subLabel ? <Text style={{ ...label, color: colors.inkMuted }}>{o.subLabel}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pillTrigger: {
    minHeight: space.touchMin,
    paddingHorizontal: space.cardPad,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapSm,
  },
  rowTrigger: {
    minHeight: space.touchMin,
    paddingVertical: space.rowPad,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapSm,
  },
  rowLabel: { flex: 1 },
  chevron: {
    width: CHEVRON_SIZE,
    height: CHEVRON_SIZE,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
  scrim: { ...StyleSheet.absoluteFill },
  menuWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: space.screenH },
  menu: { borderRadius: radii.card, overflow: 'hidden' },
  option: {
    minHeight: space.touchMin,
    paddingHorizontal: space.rowPad,
    paddingVertical: space.gapSm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
  },
  optionText: { flex: 1 },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotInner: { width: DOT_INNER, height: DOT_INNER, borderRadius: DOT_INNER / 2 },
});
