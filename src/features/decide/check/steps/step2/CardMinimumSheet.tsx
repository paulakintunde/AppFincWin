/**
 * 05-53 (D-40, D-38): the card's minimum payment on step 2 - a row that reads the terms and the sheet that edits them.
 * The terms are the card's own record or the per-market pre-fill (labelled as such); no rate is ever invented (04 D-07).
 * Cancel never asks; a swipe, back or backdrop on a dirty sheet asks "Discard changes?" through the shared Sheet (03 D-26).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { CurrencyCode } from '@/engine/decide';
import { currencyExponent, minorUnits, toDecimalString } from '@/engine/money';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { useIsDirty } from '@/ui/useIsDirty';
import { cardTermsSummary, parseCardTermsForm } from '../../../copy/cardTermsCopy';
import type { CardTermsValues } from '../../../copy/cardTermsCopy';
import type { CardTermsView } from '../../../snapshot/types';
import { MoneyInput } from '../../../ui/MoneyInput';
import { RateInput } from '../../../ui/RateInput';
import { useInfoSheet } from '../../../ui/useInfoSheet';
import { InfoTitle } from '../../InfoTitle';
import { refText, type Translate } from '../../refText';
import { Meta, moneyFn } from '../stepUi';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';

const CHEVRON = 8;
const CANCEL_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

export interface CardMinimumRowProps {
  terms: CardTermsView;
  readOnly: boolean;
  onPress: () => void;
  whole: MoneyFormatter;
}

/** 'Minimum payment' with what the card's terms read, a chevron, and the pre-fill note when the terms are the standard ones. */
export function CardMinimumRow({ terms, readOnly, onPress, whole }: CardMinimumRowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const info = useInfoSheet('cardMinimum');
  const fmt = (minor: number, currency: string): string => moneyFn(whole, currency as CurrencyCode)(minor);
  const summary = cardTermsSummary(terms, fmt);
  const value = refText(t as Translate, summary.value);
  const label = t('decide.depth.cardMin.row');
  const body = (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{label}</Text>
        <Text style={{ ...textRole(pairing, 'body'), color: summary.tone === 'warn' ? colors.warn1 : colors.ink }}>{value}</Text>
      </View>
      {readOnly ? null : <View style={[styles.chevron, { borderColor: colors.inkFaint }]} />}
    </View>
  );
  return (
    <View>
      <View style={styles.infoRow}>
        <View style={styles.text}>
          {readOnly ? (
            <View accessible accessibilityLabel={`${label}, ${value}`}>{body}</View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${value}`}
              onPress={onPress}
              style={({ pressed }) => ({ minHeight: space.touchMin, justifyContent: 'center', opacity: pressed ? PRESSED_OPACITY : 1 })}
            >
              {body}
            </Pressable>
          )}
        </View>
        {info.button()}
        {info.sheet}
      </View>
      {summary.note === null ? null : <Meta tone="muted">{refText(t as Translate, summary.note)}</Meta>}
    </View>
  );
}

export interface CardMinimumSheetProps {
  visible: boolean;
  terms: CardTermsView;
  onSave: (terms: CardTermsValues) => void;
  onClose: () => void;
}

interface FormState {
  percentText: string;
  interestAdded: boolean;
  floor: number | null;
  paidInFull: boolean;
}

export function CardMinimumSheet(props: CardMinimumSheetProps) {
  // The form mounts per opening so every field starts from the card's terms.
  return props.visible ? <CardMinimumForm {...props} /> : null;
}

function CardMinimumForm({ terms, onSave, onClose }: CardMinimumSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const info = useInfoSheet('cardMinimum');
  const paidInfo = useInfoSheet('paidInFullMonthly');
  const [start] = useState<FormState>(() => ({
    percentText: terms.percentText ?? '',
    interestAdded: terms.interestAdded ?? false,
    floor: terms.floor,
    paidInFull: terms.paidInFull,
  }));
  const [form, setForm] = useState<FormState>(start);
  const [error, setError] = useState<'percent' | 'floor' | null>(null);
  const dirty = useIsDirty(start, form);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const title = t('decide.depth.cardMin.sheetTitle');
  const exponent = currencyExponent(terms.floorCurrency);
  const off = form.paidInFull;

  const save = () => {
    const result = parseCardTermsForm(
      {
        percentText: form.percentText,
        interestAdded: form.interestAdded,
        floorText: form.floor === null ? '' : toDecimalString(minorUnits(form.floor), exponent),
        paidInFull: form.paidInFull,
      },
      exponent
    );
    if (!result.ok) {
      setError(result.field);
      return;
    }
    onSave(result.terms);
    onClose();
  };
  const useMarket = () => {
    onSave({ percentText: null, interestAdded: null, floor: null, paidInFull: false });
    onClose();
  };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <View style={styles.header}>
        <InfoTitle info={info} lineHeight={textRole(pairing, 'sheetTitle').lineHeight}>
          <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>{title}</Text>
        </InfoTitle>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('decide.depth.cardMin.cancel')}
          onPress={onClose}
          style={styles.cancel}
          hitSlop={CANCEL_HIT_SLOP}
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.depth.cardMin.cancel')}</Text>
        </Pressable>
      </View>
      <SheetScroll contentContainerStyle={styles.column}>
        <RateInput
          value={form.percentText}
          onChange={(percentText) => {
            setError(null);
            set({ percentText });
          }}
          label={t('decide.depth.cardMin.percentLabel')}
          accessibilityLabel={t('decide.depth.cardMin.percentA11y')}
          readOnly={off}
        />
        {error === 'percent' ? <Text style={{ ...textRole(pairing, 'label'), color: colors.danger }}>{t('money.amountInput.error.invalid')}</Text> : null}
        <ToggleRow label={t('decide.depth.cardMin.interestLabel')} value={form.interestAdded} onChange={(interestAdded) => set({ interestAdded })} disabled={off} />
        <MoneyInput
          value={form.floor}
          currency={terms.floorCurrency}
          onChange={(floor) => {
            setError(null);
            set({ floor });
          }}
          label={t('decide.depth.cardMin.floorLabel')}
          accessibilityLabel={t('decide.depth.cardMin.floorLabel')}
          readOnly={off}
        />
        {error === 'floor' ? <Text style={{ ...textRole(pairing, 'label'), color: colors.danger }}>{t('money.amountInput.error.invalid')}</Text> : null}
        <View style={styles.infoRow}>
          <View style={styles.text}>
            <ToggleRow label={t('decide.depth.cardMin.paidInFull')} value={form.paidInFull} onChange={(paidInFull) => set({ paidInFull })} />
          </View>
          {paidInfo.button()}
          {paidInfo.sheet}
        </View>
        <Meta tone="muted">{t('decide.depth.cardMin.paidInFullSub')}</Meta>
        <Pill label={t('decide.depth.cardMin.save')} variant="primary" onPress={save} />
        {terms.source === 'stored' && terms.marketAvailable ? <Pill label={t('decide.depth.cardMin.useMarket')} variant="secondary" onPress={useMarket} /> : null}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapSm, paddingBottom: space.gapMd },
  row: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
  text: { flex: 1 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd, minHeight: space.touchMin },
  cancel: { minHeight: space.touchMin, justifyContent: 'center' },
  chevron: { width: CHEVRON, height: CHEVRON, borderTopWidth: 2, borderRightWidth: 2, transform: [{ rotate: '45deg' }] },
});
