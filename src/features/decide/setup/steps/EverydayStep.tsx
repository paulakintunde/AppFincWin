/**
 * Plan 05.2-25: "Your everyday spending". With three or more full months of records the typical month is shown and
 * the user says "Looks right" (nothing is written, the median stands) or "Change it" (a typed figure becomes
 * everyday_override, stamped with today). With fewer, the question and the field only. "Looks right" on a stored
 * override clears it ("Use my records"), through the same Undo toast as every other step.
 */
import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { useSaveSetupStep } from '@/data/mutations/decideSetup';
import { useDecideV3 } from '@/data/queries/decideV3';
import { useDecideSettings } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import { everydayByMonth } from '@/engine/decide/v3';
import { SegmentedToggle } from '@/features/decide/ui/SegmentedToggle';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { Intro, Why, useCopy, useNoWrapMoney, useReportReady } from '@/features/income/steps/shared';
import type { SetupStepBodyProps, SetupStepHandle } from './types';

/** The records' typical month: the middle of up to the last six full, unmarked past months (half rounds up). */
export function recordsTypical(
  months: readonly { month: string; full: boolean; mark: string | null }[],
  everyday: ReadonlyMap<string, number>,
  today: string
): number | null {
  const current = today.slice(0, 7);
  const eligible = months
    .filter((m) => m.full && m.month < current && m.mark !== 'out' && m.mark !== 'half')
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .slice(0, 6)
    .map((m) => everyday.get(m.month) ?? 0)
    .sort((a, b) => a - b);
  if (eligible.length === 0) return null;
  const mid = eligible.length / 2;
  if (eligible.length % 2 === 1) return eligible[Math.floor(mid)] as number;
  return Math.floor(((eligible[mid - 1] as number) + (eligible[mid] as number) + 1) / 2);
}

type Choice = 'right' | 'change' | null;

export const EverydayStep = forwardRef<SetupStepHandle, SetupStepBodyProps>(function EverydayStep({ onReadyChange }, ref) {
  const t = useCopy();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const settings = useDecideSettings(userId).data;
  const v3 = useDecideV3();
  const saver = useSaveSetupStep(userId ?? '');
  const currency = v3.inputs?.currency ?? rc.homeCurrency;
  const noWrap = useNoWrapMoney(currency);

  const stored = settings?.everyday_override ?? null;
  const months = v3.inputs?.months;
  const series = v3.inputs?.series;
  const fullMonths = useMemo(() => (months ?? []).filter((m) => m.full && m.month < rc.today.slice(0, 7)).length, [months, rc.today]);
  const typical = useMemo(() => {
    if (months === undefined || series === undefined) return null;
    const perMonth = new Map(everydayByMonth(months, series).map((e) => [e.month, Number(e.everyday)]));
    return recordsTypical(months, perMonth, rc.today);
  }, [months, series, rc.today]);

  const showHero = fullMonths >= 3 && typical !== null;
  const [choice, setChoice] = useState<Choice>(null);
  const [typed, setTyped] = useState<number | null>(null);

  // A stored override reads as "Change it" with its figure until the user picks again.
  const effectiveChoice: Choice = choice ?? (stored !== null && showHero ? 'change' : null);
  const amount = typed ?? stored;
  const typedOk = amount !== null && amount > 0;
  const ready = showHero ? effectiveChoice === 'right' || (effectiveChoice === 'change' && typedOk) : typedOk;
  const writesOverride = (showHero ? effectiveChoice === 'change' : true) && typedOk && amount !== stored;
  const clearsOverride = showHero && effectiveChoice === 'right' && stored !== null;

  useReportReady(onReadyChange, ready, ready ? null : 'decide.setup.shell.chooseOneReason', writesOverride || clearsOverride);

  useImperativeHandle(ref, () => ({
    save() {
      if (userId === undefined) return { stepId: null };
      const title = t('decide.setup.everyday.title');
      if (clearsOverride) {
        const r = saver.save({ stepTitle: title, patch: { everyday_override: null, everyday_override_at: null } });
        return { stepId: r?.stepId ?? null };
      }
      if (writesOverride && amount !== null) {
        const r = saver.save({ stepTitle: title, patch: { everyday_override: amount, everyday_override_at: rc.today } });
        return { stepId: r?.stepId ?? null };
      }
      return { stepId: null };
    },
  }));

  const field = (label: string) => (
    <MoneyInput value={amount} currency={currency} onChange={setTyped} label={label} accessibilityLabel={t('decide.setup.everyday.amountA11y')} />
  );

  return (
    <View style={{ gap: space.groupGap }}>
      <Intro textKey="decide.setup.everyday.intro" />
      {showHero ? (
        <View style={{ gap: space.gapMd }}>
          <View
            accessible
            accessibilityLabel={t('decide.setup.everyday.typicalA11y', { amount: noWrap(typical) })}
            style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.line2 }]}
          >
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('decide.setup.everyday.typical')}</Text>
            <Text
              scale="capped"
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{ ...textRole(pairing, 'display'), color: colors.ink }}
            >
              {noWrap(typical)}
            </Text>
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{t('decide.setup.everyday.typicalSub')}</Text>
          </View>
          <SegmentedToggle
            accessibilityLabel={t('decide.setup.everyday.choiceA11y')}
            value={effectiveChoice ?? ''}
            onChange={(key) => setChoice(key as Choice)}
            options={[
              { key: 'right', label: t('decide.setup.everyday.looksRight') },
              { key: 'change', label: t('decide.setup.everyday.changeIt') },
            ]}
          />
          {effectiveChoice === 'change' ? field(t('decide.setup.everyday.changeCaption')) : null}
        </View>
      ) : (
        field(t('decide.setup.everyday.fewQuestion'))
      )}
      <Why textKey="decide.setup.everyday.why" />
    </View>
  );
});

const styles = StyleSheet.create({
  hero: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPadLg, alignItems: 'center', gap: space.gapSm },
});
