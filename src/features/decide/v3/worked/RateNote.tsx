/**
 * 05.3-90 (UAT step 61): one line per converted currency with the date of the rate used, from the snapshot's conversions.
 * Pay and balances in another currency use the latest stored rate, so figures move a little when it changes.
 */
import React from 'react';
import { useDecideSnapshot } from '@/data/queries/decide';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { useV3Format } from '../shared/useV3Format';

export function RateNote(): React.JSX.Element | null {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useV3Format();
  const { result } = useDecideSnapshot();
  const conversions = [...(result?.conversions ?? [])].sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0));
  if (conversions.length === 0) return null;
  return (
    <>
      {conversions.map((c) => (
        <Text key={c.currency} style={{ ...textRole(pairing, 'body'), fontSize: fontSize.body, color: colors.inkDim }}>
          {t('decide.v3.ui.rates.line', { currency: c.currency, date: f.date(c.rateDate) })}
        </Text>
      ))}
    </>
  );
}
