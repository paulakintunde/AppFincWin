// 05.3-29 (DSV-10): "What could I do instead?". Four cards (Buy it now, Keep it, A fixed-rate deposit, Buy it later) from
// insteadModel. Nothing here is computed: the model owns the engine calls (D-12). The typed rate is local state only.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Evaluation } from '@/engine/decide/v3';
import { minorUnits, resolveExponent } from '@/engine/money';
import { percent } from '@/engine/payoff';
import type { Percent } from '@/engine/payoff';
import { useT } from '@/i18n';
import { getAnalytics } from '@/services/analytics';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { Text } from '@/ui/Text';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { insteadModel } from '../model/insteadModel';
import type { InsteadCard } from '../model/insteadModel';
import { useV3Format } from '../shared/useV3Format';
import { BuyLaterCard } from './BuyLaterCard';
import { DepositCard } from './DepositCard';
import { CardBody, FutureCard } from './FutureCard';

/** The typed text as a percent, or null while it is empty or not yet a number ("4." counts as 4). */
function rateOf(text: string): Percent | null {
  const trimmed = text.endsWith('.') ? text.slice(0, -1) : text;
  if (trimmed === '') return null;
  try {
    return percent(trimmed);
  } catch {
    return null;
  }
}

export function InsteadScreen({ ev }: { ev: Evaluation }): React.JSX.Element | null {
  const t = useT();
  const { colors, pairing } = useTheme();
  const fmt = useV3Format();
  const rc = useRecordContext();
  const [rateText, setRateText] = useState('');
  const [years, setYears] = useState<1 | 3 | 5>(3);
  const [cut, setCut] = useState(0);

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    getAnalytics().track('decide_instead_opened', {});
  }, []);

  const userRate = rateOf(rateText);
  const model = useMemo(
    () => insteadModel({ ev, userRate, years, everydayCut: minorUnits(cut) }),
    [ev, userRate, years, cut],
  );
  if (model === null || ev.purchase === null) return null;
  const purchase = ev.purchase;
  const exponent = resolveExponent(rc.homeCurrency);
  const card = <K extends InsteadCard['id']>(id: K) => model.cards.find((c) => c.id === id) as Extract<InsteadCard, { id: K }>;
  const buyNow = card('buy_now');
  const keep = card('keep');
  const preset = purchase.purpose !== null && purchase.purpose.kind === 'preset' ? purchase.purpose.value : null;

  const buyNowBody =
    buyNow.head.kind === 'notCovered' || buyNow.before === null || buyNow.after === null
      ? t('decide.v3.ui.instead.buyNowNotCovered')
      : t('decide.v3.ui.instead.buyNowBody', { before: fmt.money(buyNow.before), after: fmt.money(buyNow.after) });

  return (
    <DetailScreen title={t('decide.v3.ui.instead.title', { price: fmt.money(purchase.whole) })}>
      <View style={styles.stack}>
        {preset === null ? null : (
          <View style={[styles.chip, { backgroundColor: colors.fill1 }]}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
              {t('decide.v3.ui.instead.youSaid', { purpose: t(`decide.v3.ui.layers.purpose.${preset}`) })}
            </Text>
          </View>
        )}
        <FutureCard
          title={t('decide.v3.ui.instead.buyNow')}
          figure={buyNow.head.kind === 'spent' ? t('decide.v3.ui.instead.spent', { price: fmt.money(buyNow.head.price) }) : t('decide.v3.ui.instead.notCovered')}
        >
          <CardBody>{buyNowBody}</CardBody>
        </FutureCard>
        <FutureCard
          title={t('decide.v3.ui.instead.keep')}
          figure={keep.head.amount === null ? null : t('decide.v3.ui.instead.kept', { amount: fmt.money(keep.head.amount) })}
        >
          <CardBody>{t('decide.v3.ui.instead.keepBody')}</CardBody>
        </FutureCard>
        <DepositCard card={card('deposit')} rateText={rateText} onRate={setRateText} onYears={setYears} price={purchase.whole} fmt={fmt} />
        <BuyLaterCard card={card('buy_later')} cut={cut} onCut={setCut} currency={rc.homeCurrency} exponent={exponent} fmt={fmt} />
        <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>{t('decide.v3.ui.instead.footer')}</Text>
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.gapMd },
  chip: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: space.gapMd, paddingVertical: space.gapSm / 2 },
});
