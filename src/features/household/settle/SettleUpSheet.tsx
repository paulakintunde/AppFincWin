// 08-21 Screen 8 (HH-07, HH-08, D-21, D-22, D-24): "Settle up with Sam". The ticked lines are the whole settle-up: all ticked
// at first, the total is exactly those lines (engine settleUpTotal), and the server checks it again (lines_changed).
//  - the person who owes tells the other they paid (a waiting settle-up Sam confirms), choosing the account the money left
//  - the person owed records a payment that already arrived, choosing the account it arrived in (settles at once)
//  - for someone who left: Record that you paid / Record received (no confirmer; D-25)
// A settle-up is a record of a payment between two people. It is not spending or income, and FincWin moves no money.
// Online-only: offline the button is disabled with a plain message and nothing is queued.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Dropdown } from '@/ui/Dropdown';
import { CheckRow } from '@/ui/CheckRow';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { WarningCard } from '@/ui/WarningCard';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { useSettledLabel } from '@/ui/useSettledLabel';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, step } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { showToast } from '@/state/undoToast';
import { settleUpTotal } from '@/engine/household/settlement';
import { useHouseholdMembers } from '@/data/queries/household';
import { useHouseholdBalances, usePairLines } from '@/data/queries/householdBalances';
import { useProposeSettlement, useRecordPaid, useRecordReceived, useUndoSettlement } from '@/data/mutations/settlements';
import { useWriteGate } from '@/features/plans/useWriteGate';
import { useMemberLabel } from '../useMemberLabel';
import { pairLineToBalanceLine, useRefusalText, useSettleMoney } from './settleHelpers';

const RULES = ['even', 'weight', 'amount', 'mine'] as const;

export interface SettleUpSheetProps {
  visible: boolean;
  householdId: string | null | undefined;
  /** The other person: a user id, or the former key once their account is gone. */
  otherKey: string | null;
  onClose: () => void;
}

export function SettleUpSheet(props: SettleUpSheetProps) {
  if (!props.visible || !props.householdId || !props.otherKey) return null;
  return <SettleBody householdId={props.householdId} otherKey={props.otherKey} onClose={props.onClose} />;
}

function SettleBody({ householdId, otherKey, onClose }: { householdId: string; otherKey: string; onClose: () => void }) {
  const t = useT();
  const gate = useWriteGate('settleUp'); // 09-17 (TIER-09)
  const { colors, pairing } = useTheme();
  const { fmt, formatDate, myAccounts, currency, online, userId } = useSettleMoney();
  const label = useMemberLabel(householdId);
  const refusal = useRefusalText();
  const { data: members } = useHouseholdMembers(householdId);
  const balances = useHouseholdBalances(householdId, userId);
  const pairLines = usePairLines(householdId, userId, otherKey);
  const propose = useProposeSettlement();
  const received = useRecordReceived();
  const paid = useRecordPaid();
  const undo = useUndoSettlement();

  const viewerId = userId ?? '';
  const name = label(otherKey);
  const former = !(members ?? []).some((m) => m.user_id === otherKey);
  const net = balances.data?.pairs.find((p) => p.otherKey === otherKey)?.net ?? 0;
  // Positive net: the other person owes the viewer, so the viewer records what arrived. Otherwise the viewer is the payer.
  const viewerReceives = net > 0;

  const lines = useMemo(() => pairLines.data ?? [], [pairLines.data]);
  const openLines = useMemo(() => lines.filter((l) => l.status === 'open'), [lines]);
  const [ticked, setTicked] = useState<ReadonlySet<string> | null>(null);
  const effective = useMemo<ReadonlySet<string>>(() => ticked ?? new Set(openLines.map((l) => l.line.id)), [ticked, openLines]);
  const [accountPick, setAccountPick] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const account =
    myAccounts.find((a) => a.id === accountPick) ?? myAccounts.find((a) => a.currency === currency) ?? myAccounts[0] ?? null;

  const balanceLines = useMemo(() => lines.map((l) => pairLineToBalanceLine(l, viewerId, otherKey)), [lines, viewerId, otherKey]);
  const total = useMemo(
    () =>
      viewerReceives
        ? settleUpTotal(balanceLines, otherKey, viewerId, effective)
        : settleUpTotal(balanceLines, viewerId, otherKey, effective),
    [balanceLines, effective, viewerReceives, viewerId, otherKey],
  );
  const amount = total.amount as number;
  const covered = total.lineIds.length;
  const leftOut = lines.length - covered;
  const crossCurrency = account !== null && account.currency !== currency;

  // Debounced live region: the total only speaks once the ticks stop changing (D-56 a11y).
  const totalText = amount > 0 ? fmt(amount) : t('household.settle.summary.nothing');
  const spoken = useSettledLabel(`${t('household.settle.total')}, ${totalText}`, amount > 0 ? 'ok' : 'none', 600);

  const toggle = (id: string) => {
    const next = new Set(effective);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
  };

  const needsReview = changed && !reviewed;
  const disabled = !online || amount <= 0 || account === null || needsReview || saving;

  const ctaLabel = viewerReceives
    ? t('household.settle.receiverCta', { amount: fmt(amount) })
    : former
      ? t('household.settle.recordPaid')
      : t('household.settle.payerCta', { name, amount: fmt(amount) });
  const summaryWord = amount <= 0 ? t('household.settle.summary.nothing') : viewerReceives ? t('household.settle.summary.theyPay', { name }) : t('household.settle.summary.youPay', { name });

  const submit = async () => {
    if (disabled || account === null) return;
    setSaving(true);
    setFailure(null);
    try {
      const lineIds = [...total.lineIds];
      const base = { householdId, lineIds, expectedAmount: amount };
      const res = viewerReceives
        ? await received.mutateAsync({ ...base, payer: otherKey, receiverAccount: account.id })
        : former
          ? await paid.mutateAsync({ ...base, other: otherKey, payerAccount: account.id })
          : await propose.mutateAsync({ ...base, receiver: otherKey, payerAccount: account.id });
      if (!res.ok) {
        hapticFailed();
        if (res.reason === 'lines_changed') {
          // The lines moved since this sheet read them: show the fresh total and make the person review it first.
          setTicked(null);
          setChanged(true);
          setReviewed(false);
        } else {
          setFailure(refusal(res.reason));
        }
        return;
      }
      hapticTap();
      const settlementId = (res as { settlement_id?: string }).settlement_id;
      if (viewerReceives || former) {
        showToast({
          kind: 'ordinary',
          text: { key: 'household.settle.toasts.settled', params: { amount: fmt(amount), name } },
          onUndo:
            settlementId === undefined
              ? null
              : () => {
                  void undo.mutateAsync({ householdId, id: settlementId });
                },
        });
      } else {
        showToast({ kind: 'ordinary', text: { key: 'household.settle.toasts.waiting', params: { name } } });
      }
      onClose();
    } catch {
      hapticFailed();
      setFailure(t('household.settle.failed'));
    } finally {
      setSaving(false);
    }
  };

  const title = t('household.settle.title', { name });
  const meta = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const roleLabel = viewerReceives ? t('household.settle.arrivedIn') : t('household.settle.paidFrom');

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <View
          style={[styles.summary, { backgroundColor: colors.fill1 }]}
          accessibilityLiveRegion="polite"
          accessible
          accessibilityLabel={spoken}
          testID="settle-summary"
        >
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{summaryWord}</Text>
          <Text scale="capped" style={{ ...textRole(pairing, 'display'), color: colors.ink }} testID="settle-total">
            {amount > 0 ? fmt(amount) : fmt(0)}
          </Text>
          <Text style={meta}>{t('household.settle.summary.covered', { covered, left: leftOut })}</Text>
        </View>

        {openLines.map((l) => {
          const rule = RULES.find((r) => r === l.line.split_rule);
          const payerKey = l.signed > 0 ? viewerId : otherKey;
          const abs = Math.abs(l.signed);
          return (
            <CheckRow
              key={l.line.id}
              checked={effective.has(l.line.id)}
              onToggle={() => toggle(l.line.id)}
              name={l.line.name ?? formatDate(l.line.local_date)}
              source={t('household.settle.lineMeta', {
                date: formatDate(l.line.local_date),
                rule: rule ? t(`household.rules.names.${rule}`) : '',
                name: label(payerKey),
              })}
              amount={l.signed > 0 ? t('household.settle.signedIn', { amount: fmt(abs) }) : t('household.settle.signedOut', { amount: fmt(abs) })}
              removeA11yLabel=""
            />
          );
        })}
        <Text style={meta}>{t('household.settle.exactLines')}</Text>

        {myAccounts.length > 0 ? (
          <Dropdown
            variant="row"
            rowLabel={roleLabel}
            title={roleLabel}
            options={myAccounts.map((a) => ({ key: a.id, label: a.name, subLabel: a.currency }))}
            value={account?.id}
            onSelect={setAccountPick}
            triggerA11yLabel={roleLabel}
          />
        ) : (
          <Text style={meta}>{t('household.settle.noAccounts')}</Text>
        )}
        <Text style={meta}>{t('household.settle.notSpendingOrIncome')}</Text>
        {crossCurrency && account ? (
          <Text style={meta}>{t('household.settle.crossCurrency', { household: currency, account: account.currency })}</Text>
        ) : null}

        {changed ? (
          <View testID="settle-lines-changed">
            <WarningCard tone="soft" title={t('household.settle.linesChanged')} value="" body={[]} />
            {!reviewed ? (
              <View style={styles.review}>
                <Pill label={t('household.settle.review')} variant="secondary" onPress={() => setReviewed(true)} />
              </View>
            ) : null}
          </View>
        ) : null}
        {failure ? (
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {failure}
          </Text>
        ) : null}
        {!online ? <Text style={meta}>{t('household.settle.offlineHelper')}</Text> : null}
        <Pill
          label={ctaLabel}
          variant="primary"
          locked={gate.gated}
          accessibilityLabel={gate.a11ySuffix ? `${ctaLabel}, ${gate.a11ySuffix}` : undefined}
          disabled={disabled && !gate.gated}
          pending={saving}
          onPress={() => gate.run(() => void submit())}
        />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.tight },
  summary: { padding: step.card, borderRadius: radii.card, gap: step.hair },
  review: { marginTop: step.tight },
});
