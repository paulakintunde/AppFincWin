/**
 * Plan 05.2-26 (D-03, D-05): "What is {account} for?". One sheet shared by the setup account-use step, settings and the
 * account edit screen. Four radio cards; "A mix" and "Kept for one thing" open a second view inside the same sheet (no
 * stacked sheet). One save writes the account's use and, for a mix, which envelopes sit in it, as one batch with one Undo
 * (plan 14's useSaveAccountUse). The form mounts per opening so every field starts from what is stored.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useIsDirty } from '@/ui/useIsDirty';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { minorUnits } from '@/engine/money';
import type { AccountUse } from '@/engine/decide/v3';
import type { AccountRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideSettings, usePots } from '@/data/queries/decide';
import { useSaveAccountUse } from '@/data/mutations/accountUse';
import { accountUseOfRow } from '@/data/mutations/accountUseModel';
import { showToast } from '@/state/undoToast';
import { useRecordContext } from '@/features/record/useRecordContext';
import { ChoiceCard } from '@/features/decide/ui/ChoiceCard';
import { CheckRow } from '@/features/decide/ui/CheckRow';
import { MoneyInput } from '@/features/decide/ui/MoneyInput';
import { WarningCard } from '@/features/decide/ui/WarningCard';
import { MAX_INPUT_MINOR } from '@/features/decide/snapshot/checkInputs';
import { useNoWrapMoney } from '@/features/income/steps/shared';

export interface AccountUseSheetProps {
  visible: boolean;
  account: AccountRow;
  /** The account's balance in its own currency, or null when unknown (the sub-line then shows nothing). */
  balance: number | null;
  onClose: () => void;
}

type Kind = 'everyday' | 'mixed' | 'dedicated' | 'untouched';
type View2 = 'choose' | 'mix' | 'kept';
/** The kept-for choice: the emergency fund, or an envelope id. */
type Target = 'emergency' | { envelope: string };

const targetKey = (x: Target | null): string | null => (x === null ? null : x === 'emergency' ? 'emergency' : `e:${x.envelope}`);
const clamp = (minor: number | null): number | null => (minor !== null && minor >= 0 && minor <= MAX_INPUT_MINOR ? minor : null);

export function AccountUseSheet(props: AccountUseSheetProps) {
  return props.visible ? <AccountUseForm {...props} /> : null;
}

function placedHere(goal: SavingsGoalRow, account: AccountRow): boolean {
  return (goal.account_id ?? null) === account.id;
}

function GoalRow({ goal, ticked, onToggle, otherName }: { goal: SavingsGoalRow; ticked: boolean; onToggle: () => void; otherName: string | null }) {
  const t = useT();
  const money = useNoWrapMoney(goal.currency);
  let source: string | undefined;
  if (otherName !== null) source = ticked ? t('decide.accountUse.movesFrom', { account: otherName }) : t('decide.accountUse.inOther', { account: otherName });
  return (
    <CheckRow
      checked={ticked}
      onToggle={onToggle}
      name={goal.name}
      source={source}
      amount={money(goal.opening_saved)}
      removeA11yLabel={goal.name}
    />
  );
}

function AccountUseForm({ account, balance, onClose }: AccountUseSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const householdId = rc.householdId ?? undefined;
  const noWrap = useNoWrapMoney(account.currency);
  const saver = useSaveAccountUse(rc.userId ?? '');
  const accounts = useAccounts(householdId).data;
  const settings = useDecideSettings(userId).data ?? null;
  const pots = usePots(userId, householdId).data;
  const envelopes: readonly SavingsGoalRow[] = pots?.plain ?? NONE;

  const stored = useMemo(
    () =>
      accountUseOfRow({
        use: account.use ?? null,
        use_purpose: account.use_purpose ?? null,
        use_envelope_id: account.use_envelope_id ?? null,
        use_extra_set_aside: account.use_extra_set_aside ?? null,
      }),
    [account]
  );

  const [start] = useState(() => ({
    kind: (stored?.kind ?? null) as Kind | null,
    target: (stored?.kind === 'dedicated' ? (stored.purpose.kind === 'emergency' ? 'emergency' : { envelope: stored.purpose.envelopeId }) : null) as Target | null,
    extra: stored?.kind === 'mixed' && stored.extraSetAside !== null ? Number(stored.extraSetAside) : null,
    ticked: envelopes.filter((g) => placedHere(g, account)).map((g) => g.id).sort(),
  }));
  const [kind, setKind] = useState<Kind | null>(start.kind);
  const [target, setTarget] = useState<Target | null>(start.target);
  const [extra, setExtra] = useState<number | null>(start.extra);
  const [ticked, setTicked] = useState<readonly string[]>(start.ticked);
  const [view, setView] = useState<View2>('choose');

  const dirty = useIsDirty(
    { kind: start.kind, target: targetKey(start.target), extra: start.extra, ticked: start.ticked },
    { kind, target: targetKey(target), extra, ticked: [...ticked].sort() }
  );

  const title = t('decide.accountUse.sheetTitle', { account: account.name });
  const nameOf = (id: string | null): string | null => (id === null ? null : (accounts?.find((a) => a.id === id)?.name ?? null));

  const warnFollows =
    stored?.kind === 'dedicated' &&
    stored.purpose.kind === 'emergency' &&
    settings?.reserve_account_id === account.id &&
    !(kind === 'dedicated' && target === 'emergency');

  const canSave = kind !== null && (kind !== 'dedicated' || target !== null) && (kind !== 'mixed' || extra === null || extra <= MAX_INPUT_MINOR);

  const save = (): void => {
    if (kind === null || !canSave) return;
    let use: AccountUse;
    if (kind === 'everyday') use = { kind: 'everyday' };
    else if (kind === 'untouched') use = { kind: 'untouched' };
    else if (kind === 'mixed') use = { kind: 'mixed', extraSetAside: extra === null || extra === 0 ? null : minorUnits(extra) };
    else use = { kind: 'dedicated', purpose: target === 'emergency' || target === null ? { kind: 'emergency' } : { kind: 'envelope', envelopeId: target.envelope } };
    const placements =
      kind === 'mixed'
        ? envelopes
            .filter((g) => ticked.includes(g.id) !== placedHere(g, account))
            .map((g) => ({ goal: g, accountId: ticked.includes(g.id) ? account.id : null }))
        : undefined;
    const result = saver.save({ account, use, placements });
    if (result !== null) showToast({ kind: 'ordinary', text: { key: 'decide.accountUse.toastSaved' }, stepId: result.stepId });
    onClose();
  };

  const toggle = (id: string): void => setTicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const sub = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const heading = { ...textRole(pairing, 'sheetTitle'), color: colors.ink };

  const options: readonly { kind: Kind; label: string; desc: string }[] = [
    { kind: 'everyday', label: t('decide.accountUse.optionEveryday'), desc: t('decide.accountUse.optionEverydayDesc') },
    { kind: 'mixed', label: t('decide.accountUse.optionMix'), desc: t('decide.accountUse.optionMixDesc') },
    { kind: 'dedicated', label: t('decide.accountUse.optionKept'), desc: t('decide.accountUse.optionKeptDesc') },
    { kind: 'untouched', label: t('decide.accountUse.optionSavings'), desc: t('decide.accountUse.optionSavingsDesc') },
  ];

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        {balance !== null ? <Text style={sub}>{noWrap(balance)}</Text> : null}

        {view === 'choose' ? (
          <>
            <View accessibilityRole="radiogroup" accessibilityLabel={title} style={styles.options}>
              {options.map((o) => (
                <ChoiceCard
                  key={o.kind}
                  selected={kind === o.kind}
                  accessibilityLabel={o.label}
                  title={o.label}
                  onPress={() => {
                    setKind(o.kind);
                    if (o.kind === 'mixed') setView('mix');
                    else if (o.kind === 'dedicated') setView('kept');
                  }}
                >
                  <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: kind === o.kind ? colors.inkSoft1 : colors.inkMuted }}>{o.desc}</Text>
                </ChoiceCard>
              ))}
            </View>
            {warnFollows ? <WarningCard tone="soft" title={t('decide.accountUse.warnFollows')} value="" body={[]} /> : null}
            <View style={styles.actions}>
              <Pill label={t('decide.accountUse.save')} variant="primary" disabled={!canSave} onPress={save} />
              <Pill label={t('decide.accountUse.keep')} variant="secondary" onPress={onClose} />
            </View>
          </>
        ) : null}

        {view === 'mix' ? (
          <>
            <Text style={heading}>{t('decide.accountUse.mixHeading', { account: account.name })}</Text>
            {envelopes.length === 0 ? <Text style={sub}>{t('decide.accountUse.mixEmpty')}</Text> : null}
            {envelopes.map((g) => {
              const elsewhere = g.account_id != null && g.account_id !== account.id;
              return <GoalRow key={g.id} goal={g} ticked={ticked.includes(g.id)} onToggle={() => toggle(g.id)} otherName={elsewhere ? (nameOf(g.account_id ?? null) ?? '') : null} />;
            })}
            <MoneyInput
              value={extra}
              currency={account.currency}
              onChange={(m) => setExtra(clamp(m))}
              label={t('decide.accountUse.extraCaption')}
              accessibilityLabel={t('decide.accountUse.extraCaption')}
            />
            <Text style={sub}>{t('decide.accountUse.extraHint')}</Text>
            {warnFollows ? <WarningCard tone="soft" title={t('decide.accountUse.warnFollows')} value="" body={[]} /> : null}
            <View style={styles.actions}>
              <Pill label={t('decide.accountUse.save')} variant="primary" disabled={!canSave} onPress={save} />
              <Pill label={t('decide.accountUse.back')} variant="secondary" onPress={() => setView('choose')} />
            </View>
          </>
        ) : null}

        {view === 'kept' ? (
          <>
            <Text style={heading}>{t('decide.accountUse.keptHeading')}</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={t('decide.accountUse.keptHeading')} style={styles.options}>
              <ChoiceCard
                selected={target === 'emergency'}
                title={t('decide.accountUse.keptEmergency')}
                accessibilityLabel={t('decide.accountUse.keptEmergency')}
                onPress={() => setTarget('emergency')}
              />
              {envelopes.map((g) => (
                <ChoiceCard
                  key={g.id}
                  selected={target !== null && target !== 'emergency' && target.envelope === g.id}
                  title={g.name}
                  accessibilityLabel={g.name}
                  onPress={() => setTarget({ envelope: g.id })}
                />
              ))}
            </View>
            <View style={styles.actions}>
              <Pill label={t('decide.accountUse.save')} variant="primary" disabled={!canSave} onPress={save} />
              <Pill label={t('decide.accountUse.back')} variant="secondary" onPress={() => setView('choose')} />
            </View>
          </>
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}

const NONE: readonly SavingsGoalRow[] = [];

const styles = StyleSheet.create({
  column: { gap: space.gapMd },
  options: { gap: space.gapSm },
  actions: { gap: space.gapSm, marginTop: space.gapSm },
});
