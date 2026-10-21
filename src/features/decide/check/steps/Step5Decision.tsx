/**
 * 05-17 Step 5, "The decision" (DCU-07, D-09, D-10, D-11). The plan on the table, three outcomes (Go ahead, Wait and save,
 * Pass), the Wait panel (amount, ready-by, within spare or not, from buildWaitPlan), the account Go ahead writes to, and a
 * "What gets written" card built by the same pure `writtenLines` the confirm sheet uses. This step only edits `inputs.outcome`,
 * `inputs.wait` and the account ids; committing is the flow shell's job (05-29 over 05-20).
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { RadioDot } from '@/ui/RadioDot';
import { ToggleRow } from '@/ui/ToggleRow';
import { hapticSelection } from '@/ui/haptics';
import { useFxLatest } from '@/data/queries/fxLatest';
import { useGoalLines, useSavingsGoals } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import { goalCopy } from '../../copy/depthInputsCopy';
import { savedSoFar } from '../../journal/goalProgress';
import { GoalProgress } from '../../ui/GoalProgress';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { FigureStrip } from '../../ui/FigureStrip';
import { StepSlider } from '../../ui/StepSlider';
import { refText, type Translate } from '../refText';
import type { StepProps } from '../stepTypes';
import { writtenLines, type WrittenFacts } from '../writtenLines';
import { Card, Eyebrow, Lock, Meta, moneyFn } from './stepUi';

export interface Step5Props extends StepProps {
  cashAccounts: readonly { id: string; name: string; balance: number }[];
  investAccounts: readonly { id: string; name: string; currency: string }[];
  /** The saved check's id and status (set by the flow shell for a decided check); a 'waiting' one shows its goal's progress. */
  checkId?: string | null;
  checkStatus?: string | null;
  /** From useCommitDecision: what the write itself resolves (the Transfer category, the series it ends). */
  written: WrittenFacts;
}

/** D-34: a decided Waiting check's goal progress, from the transfers tagged to it. Hooks live here so an undecided step 5 needs no data providers. */
function DecidedGoalProgress({ checkId, whole, currency, fmt, formatDate }: { checkId: string; whole: Step5Props['whole']; currency: Step5Props['source']['currency']; fmt: (n: number) => string; formatDate: (d: string) => string }) {
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const ctx = useRecordContext();
  const goals = useSavingsGoals(ctx.userId ?? undefined, ctx.householdId ?? undefined);
  const goal = (goals.data ?? []).find((g) => g.check_id === checkId && g.deleted_at === null) ?? null;
  const lines = useGoalLines(ctx.householdId, goal === null ? [] : [goal.id]);
  const rates = useFxLatest();
  if (goal === null) return null;
  const { saved, target } = savedSoFar({ goal, lines: lines.data ?? [], home: ctx.homeCurrency, rates: rates.data ?? [] });
  const copy = goalCopy(goal, saved, fmt, formatDate);
  return (
    <View style={styles.goal}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>{refText(t, copy.caption)}</Text>
      <GoalProgress saved={saved} target={target} whole={whole} currency={currency} />
    </View>
  );
}

const WAIT_STEP = 2_500;
const BULLET = 6;

/** The cash account with the largest balance (A6); the first of equals. */
export function largestAccountId(accounts: Step5Props['cashAccounts']): string | null {
  let best: Step5Props['cashAccounts'][number] | null = null;
  for (const a of accounts) if (best === null || a.balance > best.balance) best = a;
  return best === null ? null : best.id;
}

export function Step5Decision(props: Step5Props) {
  const { inputs, update, computation, source, whole, exact, today, readOnly, cashAccounts, investAccounts, checkId, checkStatus, written } = props;
  const t = useT() as Translate;
  const { colors, pairing } = useTheme();
  const fmt = moneyFn(whole, source.currency);
  const cents = moneyFn(exact, source.currency);

  const verdict = computation.verdict;
  const assessed = verdict !== null && verdict.state !== 'missing' ? verdict : null;
  const resolved = computation.resolvedPrice;
  const planResult = inputs.method === null ? undefined : computation.methodPlans[inputs.method];
  const plan = assessed !== null ? assessed.plan : planResult !== undefined && planResult.status === 'resolved' ? planResult.plan : null;
  const methodName = t(`decide.method.${inputs.method ?? 'none'}`);
  const wait = computation.waitPlan;

  const needsAccount = inputs.outcome === 'go';
  const defaultAccount = largestAccountId(cashAccounts);
  // CR-C05: a stored account that is no longer offered (archived, deleted, another currency) is replaced by the default.
  const storedOffered = inputs.goAccountId !== null && cashAccounts.some((a) => a.id === inputs.goAccountId);
  useEffect(() => {
    if (!readOnly && needsAccount && !storedOffered && defaultAccount !== null && inputs.goAccountId !== defaultAccount) update({ goAccountId: defaultAccount });
  }, [readOnly, needsAccount, storedOffered, inputs.goAccountId, defaultAccount, update]);

  const accountId = storedOffered ? inputs.goAccountId : defaultAccount;
  const account = cashAccounts.find((a) => a.id === accountId) ?? null;
  const intoOptions = inputs.kind === 'invest' && inputs.method === 'lump' ? investAccounts.filter((a) => a.currency === source.currency) : [];
  const investAccount = intoOptions.find((a) => a.id === inputs.investAccountId) ?? null;
  const cardName = source.cards.find((c) => c.accountId === inputs.card.accountId)?.name ?? '';

  const lines = writtenLines(inputs, computation, {
    fmtWhole: fmt,
    fmtExact: cents,
    formatDate: (d) => whole.formatDate(d),
    today,
    accountName: account?.name ?? '',
    cardName,
    investAccountName: investAccount?.name ?? null,
    ...written,
  });

  const choose = (outcome: 'go' | 'wait' | 'pass') => update({ outcome });
  const short = assessed !== null && assessed.left < 0;
  const flag = assessed !== null && assessed.state !== 'fits' ? t('decide.decision.goFlagBreaks') : undefined;
  const left = assessed?.left ?? null;

  const dayOne = assessed !== null ? assessed.mineDayOne : plan?.dayOne ?? null;
  const monthly = assessed !== null ? assessed.newMonthly : plan?.monthly ?? null;
  const dash = t('decide.alt.dash');

  const selectedColor = (selected: boolean) => (selected ? colors.surface : colors.inkDim);
  const body = (selected: boolean, text: string) => (
    <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: selectedColor(selected) }}>{text}</Text>
  );

  const accountRow = (id: string | null, name: string, trailing: string | null, selected: boolean, onPress: () => void) => (
    <Pressable
      key={id ?? 'none'}
      accessibilityRole="radio"
      accessibilityState={readOnly ? { checked: selected, disabled: true } : { checked: selected }}
      accessibilityLabel={name}
      disabled={readOnly}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [styles.accountRow, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
    >
      <RadioDot selected={selected} />
      <Text style={{ ...textRole(pairing, 'label'), color: colors.ink, flex: 1 }}>{name}</Text>
      {trailing !== null ? <Meta>{trailing}</Meta> : null}
    </Pressable>
  );

  return (
    <View style={styles.column}>
      <Card>
        <Eyebrow>{t('decide.decision.plan')}</Eyebrow>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
          {t('decide.decision.planLine', { price: fmt(resolved?.price ?? 0), method: methodName })}
        </Text>
        <FigureStrip
          items={[
            { caption: t('decide.decision.onDay'), value: dayOne === null ? dash : fmt(dayOne) },
            { caption: t('decide.decision.aMonth'), value: monthly === null ? dash : cents(monthly) },
            { caption: t('decide.decision.leftAfter'), value: left === null ? dash : fmt(left), tone: left !== null && left < 0 ? 'negative' : 'neutral' },
          ]}
        />
      </Card>

      <Lock locked={readOnly}>
        <View accessibilityRole="radiogroup" style={styles.choices}>
          <ChoiceCard
            selected={inputs.outcome === 'go'}
            onPress={() => choose('go')}
            title={t('decide.decision.goName')}
            flag={flag}
            accessibilityLabel={t('decide.decision.goName')}
          >
            {body(inputs.outcome === 'go', short && assessed !== null ? t('decide.decision.goDescShort', { amount: fmt(-assessed.left) }) : t('decide.decision.goDesc'))}
          </ChoiceCard>
          <ChoiceCard
            selected={inputs.outcome === 'wait'}
            onPress={() => choose('wait')}
            title={t('decide.decision.waitName')}
            accessibilityLabel={t('decide.decision.waitName')}
          >
            {body(inputs.outcome === 'wait', t('decide.decision.waitDesc'))}
          </ChoiceCard>
          <ChoiceCard
            selected={inputs.outcome === 'pass'}
            onPress={() => choose('pass')}
            title={t('decide.decision.passName')}
            accessibilityLabel={t('decide.decision.passName')}
          >
            {body(inputs.outcome === 'pass', t('decide.decision.passDesc'))}
          </ChoiceCard>
        </View>
      </Lock>

      {inputs.outcome === 'wait' && wait !== null ? (
        <Card>
          <View style={styles.waitFigures}>
            <View style={styles.figure}>
              <Meta>{t('decide.decision.waitPutAside')}</Meta>
              <Text style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>{cents(wait.monthlyAmount)}</Text>
            </View>
            <View style={styles.figure}>
              <Meta>{t('decide.decision.waitReadyBy')}</Meta>
              <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.accent }}>
                {wait.readyBy === null ? t('decide.decision.waitNoDate') : whole.formatDate(wait.readyBy)}
              </Text>
            </View>
          </View>
          <Lock locked={readOnly}>
            <StepSlider
              // WR-C07: the slider follows the live amount, not the plan settled 150 ms later
              value={Math.min(Math.max(inputs.wait.monthlyAmount ?? wait.monthlyAmount, WAIT_STEP), 2 * Math.max(wait.spareMonthly, WAIT_STEP))}
              min={WAIT_STEP}
              max={2 * Math.max(wait.spareMonthly, WAIT_STEP)}
              step={WAIT_STEP}
              onChange={(v) => update({ wait: { monthlyAmount: v } })}
              accessibilityLabel={t('decide.decision.waitSliderA11y')}
              valueText={cents(inputs.wait.monthlyAmount ?? wait.monthlyAmount)}
            />
          </Lock>
          {wait.target > 0 ? (
            <View style={styles.goal}>
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkDim }}>
                {refText(t, goalCopy({ target: wait.target, monthly_amount: wait.monthlyAmount, ready_by: wait.readyBy }, 0, cents, (d) => whole.formatDate(d)).preview)}
              </Text>
              {readOnly ? null : <GoalProgress saved={0} target={wait.target} whole={whole} currency={source.currency} />}
            </View>
          ) : null}
          {readOnly && checkStatus === 'waiting' && checkId ? (
            <DecidedGoalProgress checkId={checkId} whole={whole} currency={source.currency} fmt={cents} formatDate={(d) => whole.formatDate(d)} />
          ) : null}
          <Meta tone="muted">
            {t(wait.withinSpare ? 'decide.decision.waitWithin' : 'decide.decision.waitBeyond', {
              target: fmt(wait.target),
              cushion: fmt(computation.context?.limits.reserve ?? 0),
              left: fmt(wait.spareMonthly),
              amount: cents(wait.monthlyAmount),
            })}
          </Meta>
        </Card>
      ) : null}

      {inputs.outcome === 'go' && inputs.method !== null && cashAccounts.length > 0 ? (
        <Card>
          <Eyebrow>{t('decide.decision.account')}</Eyebrow>
          <Lock locked={readOnly}>
            <View>
              {cashAccounts.map((a) => accountRow(a.id, a.name, fmt(a.balance), a.id === accountId, () => update({ goAccountId: a.id })))}
            </View>
          </Lock>
        </Card>
      ) : null}

      {inputs.outcome === 'go' && intoOptions.length > 0 ? (
        <Card>
          <Eyebrow>{t('decide.decision.investInto')}</Eyebrow>
          <Lock locked={readOnly}>
            <View>
              {accountRow(null, t('decide.decision.investIntoNone'), null, investAccount === null, () => update({ investAccountId: null }))}
              {intoOptions.map((a) => accountRow(a.id, a.name, null, a.id === inputs.investAccountId, () => update({ investAccountId: a.id })))}
            </View>
          </Lock>
        </Card>
      ) : null}

      {computation.verdict?.size === 'needs_spreading' ? (
        <Card>
          <ToggleRow label={t('decide.depth.cooling.toggle')} value={inputs.coolingOff} onChange={(coolingOff) => update({ coolingOff })} disabled={readOnly} />
          <Meta tone="muted">{t('decide.depth.cooling.sub')}</Meta>
        </Card>
      ) : null}

      <View style={[styles.written, { backgroundColor: colors.fill1 }]}>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
          {inputs.outcome === null ? t('decide.decision.writtenNone') : t('decide.decision.writtenHeading')}
        </Text>
        {lines.map((line, i) => (
          <View key={`${line.key}-${i}`} style={styles.bullet}>
            <View style={[styles.dot, { backgroundColor: colors.accent }]} />
            <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.inkDim, flex: 1 }}>{refText(t, line)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd },
  choices: { gap: space.gapSm },
  waitFigures: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  figure: { gap: 2 },
  goal: { gap: space.gapSm },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, minHeight: space.touchMin },
  written: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapSm },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: space.gapSm },
  dot: { width: BULLET, height: BULLET, borderRadius: BULLET / 2, marginTop: 7 },
});
