/**
 * 05-84 (D-79, UI-SPEC R15.1): one way to pay as a white card. The header is a radio (selected = an ink border and dot, no
 * ink fill) that also folds and unfolds the card: its name with the ⓘ, the status chips on a wrapping row, the "Needs:" line,
 * the folded summary and a chevron. Open, it holds that method's inputs and its "What it comes to" tile. On a decided check
 * the radio is announced disabled but the card still opens and closes (reading), so `disabled` is only ever announced here.
 */
import React, { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useT } from '@/i18n';
import { DURATION, useReduceMotion } from '@/theme/motion';
import { PRESSED_OPACITY, radii, size, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { needsText, type Needs } from '../../../copy/methodCardCopy';
import type { InfoKey } from '../../../copy/infoTerms';
import type { Translate } from '../../refText';
import { useScrollIntoView } from '../../../ui/scrollIntoView';
import { useInfoSheet } from '../../../ui/useInfoSheet';

const HEADER_MIN = 64;
const RING = 19;
const DOT = 9;
const BORDER = 1.5;
const CHEVRON_RIGHT = '45deg';
const CHEVRON_DOWN = '135deg';

export interface MethodCardProps {
  name: string;
  infoKey: InfoKey;
  selected: boolean;
  open: boolean;
  needs: Needs | null;
  /** The folded summary line; shown only while the card is folded. */
  summary: string | null;
  /** Engine status flags ("Not accepted", "Part on the card", "Below the price"). */
  chips: readonly string[];
  onHeaderPress: () => void;
  /** The "· Edit" route for a missing price or amount (step 1). */
  onEdit: () => void;
  readOnly: boolean;
  /** A stable handle for the card as a whole (header and body), for tests and Maestro. */
  testID?: string;
  children?: React.ReactNode;
}

export function MethodCard({ name, infoKey, selected, open, needs, summary, chips, onHeaderPress, onEdit, readOnly, testID, children }: MethodCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const reduced = useReduceMotion();
  const info = useInfoSheet(infoKey);
  const scrollIntoView = useScrollIntoView();
  const headerRef = useRef<View>(null);
  const needsLine = needs === null ? null : needsText(t as Translate, needs);

  const label = [
    name,
    t(selected ? 'decide.pay.card.selected' : 'decide.pay.card.notSelected'),
    ...(summary === null ? [] : [summary]),
    ...(needsLine === null ? [] : [t('decide.pay.card.a11yNeeds', { fields: needsLine.fields })]),
  ].join(', ');
  const edit = needs !== null && needs.edit && !readOnly;

  const actions = [info.aboutAction, ...(edit ? [{ name: 'edit', label: t('decide.pay.price.edit') }] : [])];
  const body = open ? (
    reduced ? (
      <View style={styles.body} onLayout={() => scrollIntoView(headerRef.current)}>
        {children}
      </View>
    ) : (
      <Animated.View style={styles.body} entering={FadeIn.duration(DURATION.entrance)} onLayout={() => scrollIntoView(headerRef.current)}>
        {children}
      </Animated.View>
    )
  ) : null;

  return (
    <View testID={testID} style={[styles.card, { backgroundColor: colors.surface, borderColor: selected ? colors.ink : colors.line1 }]}>
      <Pressable
        ref={headerRef}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected, expanded: open, disabled: readOnly }}
        accessibilityLabel={label}
        accessibilityHint={t(readOnly ? 'decide.pay.card.hintReadOnly' : 'decide.pay.card.hint')}
        accessibilityActions={actions}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'edit') onEdit();
          else info.onAccessibilityAction(e);
        }}
        onPress={onHeaderPress}
        style={({ pressed }) => [styles.header, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <View style={[styles.ring, { borderColor: selected ? colors.ink : colors.inkSoft3 }]}>
          {selected ? <View style={[styles.dot, { backgroundColor: colors.ink }]} /> : null}
        </View>
        <View style={styles.column}>
          <View style={styles.nameRow}>
            <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, flexShrink: 1 }}>{name}</Text>
            {info.button()}
          </View>
          {chips.length === 0 ? null : (
            <View style={styles.chips}>
              {chips.map((chip) => (
                <View key={chip} style={[styles.chip, { backgroundColor: colors.fill1 }]}>
                  <Text scale="capped" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.tabLabel, color: colors.inkDim }}>
                    {chip}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {needsLine === null ? null : (
            <View style={styles.needsRow}>
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{needsLine.line}</Text>
              {edit ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t('decide.pay.price.edit')} onPress={onEdit} style={styles.edit}>
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{`· ${t('decide.pay.price.edit')}`}</Text>
                </Pressable>
              ) : null}
            </View>
          )}
          {open || summary === null ? null : (
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{summary}</Text>
          )}
        </View>
        <View style={[styles.chevron, { borderColor: colors.inkSoft3, transform: [{ rotate: open ? CHEVRON_DOWN : CHEVRON_RIGHT }] }]} />
      </Pressable>
      {info.sheet}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: BORDER, padding: space.cardPad, gap: space.gapMd },
  header: { minHeight: HEADER_MIN, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  ring: { width: RING, aspectRatio: 1, borderRadius: radii.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, aspectRatio: 1, borderRadius: radii.pill },
  column: { flex: 1, flexShrink: 1, gap: space.gapSm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  chip: { paddingHorizontal: space.gapMd, paddingVertical: 2, borderRadius: radii.pill },
  needsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.gapSm },
  edit: { minHeight: space.touchMin, justifyContent: 'center' },
  chevron: { width: size.chevronCompact, aspectRatio: 1, borderTopWidth: 2, borderRightWidth: 2, flexShrink: 0 },
  body: { gap: space.gapMd },
});
