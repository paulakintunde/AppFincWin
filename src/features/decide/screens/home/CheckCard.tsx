/**
 * 06.1-21 (D01, APP-09, D-02): the Check it card on Decide home. 06.1-56 (A-HOME-2, -4, -5, X-4): When? is one row of three compact
 * choices with short dates; the price leads with the currency symbol and the tax note sits at the right of its label.
 * "What is it?", "Price", "When?", the More details slot and the
 * primary Check it pill. The pill is always on screen; until the item and a price are there it is dimmed with a hint, and for
 * home words it stays dimmed under the home note (no check is created). While one field holds a price after the words, the
 * "Reads as" chips show what was understood and each applies it. Presentational: the fields and rules come in as props.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { TextInput, type TextInput as TextInputInstance } from '@/ui/TextInput';
import { ACCENT_TINT_OPACITY } from '@/theme/tokens';
import { hapticSelection } from '@/ui/haptics';
import { NeedLine } from '../ui/NeedLine';
import type { WhenChoice } from './useNewCheck';

export interface ReadsAs {
  readonly name: string;
  readonly priceText: string;
  readonly whenText: string;
  readonly payText: string;
}

export interface CheckCardProps {
  text: string;
  onText: (text: string) => void;
  /** A callback ref for the What field, so the caller can focus it from an event handler. */
  onWhatRef?: (el: TextInputInstance | null) => void;
  /** The kind the words read as, spoken ("Car"); null before one is read. */
  kindWord: string | null;
  homeNote: boolean;
  price: number | null;
  onPrice: (minor: number | null) => void;
  currency: string;
  /** The note at the right of the price: tax is added, included, or needs a region. null = none. */
  taxNote: string | null;
  when: WhenChoice;
  onWhen: (when: 'today' | 'payday') => void;
  onPickDate: () => void;
  todayText: string;
  /** The next payday as text; null hides the choice. */
  paydayText: string | null;
  pickedText: string | null;
  reads: ReadsAs | null;
  onApplyReads: () => void;
  onReadsWhen: () => void;
  onReadsPay: () => void;
  /** The More details row and its body. */
  moreDetails: React.ReactNode;
  disabled: boolean;
  onCheck: () => void;
  /** 06.1-52 (C-18): what is still needed, under Check it (NeedLine); null draws nothing. */
  hint: string | null;
  /** 06.1-52 (C-18): the price field's raw text, so the hint can tell an empty price from one that did not read. */
  onPriceText?: (text: string) => void;
}

/**
 * 06.1-56 (A-HOME-2, D01): one compact "When?" choice. Three sit in one row (Today · the next payday · Pick a date), each a word
 * over a short date, so Check it stays above the fold. A radio in a radio group; selected is the Chip's accent tint.
 */
function WhenChip({ label, sub, selected, onPress, testID }: { label: string; sub: string; selected: boolean; onPress: () => void; testID: string }) {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${label}. ${sub}`}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={[styles.when, { backgroundColor: colors.fill1, borderColor: selected ? colors.accent : 'transparent' }]}
    >
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.card }]} /> : null}
      <Text style={{ ...textRole(pairing, 'label'), fontWeight: '700', color: selected ? colors.accent : colors.ink, textAlign: 'center' }}>
        {label}
      </Text>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted, textAlign: 'center' }}>
        {sub}
      </Text>
    </Pressable>
  );
}

export function CheckCard({ onWhatRef, ...props }: CheckCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const small = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const picked = typeof props.when === 'object';

  return (
    <View testID="check-card" style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.group}>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.home.check.whatLabel')}</Text>
        <View style={[styles.box, { backgroundColor: colors.fill6 }]}>
          <TextInput
            ref={onWhatRef}
            testID="check-what"
            value={props.text}
            onChangeText={props.onText}
            accessibilityLabel={t('decide.screens.home.check.whatLabel')}
            placeholder={t('decide.screens.home.check.whatPlaceholder')}
            placeholderTextColor={colors.inkFaint}
            maxLength={80}
            returnKeyType="next"
            style={[styles.input, { ...textRole(pairing, 'body'), color: colors.ink }]}
          />
          {props.kindWord === null ? null : (
            <View testID="check-kind" accessible accessibilityLabel={t('decide.screens.stepper.segKindDone', { kind: props.kindWord })} style={[styles.kind, { backgroundColor: colors.fill1 }]}>
              <Text style={small}>{props.kindWord}</Text>
            </View>
          )}
        </View>
        {props.homeNote ? (
          <Text testID="check-home-note" accessibilityRole="alert" style={small}>
            {t('decide.screens.stepper.homeNote')}
          </Text>
        ) : null}
      </View>

      <View style={styles.group}>
        {/* 06.1-56 (A-HOME-5, X-4): the field leads with the currency symbol; the tax note is a short note at the right of the label. */}
        <MoneyInput
          label={t('decide.screens.home.check.priceLabel')}
          accessibilityLabel={t('decide.screens.home.check.priceLabel')}
          currency={props.currency}
          value={props.price}
          onChange={props.onPrice}
          onTextChange={props.onPriceText}
          prefix="symbol"
          zeroHint
          labelAccessory={
            props.taxNote === null ? undefined : (
              <Text testID="check-tax-note" style={[small, styles.taxNote]}>
                {props.taxNote}
              </Text>
            )
          }
        />
      </View>

      {props.reads === null ? null : (
        <View testID="check-reads-as" style={styles.group}>
          <Text style={small}>{t('decide.screens.home.check.readsAs')}</Text>
          <View style={styles.chips}>
            <Chip label={props.reads.name} onPress={props.onApplyReads} />
            <Chip label={props.reads.priceText} onPress={props.onApplyReads} />
            <Chip label={props.reads.whenText} onPress={props.onReadsWhen} />
            <Chip label={props.reads.payText} onPress={props.onReadsPay} />
          </View>
        </View>
      )}

      <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.screens.home.check.whenLabel')} style={styles.group}>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('decide.screens.home.check.whenLabel')}</Text>
        <View testID="when-row" style={styles.whenRow}>
          <WhenChip testID="when-today" label={t('decide.screens.home.check.today')} sub={props.todayText} selected={props.when === 'today'} onPress={() => props.onWhen('today')} />
          {props.paydayText === null ? null : (
            <WhenChip testID="when-payday" label={props.paydayText} sub={t('decide.screens.home.check.nextPayday')} selected={props.when === 'payday'} onPress={() => props.onWhen('payday')} />
          )}
          <WhenChip
            testID="when-date"
            label={picked && props.pickedText !== null ? props.pickedText : t('decide.screens.common.pickDate')}
            sub={t('decide.screens.home.check.anyDay')}
            selected={picked}
            onPress={props.onPickDate}
          />
        </View>
      </View>

      {props.moreDetails}

      <Pill
        label={t('decide.screens.home.check.checkIt')}
        variant="primary"
        disabled={props.disabled}
        onPress={props.onCheck}
        accessibilityHint={props.disabled && props.hint !== null ? props.hint : undefined}
      />
      <NeedLine testID="check-it-hint" text={props.hint} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapMd },
  group: { gap: space.gapSm },
  box: { borderRadius: space.cardPad, paddingHorizontal: space.cardPad, minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  input: { flex: 1, minHeight: space.touchMin, padding: 0 },
  kind: { borderRadius: radii.pill, paddingHorizontal: space.gapMd, minHeight: 28, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  whenRow: { flexDirection: 'row', gap: space.gapSm },
  when: { flex: 1, minHeight: space.touchMin + 8, borderRadius: radii.card, borderWidth: 1.5, paddingHorizontal: space.gapSm, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  taxNote: { flex: 1, textAlign: 'right' },
});
