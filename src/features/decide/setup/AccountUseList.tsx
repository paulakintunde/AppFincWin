/**
 * Plan 05.2-26 (D-03): "What is each account for?". One card per account that holds money (credit cards and loans are on
 * the Loans step). A guess from the account type is shown as "Everyday?" with "Suggested" and is kept in nothing but this
 * file's render: no mutation runs for it until "These look right" or until the row is changed in the sheet (UI-SPEC
 * owner decision 6, threat T-05.2-26-01). The list reports whether every account has a stored use.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import type { AccountUse } from '@/engine/decide/v3';
import type { AccountRow } from '@/db/rows';
import { useAccounts } from '@/data/queries/accounts';
import { useAccountBalances } from '@/data/queries/activity';
import { usePots } from '@/data/queries/decide';
import { useSaveAccountUses } from '@/data/mutations/accountUse';
import { accountUseOfRow } from '@/data/mutations/accountUseModel';
import { showToast } from '@/state/undoToast';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useCopy, useNoWrapMoney } from '@/features/income/steps/shared';
import { AccountUseSheet } from './AccountUseSheet';
import { accountUseText, holdsMoney, suggestUse } from './accountUseSuggest';

export interface AccountUseListProps {
  /** Called whenever "every account has a stored use" changes. */
  onAllConfirmedChange?: (allConfirmed: boolean) => void;
}

const storedUse = (a: AccountRow): AccountUse | null =>
  accountUseOfRow({
    use: a.use ?? null,
    use_purpose: a.use_purpose ?? null,
    use_envelope_id: a.use_envelope_id ?? null,
    use_extra_set_aside: a.use_extra_set_aside ?? null,
  });

interface CardProps {
  account: AccountRow;
  balance: number | null;
  answer: string | null;
  suggestion: string | null;
  onPress: () => void;
}

function AccountCard({ account, balance, answer, suggestion, onPress }: CardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const noWrap = useNoWrapMoney(account.currency);
  const unanswered = answer === null;
  const balanceText = balance === null ? t('accounts.detail.dash') : noWrap(balance);
  const line = answer ?? suggestion ?? t('decide.setup.accountUse.choose');
  const label = [account.name, balanceText, line, suggestion !== null && unanswered ? t('decide.setup.accountUse.suggestedTag') : ''].filter(Boolean).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: unanswered ? colors.inkSoft1 : colors.line2,
          borderStyle: unanswered ? 'dashed' : 'solid',
          opacity: pressed ? PRESSED_OPACITY : 1,
        },
      ]}
    >
      <View style={styles.head}>
        <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink, flexShrink: 1 }}>{account.name}</Text>
        <Text numberOfLines={1} style={{ ...textRole(pairing, 'body'), color: colors.ink, flexShrink: 0 }}>{balanceText}</Text>
      </View>
      <View style={styles.head}>
        <Text style={{ ...textRole(pairing, 'label'), color: answer !== null ? colors.inkDim : suggestion !== null ? colors.inkDim : colors.warn1, flexShrink: 1 }}>{line}</Text>
        {suggestion !== null && unanswered ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{t('decide.setup.accountUse.suggestedTag')}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function AccountUseList({ onAllConfirmedChange }: AccountUseListProps) {
  const t = useT();
  const copy = useCopy();
  const rc = useRecordContext();
  const householdId = rc.householdId ?? undefined;
  const accountsQuery = useAccounts(householdId);
  const balances = useAccountBalances(rc.householdId, accountsQuery.data ?? []).balances;
  const pots = usePots(rc.userId ?? undefined, householdId).data;
  const saver = useSaveAccountUses(rc.userId ?? '');
  const [openId, setOpenId] = useState<string | null>(null);

  const listed = useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.deleted_at === null && a.archived_at === null && holdsMoney(a.kind)),
    [accountsQuery.data]
  );
  const envelopeName = (id: string): string | undefined => pots?.live.find((g) => g.id === id)?.name;
  const describeUse = (u: AccountUse): string => accountUseText(u, copy, envelopeName);

  const answerOf = (a: AccountRow): string | null => {
    const u = storedUse(a);
    return u === null ? null : describeUse(u);
  };
  const suggestionOf = (a: AccountRow): AccountUse | null => (storedUse(a) === null ? suggestUse(a.kind) : null);

  const allConfirmed = listed.every((a) => storedUse(a) !== null);
  const reported = useRef(onAllConfirmedChange);
  useEffect(() => {
    reported.current = onAllConfirmedChange;
  });
  useEffect(() => {
    reported.current?.(allConfirmed);
  }, [allConfirmed]);

  const guesses = listed.flatMap((a) => {
    const guess = suggestionOf(a);
    return guess === null ? [] : [{ account: a, use: guess }];
  });

  const confirmAll = (): void => {
    const result = saver.save(guesses);
    if (result !== null) showToast({ kind: 'ordinary', text: { key: 'decide.accountUse.toastSaved' }, stepId: result.stepId });
  };

  const open = listed.find((a) => a.id === openId) ?? null;

  return (
    <View style={styles.list}>
      {guesses.length > 0 ? <Pill label={t('decide.setup.accountUse.looksRight')} variant="secondary" onPress={confirmAll} /> : null}
      {listed.map((a) => {
        const guess = suggestionOf(a);
        const bal = balances.get(a.id);
        return (
          <AccountCard
            key={a.id}
            account={a}
            balance={bal && !bal.overflow ? bal.balance : null}
            answer={answerOf(a)}
            suggestion={guess === null ? null : t('decide.setup.accountUse.suggestion', { use: describeUse(guess) })}
            onPress={() => setOpenId(a.id)}
          />
        );
      })}
      {open ? (
        <AccountUseSheet
          visible
          account={open}
          balance={balances.get(open.id) && !balances.get(open.id)!.overflow ? balances.get(open.id)!.balance : null}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapSm },
  card: { borderRadius: radii.card, borderWidth: 1, padding: space.cardPad, gap: space.gapSm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', columnGap: space.gapMd },
});
