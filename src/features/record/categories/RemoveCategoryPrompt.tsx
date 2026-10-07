// D-36: removing a category is never a delete. An unused category archives straight away;
// one in use says how many transactions use it and offers Merge into another category or
// Archive, both undoable. Merge is disabled while the count is loading and when it is capped
// (more than the 6000-row merge limit, which the write would refuse anyway); Archive stays
// available because it keeps every transaction on the category.
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
  const usage = useCategoryUsage(rc.householdId, category.id, true);
  const { archive } = useArchiveCategory();
  const { merge } = useMergeCategory();
  const [picking, setPicking] = useState(false);
  const autoArchived = useRef(false);

  const name = categoryName(category, t);
  const settledUnused = !usage.isLoading && usage.count === 0 && !usage.capped;

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

  const loading = usage.isLoading;
  return (
    <Sheet visible onDismiss={onCancel}>
      <View style={styles.column}>
        {loading ? null : <Text style={bodyStyle}>{t('categories.removeInUse', { name, count: usage.count })}</Text>}
        {usage.capped ? <Text style={noteStyle}>{t('categories.mergeTooLarge')}</Text> : null}
        <View style={styles.actions}>
          <Pill label={t('categories.removeCancel')} variant="secondary" onPress={onCancel} />
          <Pill
            label={t('categories.removeMerge')}
            variant="secondary"
            disabled={loading || usage.capped}
            onPress={() => setPicking(true)}
          />
          <Pill label={t('categories.removeArchive')} variant="danger" disabled={loading} onPress={doArchive} />
        </View>
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
