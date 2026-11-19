// 08-21 Screen 8 / 12 (HH-08, D-25, owner answers 10 and 11): what the viewer still owes, or is owed, in households they left
// or were removed from. Read-only except for one entry: "I paid". It sends a waiting settle-up the person who stayed
// confirms with the normal Yes, I got it (nothing is written in the old household's accounts: the leaver's accounts moved
// with them). While one is waiting the row says so and the entry is hidden. Online-only; offline nothing is sent.
import React, { useState } from 'react';
import { isPlanWriteBlocked } from '@/data/sync/planWriteGuard';
import { StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pill } from '@/ui/Pill';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { Text } from '@/ui/Text';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, step } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { showToast } from '@/state/undoToast';
import { useProposeLeaverPayment } from '@/data/mutations/settlements';
import { myDepartedBalances, type DepartedBalance } from '@/db/settlements';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { useDepartedLabel } from '../useMemberLabel';
import { money } from '@/engine/money';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useRefusalText } from './settleHelpers';

const DEPARTED_KEY = (userId: string) => ['household-departed', userId] as const;

export function DepartedBalancesCard() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const { isOnline: online } = useSyncStatus();
  const nameOf = useDepartedLabel();
  const refusal = useRefusalText();
  const pay = useProposeLeaverPayment();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: DEPARTED_KEY(userId ?? ''),
    queryFn: async (): Promise<DepartedBalance[]> => {
      const res = await myDepartedBalances(supabase);
      return res.ok ? (res.balances ?? []) : [];
    },
    enabled: userId !== null,
  });
  const rows = data ?? [];
  if (rows.length === 0) return null;

  const meta = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };

  const iPaid = async (b: DepartedBalance, name: string) => {
    if (userId === null) return;
    setBusyId(b.departure_id);
    setFailures((f) => ({ ...f, [b.departure_id]: '' }));
    try {
      // The server's own open lines with this person (my_departed_balances), the set propose_leaver_payment checks.
      const res = await pay.mutateAsync({
        householdId: b.household_id,
        household: b.household_id,
        receiver: b.other_id,
        lineIds: b.line_ids,
        expectedAmount: b.amount,
      });
      if (!res.ok) {
        hapticFailed();
        const text = res.reason === 'lines_changed' ? t('household.settle.departed.mismatch', { name }) : refusal(res.reason);
        setFailures((f) => ({ ...f, [b.departure_id]: text }));
        return;
      }
      hapticTap();
      void qc.invalidateQueries({ queryKey: DEPARTED_KEY(userId) });
      showToast({ kind: 'ordinary', text: { key: 'household.settle.toasts.waiting', params: { name } } });
    } catch (err) {
      if (isPlanWriteBlocked(err)) return; // 09-25: the guard opened the plan sheet; not a failure
      hapticFailed();
      setFailures((f) => ({ ...f, [b.departure_id]: t('household.settle.failed') }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.section} testID="departed-balances">
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
        {t('household.settle.departed.title')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {rows.map((b) => {
          const name = nameOf(b);
          const household = b.household_name ?? '';
          const abs = Math.abs(b.amount);
          return (
            <DepartedRow
              key={`${b.departure_id}-${b.other_id}`}
              b={b}
              name={name}
              household={household}
              abs={abs}
              online={online}
              busy={busyId === b.departure_id}
              failure={failures[b.departure_id] || null}
              onPaid={() => void iPaid(b, name)}
              meta={meta}
            />
          );
        })}
      </View>
    </View>
  );
}

interface RowProps {
  b: DepartedBalance;
  name: string;
  household: string;
  abs: number;
  online: boolean;
  busy: boolean;
  failure: string | null;
  onPaid: () => void;
  meta: { color: string };
}

function DepartedRow({ b, name, household, abs, online, busy, failure, onPaid, meta }: RowProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  // Amounts read in the old household's own currency, which the row carries.
  const { formatMoney } = useMoneyFormatter(true);
  const fmt = (minor: number): string => formatMoney(money(minor, b.currency));
  const owe = b.amount > 0;
  const waiting = b.pending_settlement_id !== null;
  const text = owe
    ? t('household.settle.departed.youOwe', { name, amount: fmt(abs), household })
    : t('household.settle.departed.theyOwe', { name, amount: fmt(abs), household });
  return (
    <View style={styles.row}>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{text}</Text>
      {waiting ? (
        <StatusBadge status="pending" label={t('household.settle.departed.waiting', { name, amount: fmt(b.pending_amount ?? abs) })} />
      ) : null}
      <Text style={meta}>{t('household.settle.departed.note', { name })}</Text>
      {owe && !waiting ? (
        <Pill label={t('household.settle.departed.iPaid')} variant="secondary" disabled={!online} pending={busy} onPress={onPaid} />
      ) : null}
      {!online && owe && !waiting ? <Text style={meta}>{t('household.settle.offlineHelper')}</Text> : null}
      {failure ? (
        <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
          {failure}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: step.section, gap: step.tight },
  card: { padding: step.card, borderRadius: radii.card, gap: step.row },
  row: { gap: step.tight },
});
