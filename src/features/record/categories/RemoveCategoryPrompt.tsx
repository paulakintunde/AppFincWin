// D-36: removing a category is never a delete. An unused category archives straight away;
// one in use says how many transactions use it and offers Merge into another category or
// Archive, both undoable. When the count cannot be read (offline, an error) the same two choices
// are offered under a "can't tell yet" note, with Try again. Merge is disabled while the count is
// loading and when it is known to be capped (more than the 6000-row merge limit, which the write
// would refuse anyway); Archive stays available because it keeps every transaction on the category.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CategoryRow } from '@/db/rows';
import { useArchiveCategory, useMergeCategory } from '@/data/mutations/categories';
import { useCategoryLookup, useCategoryUsage } from '@/data/queries/categories';
import { useRecordContext } from '@/features/record/useRecordContext';
import { categoryName } from '@/features/record/categoryName';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';

/**
 * S-WR-07 / integration I-01: what this prompt reads from useCategoryUsage's CategoryUsage
 * contract (data W6-13 WR-06). The count is trusted only when `isKnown`; `isUnavailable` (a
 * failed or offline read) and every other not-known state mean "can't tell". The TanStack-style
 * aliases (isError, isSuccess === false, a non-success status, known === false) and a missing or
 * null count are still read as unknown, as a second line of defence. CategoryUsage must stay
 * assignable to this view; the call site checks that without a cast.
 */
interface UsageView {
  count?: number | null;
  capped?: boolean;
  isKnown?: boolean;
  isUnavailable?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  isSuccess?: boolean;
  status?: string;
  known?: boolean;
  refetch?: () => unknown;
}

type UsageState = { kind: 'loading' } | { kind: 'unknown' } | { kind: 'known'; count: number; capped: boolean };

export function readUsage(usage: UsageView): UsageState {
  if (usage.isUnavailable === true) return { kind: 'unknown' };
  if (usage.isLoading === true) return { kind: 'loading' };
  const unknown =
    usage.isKnown === false ||
    usage.isError === true ||
    usage.isSuccess === false ||
    (usage.status !== undefined && usage.status !== 'success') ||
    usage.known === false ||
    usage.count === undefined ||
    usage.count === null;
  if (unknown) return { kind: 'unknown' };
  return { kind: 'known', count: usage.count as number, capped: usage.capped === true };
}

export interface RemoveCategoryPromptProps {
  visible: boolean;
  category: CategoryRow;
  onDone: () => void;
  onCancel: () => void;
}

export function RemoveCategoryPrompt({ visible, category, onDone, onCancel }: RemoveCategoryPromptProps) {
  if (!visible) return null;
  return <PromptBody category={category} onDone={onDone} onCancel={onCancel} />;
}

function PromptBody({ category, onDone, onCancel }: Omit<RemoveCategoryPromptProps, 'visible'>) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const lookup = useCategoryLookup(rc.userId ?? undefined);
  const usageView: UsageView = useCategoryUsage(rc.householdId, category.id, true);
  const usage = readUsage(usageView);
  const { archive } = useArchiveCategory();
  const { merge } = useMergeCategory();
  const [picking, setPicking] = useState(false);
  const autoArchived = useRef(false);

  const name = categoryName(category, t);
  // Only isKnown && count === 0 && !capped archives straight away. An unknown count (offline, an
  // error, no household yet, a 0 cached from an earlier mount) never does: the "can't tell yet"
  // prompt offers Merge or Archive as the user's choice, plus Try again. Merge is safe without a
  // count because the merge write re-reads the rows and refuses more than one step can move.
  const settledUnused = usage.kind === 'known' && usage.count === 0 && !usage.capped;

  const doArchive = () => {
    const stepId = archive(category);
    showToast({ kind: 'ordinary', text: undoLabelText('categoryArchived', { name }), stepId });
    onDone();
  };

  // An unused category archives directly, once.
  useEffect(() => {
    if (!settledUnused || autoArchived.current) return;
    autoArchived.current = true;
    const stepId = archive(category);
    showToast({ kind: 'ordinary', text: undoLabelText('categoryArchived', { name }), stepId });
    onDone();
  });

  if (settledUnused) return null;

  const doMerge = (target: CategoryRow) => {
    if (!rc.userId || !rc.householdId) return;
    const targetName = categoryName(target, t);
    const stepId = merge({ source: category, target, targetName, householdId: rc.householdId, ownerId: rc.userId });
    showToast({ kind: 'ordinary', text: undoLabelText('categoryMerged', { name: targetName }), stepId });
    onDone();
  };

  const bodyStyle = { ...textRole(pairing, 'body'), color: colors.ink };
  const noteStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  if (picking) {
    const targets = lookup.active.filter((c) => c.id !== category.id);
    return (
      <Sheet visible onDismiss={() => setPicking(false)}>
        <SheetHeader
          title={t('categories.mergePick', { name })}
          cancelLabel={t('categories.removeCancel')}
          onCancel={() => setPicking(false)}
        />
        <SheetScroll>
          {targets.map((target) => (
            <Row
              key={target.id}
              label={categoryName(target, t)}
              leading={<CategoryGlyph colorKey={target.color_key} letter={categoryName(target, t).charAt(0).toUpperCase()} />}
              onPress={() => doMerge(target)}
            />
          ))}
        </SheetScroll>
      </Sheet>
    );
  }

  const loading = usage.kind === 'loading';
  const capped = usage.kind === 'known' && usage.capped;
  return (
    <Sheet visible onDismiss={onCancel}>
      <View style={styles.column}>
        {usage.kind === 'known' ? <Text style={bodyStyle}>{t('categories.removeInUse', { name, count: usage.count })}</Text> : null}
        {usage.kind === 'unknown' ? <Text style={bodyStyle}>{t('categories.removeUsageUnknown', { name })}</Text> : null}
        {capped ? <Text style={noteStyle}>{t('categories.mergeTooLarge')}</Text> : null}
        <View style={styles.actions}>
          <Pill label={t('categories.removeCancel')} variant="secondary" onPress={onCancel} />
          <Pill
            label={t('categories.removeMerge')}
            variant="secondary"
            disabled={loading || capped}
            onPress={() => setPicking(true)}
          />
          <Pill label={t('categories.removeArchive')} variant="danger" disabled={loading} onPress={doArchive} />
        </View>
        {usage.kind === 'unknown' && usageView.refetch ? (
          <Pill label={t('categories.removeUsageRetry')} variant="secondary" onPress={() => void usageView.refetch?.()} />
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: space.groupGap,
  },
  actions: {
    flexDirection: 'row',
    gap: space.gapMd,
  },
});
