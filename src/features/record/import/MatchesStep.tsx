// Transfer and bill-match suggestions, shown once before commit (D-52, D-55). Every suggestion
// names both accounts (or the pending bill) in its text and its accessibility label before the
// user accepts, and nothing is applied until they do (T-02-27-05). The recurring-suggestion
// card treatment is reused: Body text, two actions at the foot, 44px targets.
//
// Review item 12: accepted suggestions are capped so one finalize and its undo step stay under
// the 6000-op limit. At the cap the accept actions are disabled and the copy says why;
// declining is always possible.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useAccounts } from '@/data/queries/accounts';
import { AccountPicker } from '@/features/record/entry/pickers/AccountPicker';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { Pill } from '@/ui/Pill';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Actions, Heading, SuggestionCard, T, useFormatAmount } from './importUi';
import type { PreviewRow } from './importPipeline';
import { acceptedSuggestionCount, canAcceptSuggestion, maxAcceptedSuggestions } from './suggestionCap';
import type { useStatementImport } from './useStatementImport';

type ImportState = ReturnType<typeof useStatementImport>;
type TransferRow = ImportState['transferRows'][number];

export function MatchesStep({ state }: { state: ImportState }) {
  const t = useT();
  const fmt = useFormatAmount();
  const rc = useRecordContext();
  const { colors, pairing } = useTheme();
  const accounts = useAccounts(rc.householdId ?? undefined).data ?? [];
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [texts, setTexts] = useState<Record<number, string>>({});

  const accountName = (id: string | null): string => (id === null ? '' : (accounts.find((a) => a.id === id)?.name ?? ''));
  const own = accountName(state.accountId);
  // S-WR-13: keyed once per preview rather than scanned per suggestion card.
  const byIndex = useMemo(() => new Map((state.preview?.rows ?? []).map((r) => [r.index, r] as const)), [state.preview]);
  const rowAt = (index: number): PreviewRow | undefined => byIndex.get(index);

  const included = state.counts.included;
  const accepted = acceptedSuggestionCount(state.transferRows, state.payMatchRows);
  const roomForMore = canAcceptSuggestion(included, accepted);
  const atCap = !roomForMore;
  // S-WR-03: going Back and including more lines lowers the cap below what was accepted.
  const overCap = accepted > maxAcceptedSuggestions(included);
  const overCapText = t('importCsv.suggestionCapOver', { count: maxAcceptedSuggestions(included) });
  // S-WR-04: links need the transfer category, which may not have loaded.
  const noTransfers = state.transfersUnavailable;

  const lineText = (row: PreviewRow | undefined): string | null => {
    if (row === undefined) return null;
    const c = row.converted;
    const parts = [c.description, c.amount === null ? null : fmt.amount(c.amount, c.currency)].filter((p): p is string => p !== null && p !== '');
    return parts.length === 0 ? null : parts.join(' · ');
  };

  const pairCard = (ts: TransferRow, existingId: string) => {
    const row = rowAt(ts.index);
    const other = accountName(state.storedLegs.get(existingId)?.accountId ?? null);
    const importedOut = (row?.converted.amount ?? 0) < 0;
    const from = importedOut ? own : other;
    const to = importedOut ? other : own;
    const linked = ts.answer === 'linked' && ts.linkedId === existingId;
    const line = lineText(row);
    return (
      <SuggestionCard key={`${ts.index}-${existingId}`}>
        <T accessibilityLabel={t('importCsv.transfer.pairA11y', { from, to })}>{t('importCsv.transfer.pair', { from, to })}</T>
        {line === null ? null : (
          <T role="label" tone="inkMuted" numberOfLines={1}>
            {line}
          </T>
        )}
        <Actions>
          <Pill
            label={t('importCsv.transfer.link')}
            variant="secondary"
            disabled={linked || atCap || noTransfers}
            onPress={() => state.linkTransfer(ts.index, existingId)}
          />
          <Pill
            label={t('importCsv.transfer.notTransfer')}
            variant="secondary"
            disabled={ts.answer === 'dismissed'}
            onPress={() => state.dismissTransfer(ts.index)}
          />
        </Actions>
      </SuggestionCard>
    );
  };

  const orphanCard = (ts: TransferRow) => {
    const row = rowAt(ts.index);
    const line = lineText(row);
    const other = accounts.find((a) => a.id === ts.orphanAccountId) ?? null;
    const crossCurrency = other !== null && row !== undefined && other.currency !== row.converted.currency;
    const askAmount = other !== null && (ts.needsCounterAmount || crossCurrency);
    const isAccepted = ts.answer === 'orphan';
    const locked = !isAccepted && (atCap || noTransfers);
    const pickLabel = t('importCsv.transfer.pickOther');
    return (
      <SuggestionCard key={ts.index}>
        <T>{t('importCsv.transfer.orphan')}</T>
        {line === null ? null : (
          <T role="label" tone="inkMuted" numberOfLines={1}>
            {line}
          </T>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pickLabel}
          accessibilityValue={other === null ? undefined : { text: other.name }}
          accessibilityState={{ disabled: locked }}
          disabled={locked}
          onPress={() => setPickerFor(ts.index)}
          style={[styles.pick, { backgroundColor: colors.surface, opacity: locked ? 0.5 : 1 }]}
        >
          <T>{other === null ? pickLabel : other.name}</T>
        </Pressable>
        {askAmount && other !== null ? (
          <TextInput
            accessibilityLabel={t('importCsv.transfer.counterAmount', { account: other.name })}
            placeholder={t('importCsv.transfer.counterAmount', { account: other.name })}
            placeholderTextColor={colors.inkFaint}
            editable={!locked}
            keyboardType="decimal-pad"
            value={texts[ts.index] ?? ''}
            onChangeText={(text) => {
              setTexts((prev) => ({ ...prev, [ts.index]: text }));
              state.setOrphanAccount(ts.index, other.id, text);
            }}
            style={[styles.input, { ...textRole(pairing, 'body'), color: colors.ink, backgroundColor: colors.surface }]}
          />
        ) : null}
        <Actions>
          <Pill
            label={t('importCsv.transfer.notTransfer')}
            variant="secondary"
            disabled={ts.answer === 'dismissed'}
            onPress={() => state.dismissOrphan(ts.index)}
          />
        </Actions>
      </SuggestionCard>
    );
  };

  const payCard = (pm: ImportState['payMatchRows'][number]) => {
    const name = state.storedLegs.get(pm.pendingId)?.name ?? '';
    const line = lineText(rowAt(pm.index));
    return (
      <SuggestionCard key={`pay-${pm.index}`}>
        <T accessibilityLabel={t('importCsv.payMatch.a11y', { name })}>{t('importCsv.payMatch.suggestion', { name })}</T>
        {line === null ? null : (
          <T role="label" tone="inkMuted" numberOfLines={1}>
            {line}
          </T>
        )}
        <Actions>
          <Pill
            label={t('importCsv.payMatch.accept')}
            variant="secondary"
            disabled={pm.answer === 'accepted' || atCap}
            onPress={() => state.acceptPayMatch(pm.index)}
          />
          <Pill
            label={t('importCsv.payMatch.dismiss')}
            variant="secondary"
            disabled={pm.answer === 'dismissed'}
            onPress={() => state.dismissPayMatch(pm.index)}
          />
        </Actions>
      </SuggestionCard>
    );
  };

  return (
    <View>
      <Heading>{t('importCsv.matchesHeading')}</Heading>
      {overCap ? <T tone="inkMuted">{overCapText}</T> : null}
      {atCap && !overCap ? <T tone="inkMuted">{t('importCsv.suggestionCap', { count: maxAcceptedSuggestions(included) })}</T> : null}
      {noTransfers && state.transferRows.length > 0 ? <T tone="inkMuted">{t('importCsv.transfersUnavailable')}</T> : null}
      {state.commitProblem === 'failed' ? <T tone="inkMuted">{t('importCsv.commitFailed')}</T> : null}

      {state.transferRows.map((ts) => {
        if (ts.suggestion.kind === 'pair') return pairCard(ts, ts.suggestion.existingId);
        if (ts.suggestion.kind === 'choose') {
          const options = ts.answer === 'linked' && ts.linkedId !== null ? [ts.linkedId] : ts.suggestion.options;
          return <View key={ts.index}>{options.map((id) => pairCard(ts, id))}</View>;
        }
        return orphanCard(ts);
      })}
      {state.payMatchRows.map(payCard)}

      <Actions>
        <Pill
          label={t('importCsv.commit', { count: included })}
          variant="primary"
          disabled={included === 0 || overCap}
          accessibilityHint={overCap ? overCapText : undefined}
          onPress={state.commit}
        />
        <Pill label={t('importCsv.back')} variant="secondary" onPress={state.back} />
        <Pill label={t('importCsv.cancel')} variant="secondary" onPress={state.cancel} />
      </Actions>

      <AccountPicker
        visible={pickerFor !== null}
        title={t('importCsv.transfer.pickOther')}
        accounts={accounts}
        selectedId={pickerFor === null ? null : (state.transferRows.find((r) => r.index === pickerFor)?.orphanAccountId ?? null)}
        excludeId={state.accountId}
        onSelect={(account) => {
          if (pickerFor !== null) {
            const typed = texts[pickerFor];
            if (typed === undefined) state.setOrphanAccount(pickerFor, account.id);
            else state.setOrphanAccount(pickerFor, account.id, typed);
          }
          setPickerFor(null);
        }}
        onClose={() => setPickerFor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pick: { minHeight: space.touchMin, paddingHorizontal: space.gapMd, borderRadius: radii.pill, justifyContent: 'center' },
  input: { minHeight: space.touchMin, paddingHorizontal: space.gapMd, borderRadius: radii.pill },
});
