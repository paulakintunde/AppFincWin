// 05.3-40 (DSV-06, D-05, M-08, UI-SPEC Item costs card): the preset questions of the item type. Amounts are always typed, never
// filled in on their own: a matching saved payment is offered with "Use it" and fills only on that press. Sales tax is a percent
// written to taxPercent (never to extras) with the engine's own "about {amount}" hint; the down payment is never asked here.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PRESET_QUESTIONS, salesTaxOf } from '@/engine/decide/v3';
import type { CheckV2, QuestionId, V3PresetItemType } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { PrefillNote } from '@/features/decide/setup/PrefillNote';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { RateInput } from '@/features/decide/ui/RateInput';
import { useShouldStack } from '@/features/decide/ui/textFit';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { useLooseT } from '../check/useLooseT';
import { withExtra, withLayerAnswer, withTaxPercent } from '../model/checkEdits';
import { costFields, type CostField } from '../model/costFields';
import { costPrefill, type PrefillSeries } from '../model/costPrefill';
import { percentToText, textToPercent } from '../model/percentText';
import { useV3Format } from '../shared/useV3Format';
import { LayerCard } from './LayerCard';

export interface ItemCostsCardProps {
  check: CheckV2;
  edit(next: CheckV2): void;
  currency: string;
  /** Saved regular payments the records hold (names and exact category keys); empty when there are none. */
  prefillSeries: readonly PrefillSeries[];
  readOnly?: boolean;
}

const MAX_RATE = '100';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ANSWER_PREFIX = 'L4.';

/** The preset item type of a check that has an item-cost card, or null (custom types and types with no questions). */
export function costsPresetOf(check: CheckV2): V3PresetItemType | null {
  if (check.itemType.kind !== 'preset') return null;
  const v = check.itemType.value;
  const asks = PRESET_QUESTIONS[v].some((id) => id === 'sales_tax') || costFields(v).length > 0;
  return asks ? v : null;
}

function DateField({ id, caption, stored, onValid, readOnly }: { id: string; caption: string; stored: string | null; onValid(v: string | undefined): void; readOnly: boolean }): React.JSX.Element {
  const { colors, pairing } = useTheme();
  const [text, setText] = useState(stored ?? '');
  return (
    <View style={styles.field}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{caption}</Text>
      <View style={[styles.dateBox, { backgroundColor: colors.fill1 }]}>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (ISO_DATE.test(v)) onValid(v);
            else if (v.trim() === '') onValid(undefined);
          }}
          editable={!readOnly}
          inputMode="numeric"
          placeholder="2026-12-31"
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={caption}
          testID={`field-${id}`}
          style={{ ...textRole(pairing, 'label'), color: colors.ink, minHeight: space.touchMin, padding: 0 }}
        />
      </View>
    </View>
  );
}

export function ItemCostsCard({ check, edit, currency, prefillSeries, readOnly = false }: ItemCostsCardProps): React.JSX.Element | null {
  const t = useLooseT();
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack();
  const fmt = useV3Format();
  const [taxText, setTaxText] = useState(() => percentToText(check.taxPercent));
  const itemType = costsPresetOf(check);
  if (itemType === null) return null;

  const asksTax = PRESET_QUESTIONS[itemType].some((id) => id === 'sales_tax');
  const fields = costFields(itemType);
  const cell = stacked ? styles.cellFull : styles.cell;
  const taxAmount = check.price === null || check.taxPercent === null ? null : salesTaxOf(check.price, check.taxPercent);

  const onTax = (text: string): void => {
    setTaxText(text);
    if (text.trim() === '') edit(withTaxPercent(check, null));
    else {
      const p = textToPercent(text);
      if (p !== null) edit(withTaxPercent(check, p));
    }
  };

  const renderField = (f: CostField): React.JSX.Element => {
    const caption = t(`decide.v3.ui.question.${f.id}`);
    if (f.answer === 'amount') {
      const value = check.extras[f.id] ?? null;
      const offer = value === null && !readOnly ? costPrefill(f.id as QuestionId, prefillSeries) : null;
      return (
        <View key={f.id} style={cell}>
          <MoneyInput
            value={value}
            currency={currency}
            onChange={(m) => edit(withExtra(check, f.id, m === null ? null : minorUnits(m)))}
            label={caption}
            accessibilityLabel={caption}
            readOnly={readOnly}
          />
          {offer === null ? null : (
            <View style={styles.offer}>
              <PrefillNote
                text={t(f.cadence === 'yearly' ? 'decide.v3.ui.layers.prefillYear' : 'decide.v3.ui.layers.prefill', { amount: fmt.money(offer.amount), name: offer.name })}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('decide.v3.ui.layers.useIt')}
                onPress={() => edit(withExtra(check, f.id, offer.amount))}
                style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
              >
                <Text style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.ink, textDecorationLine: 'underline' }}>{t('decide.v3.ui.layers.useIt')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      );
    }
    const key = `${ANSWER_PREFIX}${f.id}`;
    if (f.answer === 'yes_no') {
      const answer = check.layerAnswers[key];
      return (
        <View key={f.id} style={[cell, styles.field]}>
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{caption}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={caption} style={styles.wrap}>
            <Chip label={t('decide.v3.ui.question.yes')} selected={answer === true} onPress={readOnly ? undefined : () => edit(withLayerAnswer(check, key, true))} />
            <Chip label={t('decide.v3.ui.question.no')} selected={answer === false} onPress={readOnly ? undefined : () => edit(withLayerAnswer(check, key, false))} />
          </View>
        </View>
      );
    }
    const stored = check.layerAnswers[key];
    return (
      <View key={f.id} style={cell}>
        <DateField
          id={f.id}
          caption={caption}
          stored={typeof stored === 'string' ? stored : null}
          readOnly={readOnly}
          onValid={(v) => edit(withLayerAnswer(check, key, v))}
        />
      </View>
    );
  };

  return (
    <LayerCard eyebrowKey={`decide.v3.ui.layers.costsEyebrow.${itemType}`} testID="item-costs-card">
      <View style={styles.grid}>
        {asksTax ? (
          <View style={cell}>
            <RateInput
              value={taxText}
              onChange={onTax}
              label={t('decide.v3.ui.layers.salesTax')}
              accessibilityLabel={t('decide.v3.ui.layers.salesTax')}
              hint={taxAmount === null ? undefined : t('decide.v3.ui.layers.taxHint', { amount: fmt.money(taxAmount) })}
              max={MAX_RATE}
              rangeText={t('decide.custom.range.percent')}
              readOnly={readOnly}
            />
          </View>
        ) : null}
        {fields.map(renderField)}
      </View>
    </LayerCard>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.gapMd, rowGap: space.gapMd },
  cell: { flexBasis: '47%', flexGrow: 1 },
  cellFull: { flexBasis: '100%', flexGrow: 1 },
  field: { gap: space.gapSm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  offer: { gap: 2, paddingTop: space.gapSm },
  link: { minHeight: space.touchMin, justifyContent: 'center' },
  dateBox: { minHeight: space.touchMin, borderRadius: space.cardPad, paddingHorizontal: space.gapMd, justifyContent: 'center' },
});
