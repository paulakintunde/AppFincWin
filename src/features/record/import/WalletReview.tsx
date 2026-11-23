// The preview for a recognised PayPal, Wise or Revolut file (IMP-06, D-21..D-23; UI-SPEC section 8).
// The new-accounts card sits first, then every line: a fee as its own indented row under its
// payment, a conversion as one transfer row, and lines with no account held back, never guessed.
// The summary bar and the pinned Import pill read the same plan the commit uses.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQueueGuard } from '@/data/sync/useQueueGuard';
import { QueueNote } from '@/features/record/entry/QueueNote';
import { useT } from '@/i18n';
import { Chip } from '@/ui/Chip';
import { Glyph } from '@/ui/icons/Glyph';
import { Pill } from '@/ui/Pill';
import { WarningCard } from '@/ui/WarningCard';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { Actions, Heading, T, useFormatAmount } from './importUi';
import { WalletAccountsCard } from './WalletAccountsCard';
import { FEES_CATEGORY_NAME, walletItems, walletLabel, type WalletItem } from './walletModel';
import type { useStatementImport } from './useStatementImport';

type ImportState = ReturnType<typeof useStatementImport>;

export function WalletReview({ state }: { state: ImportState }) {
  const t = useT();
  const fmt = useFormatAmount();
  const { colors } = useTheme();
  const queueGuard = useQueueGuard();
  const plan = state.walletPlan;
  const drafts = state.wallet;

  // D-21: a named reader that cannot find a column hands the file to the generic import.
  if (state.walletError !== null) {
    return (
      <View>
        <WarningCard
          tone="soft"
          title={t('system.ownData.walletImport.missingColumn', { wallet: walletLabel(state.walletError) })}
          value=""
          body={[]}
        />
        <Actions>
          <Pill label={t('system.ownData.walletImport.matchColumns')} variant="primary" onPress={state.matchWalletColumns} />
          <Pill label={t('importCsv.cancel')} variant="secondary" onPress={state.cancel} />
        </Actions>
      </View>
    );
  }
  if (plan === null || drafts === null) return null;

  const items = walletItems(drafts, plan, state.walletUnlinked);
  const label = walletLabel(plan.wallet);
  const waiting = plan.targets.some((x) => x.create && x.accountId === null);
  const feeText = (fee: { magnitude: number; currency: string }): string =>
    t('system.ownData.walletImport.feeLine', { amount: fmt.amount(fee.magnitude, fee.currency), category: FEES_CATEGORY_NAME });

  const feeRow = (fee: { magnitude: number; currency: string }) => (
    <View style={styles.feeRow}>
      <Glyph name="connected" size={16} color={colors.inkMuted} />
      <T role="label" tone="inkMuted">
        {feeText(fee)}
      </T>
    </View>
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.chipRow}>
        <Glyph name="connected" size={16} color={colors.inkMuted} />
        <Chip label={t('system.ownData.walletImport.readerChip', { wallet: label })} />
      </View>
      <Heading>{t('system.ownData.walletImport.summary', { lines: plan.counts.lines, fees: plan.counts.fees, conversions: plan.counts.conversions, accounts: plan.counts.newAccounts })}</Heading>
      <WalletAccountsCard state={state} />
      {plan.counts.fees > 0 ? <T tone="inkMuted">{t('system.ownData.walletImport.feeMeta')}</T> : null}
    </View>
  );

  const renderItem = ({ item }: { item: WalletItem }) => {
    if (item.kind === 'feeOnly') {
      return (
        <View style={[styles.row, { borderBottomColor: colors.line1 }]}>
          <T role="label" tone="inkMuted">
            {fmt.date(item.localDate)}
          </T>
          {feeRow(item.fee)}
        </View>
      );
    }
    if (item.kind === 'conversion') {
      const text = t('system.ownData.walletImport.conversion', {
        from: fmt.amount(item.from.magnitude ?? 0, item.from.currency),
        to: fmt.amount(item.to.magnitude ?? 0, item.to.currency),
      });
      return (
        <View style={[styles.row, { borderBottomColor: colors.line1 }]} testID="wallet-conversion">
          <View style={styles.top}>
            <Glyph name="transfer" size={20} color={colors.inkMuted} />
            <View style={styles.text}>
              <T role="bodyStrong">{text}</T>
              <T role="label" tone="inkMuted">
                {item.from.localDate === null ? '' : fmt.date(item.from.localDate)}
              </T>
            </View>
          </View>
          {item.fee === null ? null : feeRow(item.fee)}
          <Actions>
            <Pill label={t('system.ownData.walletImport.unlink')} variant="secondary" onPress={() => state.toggleWalletConversion(item.fromIndex)} />
          </Actions>
        </View>
      );
    }
    const r = item.row;
    const signedAmount = (r.marker === 'minus' ? -1 : 1) * (r.magnitude ?? 0);
    return (
      <View style={[styles.row, { borderBottomColor: colors.line1 }]}>
        <View style={styles.top}>
          <View style={styles.text}>
            <T numberOfLines={1}>{r.description}</T>
            <T role="label" tone="inkMuted" numberOfLines={1}>
              {r.localDate === null ? '' : fmt.date(r.localDate)}
            </T>
          </View>
          <T role="bodyStrong">{fmt.amount(signedAmount, r.currency)}</T>
        </View>
        {item.held ? (
          <View style={styles.feeRow}>
            <T role="label" tone="inkMuted">
              {t('system.ownData.walletImport.heldBack')}
            </T>
            <Pill label={t('system.ownData.walletImport.choose')} variant="secondary" onPress={() => state.setWalletCreate(r.currency, true)} />
          </View>
        ) : null}
        {item.held || item.fee === null ? null : feeRow(item.fee)}
        {item.relinkFrom === null ? null : (
          <Actions>
            <Pill label={t('system.ownData.walletImport.relink')} variant="secondary" onPress={() => state.toggleWalletConversion(item.relinkFrom as number)} />
          </Actions>
        )}
      </View>
    );
  };

  return (
    <View style={styles.flex}>
      <FlashList data={items} keyExtractor={(i) => i.key} getItemType={(i) => i.kind} renderItem={renderItem} ListHeaderComponent={header} />
      <View>
        {state.commitProblem === 'failed' ? <T tone="inkMuted">{t('importCsv.commitFailed')}</T> : null}
        {state.commitProblem === 'queueFull' ? <QueueNote queued={queueGuard.queued} state="blocked" testID="import-queue-note" /> : null}
        <Actions>
          <Pill
            label={t('system.ownData.walletImport.importLines', { count: plan.counts.lines })}
            variant="primary"
            disabled={plan.counts.lines === 0 || waiting}
            onPress={state.commit}
          />
          <Pill label={t('importCsv.back')} variant="secondary" onPress={state.back} />
          <Pill label={t('importCsv.cancel')} variant="secondary" onPress={state.cancel} />
        </Actions>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: space.gapSm, paddingBottom: space.gapMd },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  row: { paddingVertical: space.gapSm, borderBottomWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd },
  text: { flex: 1 },
  feeRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, paddingLeft: space.gapMd, paddingTop: space.gapSm },
});
