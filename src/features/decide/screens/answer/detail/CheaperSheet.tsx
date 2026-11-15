// 06.1-20 (D61, UX-28, CO-D-111, CO-D-112): "A cheaper one". Asks the cheaper price and the years of use, shows the cost of a year of
// use for both prices from the engine's cheaperOption (price over years, half up), and re-checks at the lower price in place.
// Figures only: no answer of its own until the check is re-judged.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { cheaperOption } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { RadioDot } from '@/ui/RadioDot';
import { Text } from '@/ui/Text';
import { Field, FieldLabel } from '../../sheets/sheetUi';
import { DetailShell, useDetailFormat } from './detailKit';

/** Years of use read as a number of years; none when empty or not above 0 (D-111). */
export function parseYearsOfUse(text: string): number | null {
  const n = Number.parseFloat(text.replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
}

export interface CheaperSheetProps {
  currency: string;
  /** The price the check carries now, minor units. */
  price: number | null;
  /** The cheaper price and years of use the check already carries. */
  cheaperPrice: number | null;
  useYears: number | null;
  /** Re-judge the check at this price (CO-D-111). */
  onCheck: (value: { cheaperPrice: number; useYears: number | null }) => void;
  onCantSee?: () => void;
  onClose: () => void;
}

export function CheaperSheet({ currency, price, cheaperPrice, useYears, onCheck, onCantSee, onClose }: CheaperSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useDetailFormat(currency, true);
  const k = (key: string, values?: Record<string, string>): string => String(t(`decide.screens.answerDetail.cheaper.${key}` as never, values as never));
  const [typed, setTyped] = useState<number | null>(cheaperPrice);
  const [years, setYears] = useState<string>(useYears === null ? '' : String(useYears));
  const yearsOfUse = parseYearsOfUse(years);
  const valid = typed !== null && typed > 0 && (price === null || typed < price);
  const option = price === null ? null : cheaperOption(minorUnits(price), { cheaperPrice: typed === null ? null : minorUnits(typed), useYears: yearsOfUse });
  const saved = cheaperPrice !== null && cheaperPrice === typed;
  return (
    <DetailShell title={k('title')} sub={k('sub')} footer={t('legal.decideAnswer.footer')} caveatLine onCantSee={onCantSee} onClose={onClose}>
      {cheaperPrice !== null ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={k('pick')}>
          <Pressable
            testID="cheaper-saved"
            accessibilityRole="radio"
            accessibilityState={{ selected: saved }}
            accessibilityLabel={f.spoken(cheaperPrice)}
            onPress={() => setTyped(cheaperPrice)}
            style={[styles.row, { backgroundColor: saved ? colors.fill1 : colors.fill6 }]}
          >
            <RadioDot selected={saved} />
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{f.money(cheaperPrice)}</Text>
          </Pressable>
        </View>
      ) : null}
      <MoneyInput value={typed} currency={currency} onChange={setTyped} label={cheaperPrice === null ? k('price') : k('orType')} accessibilityLabel={k('price')} />
      <View style={styles.field}>
        <FieldLabel>{k('years')}</FieldLabel>
        <Field value={years} onChangeText={setYears} accessibilityLabel={k('years')} placeholder={k('yearsHint')} maxLength={5} decimal />
      </View>
      {option !== null ? (
        <View testID="cheaper-figures" style={styles.field}>
          {option.perYear !== null ? (
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{k('perYear', { amount: f.money(option.perYear) })}</Text>
          ) : (
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{k('noYears')}</Text>
          )}
          {option.pickedPerYear !== null ? <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{k('against', { amount: f.money(option.pickedPerYear) })}</Text> : null}
        </View>
      ) : null}
      <Pill label={k('check')} variant="secondary" disabled={!valid} onPress={() => (typed === null ? undefined : onCheck({ cheaperPrice: typed, useYears: yearsOfUse }))} />
    </DetailShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, minHeight: space.touchMin, padding: space.cardPad, borderRadius: space.cardPad },
  field: { gap: space.gapSm },
});
