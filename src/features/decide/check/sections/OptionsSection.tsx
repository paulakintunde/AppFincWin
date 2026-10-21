/**
 * 05-16 section 7, "What would make it work": the engine's options as noun phrases in a dark (ink) card, each with an
 * optional action pill that rescores the check through its inputs (Use this price, Use this term, Open in Activity,
 * Switch to wait). Omitted when the verdict is fits or missing. No option name is an instruction (DCU-09, T-05-16-01).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { DecideOption } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { optionCopy, type OptionAction } from '../../copy/optionCopy';
import { repriceInputs } from '../../snapshot/checkInputs';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { refText, type Translate } from '../refText';
import { assessmentOf, moneyOf, type SectionProps } from './sectionUi';

export interface OptionsSectionProps extends SectionProps {
  onOpenActivity: () => void;
  onSwitchToWait: () => void;
  lineName: (lineId: string) => string;
}

const ACTION_LABEL = {
  usePrice: 'decide.section.optUsePrice',
  useTerm: 'decide.section.optUseTerm',
  openActivity: 'decide.section.optOpenActivity',
  switchWait: 'decide.section.optSwitchWait',
} as const satisfies Record<OptionAction, string>;

export function OptionsSection(props: OptionsSectionProps) {
  const { computation, inputs, update, whole, exact, currency, expanded, onToggle, readOnly, onOpenActivity, onSwitchToWait, lineName } = props;
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const verdict = computation.verdict;
  const a = assessmentOf(computation);
  if (!a || verdict === null || verdict.state === 'fits') return null;
  const options = computation.options;
  if (options.length === 0) return null;
  const fmt = moneyOf(whole, currency);
  const fmtCents = moneyOf(exact, currency);
  const check = computation.check;
  const resolved = computation.resolvedPrice;

  /** The patch an option's pill applies, or null when it has no inputs patch (or cannot be applied). */
  const patchFor = (o: DecideOption): Partial<typeof inputs> | null => {
    if (o.code === 'affordable_price') {
      if (check === null || check.kind !== 'buy' || resolved === null) return null;
      return repriceInputs(inputs, check, resolved, minorUnits(o.price));
    }
    if (o.code === 'longer_term') return { loan: { ...inputs.loan, termMonths: o.termMonths } };
    return null;
  };

  const act = (o: DecideOption, action: OptionAction) => {
    if (action === 'openActivity') return onOpenActivity();
    if (action === 'switchWait') return onSwitchToWait();
    // WR-C07: an option priced from figures that still follow older inputs is not applied until they settle
    if (props.busy === true) return;
    const patch = patchFor(o);
    if (patch !== null) update(patch);
  };

  const lead = a.checks.month ? t('decide.section.optionsLeadCloses') : t('decide.section.optionsLead');

  return (
    <View style={[styles.card, { backgroundColor: colors.ink }]}>
      <CollapsibleSection
        dark
        title={t('decide.section.optionsTitle')}
        summary={t('decide.section.optionsSummary', { count: options.length })}
        expanded={expanded}
        onToggle={onToggle}
      >
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkSoft1, paddingBottom: space.gapSm }}>{lead}</Text>
        {options.map((o, i) => {
          const copy = optionCopy(o, { fmt, fmtCents, lineName });
          const name = refText(t, copy.name);
          const value = copy.value ? refText(t, copy.value) : null;
          const desc = copy.desc ? refText(t, copy.desc) : null;
          const action = copy.action;
          const pillHidden = action === null || readOnly || ((action === 'usePrice' || action === 'useTerm') && patchFor(o) === null);
          return (
            <View key={`${o.code}-${i}`} style={[styles.row, { borderTopColor: colors.inkSoft1 }]}>
              <View
                accessible
                accessibilityLabel={[name, value, desc].filter(Boolean).join(', ')}
                style={styles.text}
              >
                <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.surface }}>{name}</Text>
                {desc ? <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkSoft1 }}>{desc}</Text> : null}
              </View>
              {value ? (
                <Text scale="capped" style={{ ...textRole(pairing, 'label'), color: colors.surface, textAlign: 'right' }}>
                  {value}
                </Text>
              ) : null}
              {!pillHidden && action !== null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(ACTION_LABEL[action])}
                  onPress={() => act(o, action)}
                  style={({ pressed }) => [styles.pill, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
                >
                  <View style={[StyleSheet.absoluteFill, styles.pillFill, { backgroundColor: colors.surface }]} />
                  <Text style={{ ...textRole(pairing, 'label'), color: colors.surface }}>{t(ACTION_LABEL[action])}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </CollapsibleSection>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingBottom: space.gapSm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, paddingVertical: space.gapSm, borderTopWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, flexShrink: 1 },
  pill: {
    minHeight: space.touchMin,
    paddingHorizontal: space.cardPad,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pillFill: { opacity: 0.12 },
});
