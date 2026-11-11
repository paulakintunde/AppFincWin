/**
 * 06.1-21 (D02, D-12, D-21): the collapsed "More details" row on Decide home, expanding in place (260 ms; Reduce Motion: no
 * animation, the chevron just flips). Inside: how you pay, the optional "Need or want?" choice (it only reorders the options and nothing else
 * is asked), and the quick estimates for this check only (one dashed tile per QUICK_LINE_KINDS entry, with the lines
 * added so far). Presentational: the choices come in as props and the caller opens the sheets.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { QuickLine } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { DURATION, EASING, useReduceMotion } from '@/theme/motion';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { SegmentedToggle } from '@/ui/SegmentedToggle';
import { Text } from '@/ui/Text';
import { hapticSelection } from '@/ui/haptics';
import { QUICK_LINE_KINDS, type QuickLineKind } from '../sheets/quickLineKinds';

export type PayChoice = 'once' | 'plan';
export type PurposeChoice = 'need' | 'want' | null;

export interface MoreDetailsProps {
  open: boolean;
  onToggle: () => void;
  payMode: PayChoice;
  onPay: (mode: PayChoice) => void;
  purpose: PurposeChoice;
  onPurpose: (choice: PurposeChoice) => void;
  quickLines: readonly QuickLine[];
  onAddQuick: (kind: QuickLineKind) => void;
  onEditQuick: (line: QuickLine) => void;
  onRemoveQuick: (line: QuickLine) => void;
  /** At the cap of quick lines the tiles stop (the parser keeps 8). */
  quickFull: boolean;
  formatMoney: (minor: number) => string;
}

const TILE_KEY = { expense: 'tileExpense', loan: 'tileLoan', savings: 'tileSavings', income: 'tileIncome' } as const;
const TILE_A11Y = { expense: 'tileExpenseA11y', loan: 'tileLoanA11y', savings: 'tileSavingsA11y', income: 'tileIncomeA11y' } as const;
const EVERY_KEY = { 0: 'once', 1: 'everyMonth', 3: 'every3Months', 12: 'everyYear' } as const;

function Chevron({ open }: { open: boolean }) {
  const { colors } = useTheme();
  // The Row convention: a small bordered square, turned. Down when closed, up when open.
  return <View style={[styles.chevron, { borderColor: colors.inkFaint, transform: [{ rotate: open ? '-45deg' : '135deg' }] }]} />;
}

export function MoreDetails(props: MoreDetailsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const reduced = useReduceMotion();
  const progress = useSharedValue(props.open ? 1 : 0);
  useEffect(() => {
    progress.value = reduced ? (props.open ? 1 : 0) : withTiming(props.open ? 1 : 0, { duration: DURATION.sheetUp, easing: EASING });
  }, [props.open, reduced, progress]);
  const fade = useAnimatedStyle(() => ({ opacity: progress.value }));
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };

  const method = props.payMode === 'plan' ? t('decide.screens.common.installments') : t('decide.screens.common.cash');
  const sub = props.quickLines.length > 0 ? t('decide.screens.home.check.moreDetailsOpen', { method, count: props.quickLines.length }) : t('decide.screens.home.check.moreDetailsSub');

  const lineText = (l: QuickLine): string => {
    const kindWord = t(`decide.screens.home.moreDetails.${TILE_KEY[l.kind]}`);
    const amount = l.kind === 'loan' ? l.monthly : l.amount;
    const every = l.kind === 'expense' || l.kind === 'income' ? t(`decide.screens.home.moreDetails.${EVERY_KEY[l.everyMonths]}`) : null;
    return [l.name, kindWord, every, props.formatMoney(Number(amount))].filter((x): x is string => x !== null && x !== '').join(' · ');
  };

  return (
    <View testID="more-details" style={styles.wrap}>
      <Pressable
        testID="more-details-row"
        accessibilityRole="button"
        accessibilityState={{ expanded: props.open }}
        accessibilityLabel={`${t('decide.screens.home.check.moreDetails')}. ${sub}`}
        onPress={() => {
          hapticSelection();
          props.onToggle();
        }}
        style={[styles.row, { backgroundColor: colors.fill6 }]}
      >
        <View style={styles.rowText}>
          <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.home.check.moreDetails')}</Text>
          <Text style={small}>{sub}</Text>
        </View>
        <Chevron open={props.open} />
      </Pressable>

      {props.open ? (
        <Animated.View testID="more-details-body" style={[styles.body, fade]}>
          <View style={styles.group}>
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.home.moreDetails.howYouPay')}</Text>
            <SegmentedToggle
              accessibilityLabel={t('decide.screens.home.moreDetails.howYouPay')}
              value={props.payMode === 'plan' ? 'plan' : 'cash'}
              onChange={(key) => props.onPay(key === 'plan' ? 'plan' : 'once')}
              options={[
                { key: 'cash', label: t('decide.screens.common.cash') },
                { key: 'plan', label: t('decide.screens.common.installments') },
              ]}
            />
          </View>

          <View style={styles.group}>
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.home.moreDetails.needOrWant')}</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.home.moreDetails.needOrWant')} style={styles.chips}>
              <Chip label={t('decide.screens.home.moreDetails.need')} selected={props.purpose === 'need'} onPress={() => props.onPurpose('need')} />
              <Chip label={t('decide.screens.home.moreDetails.want')} selected={props.purpose === 'want'} onPress={() => props.onPurpose('want')} />
              <Chip label={t('decide.screens.home.moreDetails.notSet')} selected={props.purpose === null} onPress={() => props.onPurpose(null)} />
            </View>
            <Text style={small}>{t('decide.screens.home.moreDetails.needOrWantNote')}</Text>
          </View>

          <View style={styles.group}>
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.home.moreDetails.quickEstimates')}</Text>
            <Text style={small}>{t('decide.screens.home.moreDetails.quickEstimatesNote')}</Text>
            {props.quickLines.map((l) => (
              <View key={l.id} style={[styles.line, { backgroundColor: colors.fill6 }]}>
                <Pressable
                  testID={`quick-line-${l.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('decide.screens.home.moreDetails.editA11y', { item: l.name })}
                  onPress={() => props.onEditQuick(l)}
                  style={styles.lineMain}
                >
                  <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{lineText(l)}</Text>
                </Pressable>
                <Pressable
                  testID={`quick-remove-${l.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('decide.screens.home.moreDetails.removeA11y', { item: l.name })}
                  onPress={() => props.onRemoveQuick(l)}
                  style={styles.remove}
                >
                  <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{'×'}</Text>
                </Pressable>
              </View>
            ))}
            <View style={styles.tiles}>
              {QUICK_LINE_KINDS.map((kind) => (
                <Pressable
                  key={kind}
                  testID={`quick-tile-${kind}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: props.quickFull }}
                  accessibilityLabel={t(`decide.screens.home.moreDetails.${TILE_A11Y[kind]}`)}
                  disabled={props.quickFull}
                  onPress={() => {
                    hapticSelection();
                    props.onAddQuick(kind);
                  }}
                  style={[styles.tile, { borderColor: colors.line4, opacity: props.quickFull ? 0.5 : 1 }]}
                >
                  <Text style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.accent }}>{`+ ${t(`decide.screens.home.moreDetails.${TILE_KEY[kind]}`)}`}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={small}>{t('decide.screens.home.moreDetails.forGoodNote')}</Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.gapMd },
  row: { minHeight: 52, borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingVertical: space.gapSm, flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  rowText: { flexShrink: 1, flexGrow: 1 },
  body: { gap: space.gapMd },
  group: { gap: space.gapSm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  tile: { minHeight: space.touchMin, borderRadius: radii.card, borderWidth: 1.5, borderStyle: 'dashed', paddingHorizontal: space.cardPad, justifyContent: 'center' },
  line: { borderRadius: radii.card, flexDirection: 'row', alignItems: 'center' },
  lineMain: { flexShrink: 1, flexGrow: 1, minHeight: space.touchMin, paddingHorizontal: space.cardPad, justifyContent: 'center' },
  chevron: { width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, marginRight: 4 },
  remove: { minHeight: space.touchMin, minWidth: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
