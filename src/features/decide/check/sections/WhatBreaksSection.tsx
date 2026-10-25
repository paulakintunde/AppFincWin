/**
 * 05-64 (D-74, UI-SPEC R2 fold 1): the body of "What breaks". Every warning as a row (card reasons included, largest
 * shortfall first), then "Every line" (the former "Against your lines" rows). With warnings, "Every line" sits behind a
 * Show details toggle; with none it shows at once. A first read has no resolved assessment, so it shows the warnings only.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { DetailsToggle } from '../../ui/DetailsToggle';
import { WarningRows, warnCardsOf } from '../WarningList';
import { EveryLineRows } from './LinesSection';
import { assessmentOf, moneyA11yOf, moneyOf, type SectionProps } from './sectionUi';

export type WhatBreaksBodyProps = SectionProps;

export function WhatBreaksBody(props: WhatBreaksBodyProps) {
  const { computation, whole, currency } = props;
  const t = useT();
  const { colors, pairing } = useTheme();
  const [showLines, setShowLines] = useState(false);
  const fmt = moneyOf(whole, currency);
  const fmtA11y = moneyA11yOf(whole, currency);
  const fmtDate = (d: string) => whole.formatDate(d);
  const verdict = computation.status === 'logged' ? computation.verdict : null;
  const firstRead = computation.status === 'first_read' ? computation.firstRead : null;
  const warningCount = warnCardsOf(verdict, firstRead, fmt, fmtDate).length;
  const hasLines = assessmentOf(computation) !== null;
  const block = t('decide.fold.everyLine');
  const lines = (
    <View>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: 1.2 }}>
        {block}
      </Text>
      <EveryLineRows {...props} />
    </View>
  );
  return (
    <View style={styles.body}>
      <WarningRows verdict={verdict} firstRead={firstRead} fmt={fmt} fmtA11y={fmtA11y} fmtDate={fmtDate} />
      {hasLines ? (
        warningCount > 0 ? (
          <View>
            <DetailsToggle expanded={showLines} onToggle={() => setShowLines((v) => !v)} block={block} />
            {showLines ? lines : null}
          </View>
        ) : (
          lines
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ body: { gap: space.gapSm } });
