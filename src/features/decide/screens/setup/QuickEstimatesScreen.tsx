// 06.1-39 (D39, UX-11, UX-05, "ask, don't block"): a first answer from three estimates, before records exist. Comes in, bills and
// everyday spending are typed as whole amounts in minor units; "See the answer now" writes rough_income = in, rough_spending =
// bills + everyday and rough_as_of = today (saving, debt and invest are left as they are), then returns to the answer. The answer
// frame, not this screen, says the answer rests on quick estimates. The write comes in as `onSave` (the shell owns the write path).
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { currencyCode, minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { MoneyInput } from '@/ui/MoneyInput';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { useSettledLabel } from '@/ui/useSettledLabel';
import { MAX_INPUT_MINOR } from '../../snapshot/checkInputs';
import { stampSettingsPatch } from '../../settingsPatch';
import type { DecideSettingsPatch, DecideSettingsRow } from '@/db/decideSettings';

/** Quiet time before a screen reader reads the live line again, so typing is not read out digit by digit. */
const LIVE_SETTLE_MS = 700;

const valid = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n >= 0 && n <= MAX_INPUT_MINOR;

export interface QuickEstimatesScreenProps {
  currency: string;
  /** Today's local date (YYYY-MM-DD). */
  today: string;
  /** The stored settings, so a figure typed in another currency clears the rest in the same patch (CR-B01). */
  stored: DecideSettingsRow | null;
  /** The settings write (injected from the shell). */
  onSave: (patch: DecideSettingsPatch) => void;
  /** Called after the save; the route sends the person to the answer or home. */
  onDone: () => void;
}

export function QuickEstimatesScreen({ currency, today, stored, onSave, onDone }: QuickEstimatesScreenProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  const money = useMoneyFormatter(false, currency);
  const [income, setIncome] = useState<number | null>(null);
  const [bills, setBills] = useState<number | null>(null);
  const [everyday, setEveryday] = useState<number | null>(null);

  const spending = valid(bills) && valid(everyday) ? bills + everyday : null;
  // T-06.1-39-01: the sum must also be a positive figure within the input bound.
  const ready = valid(income) && spending !== null && spending > 0 && spending <= MAX_INPUT_MINOR;
  const fmt = (n: number): string => money.formatMoney({ amount: minorUnits(n), currency: currencyCode(currency) });
  const left = ready ? income - spending : null;
  const liveText =
    left === null
      ? ''
      : left >= 0
        ? t('decide.screens.setup.quick.live', { left: fmt(left) })
        : t('decide.screens.setup.quick.liveShort', { short: fmt(-left) });
  const settled = useSettledLabel(liveText, left === null ? 'none' : left >= 0 ? 'left' : 'short', LIVE_SETTLE_MS);

  const see = () => {
    if (!ready) return;
    onSave(stampSettingsPatch({ rough_income: income, rough_spending: spending, rough_as_of: today }, stored, currency));
    onDone();
  };

  const body = { ...textRole(pairing, 'body'), color: colors.inkDim };
  return (
    <DetailScreen title={t('decide.screens.setup.quick.title')}>
      <View style={styles.block}>
        <Text style={body}>{t('decide.screens.setup.quick.sub')}</Text>
        <MoneyInput value={income} currency={currency} onChange={setIncome} label={t('decide.screens.setup.quick.income')} accessibilityLabel={t('decide.screens.setup.quick.income')} />
        <MoneyInput value={bills} currency={currency} onChange={setBills} label={t('decide.screens.setup.quick.bills')} accessibilityLabel={t('decide.screens.setup.quick.bills')} />
        <MoneyInput value={everyday} currency={currency} onChange={setEveryday} label={t('decide.screens.setup.quick.everyday')} accessibilityLabel={t('decide.screens.setup.quick.everyday')} />
        <View accessibilityLiveRegion="polite" testID="quick-live" style={styles.live}>
          {liveText !== '' ? (
            <Text accessibilityLabel={settled} style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
              {liveText}
            </Text>
          ) : null}
        </View>
        <Pill variant="primary" label={t('decide.screens.setup.quick.see')} disabled={!ready} onPress={see} />
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.screens.setup.quick.foot')}</Text>
        <Text testID="quick-footer" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {t('legal.decideAnswer.footer')}
        </Text>
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.gapMd, paddingTop: space.gapSm },
  live: { minHeight: 24 },
});
