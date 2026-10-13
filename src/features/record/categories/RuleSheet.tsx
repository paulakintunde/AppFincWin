// REC-27, D-08, D-09, D-10, D-24: add or edit a description-to-category rule, or remove it.
// Scope (Just me / Shared) is chosen for a new rule and fixed once the rule exists. Errors show
// under the fields after the first Save attempt. Every write records its own undo step and
// shows the Undo toast; removal is immediate with a destructive toast (no confirm).
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { RULE_KEYWORD_MAX, normaliseRuleKeyword } from '@/engine/categorize';
import type { CategoryRuleRow, RuleScope } from '@/db/categoryRules';
import { useAddRule, useEditRule, useRemoveRule } from '@/data/mutations/categoryRules';
import { useCategoryLookup } from '@/data/queries/categories';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useGuessContext } from '@/features/record/useGuessContext';
import { categoryName } from '@/features/record/categoryName';
import { CategoryPicker } from '@/features/record/entry/pickers/CategoryPicker';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { CategoryGlyph } from '@/ui/CategoryGlyph';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';

export type RuleSheetMode = { kind: 'new' } | { kind: 'edit'; rule: CategoryRuleRow; categoryId: string | null };

export interface RuleSheetProps {
  visible: boolean;
  mode: RuleSheetMode;
  onClose: () => void;
}

export function RuleSheet({ visible, mode, onClose }: RuleSheetProps) {
  if (!visible) return null;
  return <SheetBody mode={mode} onClose={onClose} />;
}

function SheetBody({ mode, onClose }: { mode: RuleSheetMode; onClose: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const lookup = useCategoryLookup(rc.userId ?? undefined);
  const { rules } = useGuessContext();
  const { add } = useAddRule();
  const { edit } = useEditRule();
  const { remove } = useRemoveRule();
  const editing = mode.kind === 'edit' ? mode.rule : null;
  const initialCategoryId = mode.kind === 'edit' ? mode.categoryId : null;

  const [keyword, setKeyword] = useState(editing?.keyword ?? '');
  const [scope, setScope] = useState<RuleScope>(editing?.scope ?? 'personal');
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [picking, setPicking] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const choices = lookup.active.filter((c) => !c.is_system);
  const chosen = categoryId ? (choices.find((c) => c.id === categoryId) ?? null) : null;

  const trimmed = keyword.trim();
  const norm = normaliseRuleKeyword(trimmed);
  const tooLong = trimmed.length > RULE_KEYWORD_MAX;
  const empty = trimmed.length < 1 || norm === '';
  const duplicate =
    !empty &&
    !tooLong &&
    rules.some((r) => r.scope === scope && r.keyword_norm === norm && r.id !== editing?.id);
  // An existing rule whose category is not in this member's list may keep it; a new rule needs one.
  const categoryMissing = chosen === null && !(editing !== null && categoryId === null);

  const keywordError = empty
    ? t('categories.rules.sheet.keywordRequired')
    : tooLong
      ? t('categories.rules.sheet.keywordTooLong')
      : duplicate
        ? t('categories.rules.sheet.duplicate', { keyword: trimmed })
        : null;

  const cache = rc.userId && rc.householdId ? { userId: rc.userId, householdId: rc.householdId } : null;

  const save = () => {
    setSubmitted(true);
    if (keywordError !== null || categoryMissing || !rc.userId || !rc.householdId || !cache) return;
    if (!editing) {
      if (!chosen) return;
      const { stepId } = add({ ownerId: rc.userId, householdId: rc.householdId, scope, keyword: trimmed, category: chosen });
      showToast({ kind: 'ordinary', text: undoLabelText('ruleAdded', { name: trimmed }), stepId });
      onClose();
      return;
    }
    const change: { keyword?: string; category?: NonNullable<typeof chosen> } = {};
    if (norm !== editing.keyword_norm || trimmed !== editing.keyword) change.keyword = trimmed;
    if (chosen && chosen.id !== initialCategoryId) change.category = chosen;
    if (Object.keys(change).length === 0) {
      onClose();
      return;
    }
    const stepId = edit(editing, change, cache);
    showToast({ kind: 'ordinary', text: undoLabelText('ruleEdited', { name: trimmed }), stepId });
    onClose();
  };

  const doRemove = () => {
    if (!editing || !cache) return;
    const stepId = remove(editing, cache);
    showToast({ kind: 'destructive', text: undoLabelText('ruleRemoved', { name: editing.keyword }), stepId });
    onClose();
  };

  const title = editing ? t('categories.rules.sheet.titleEdit') : t('categories.rules.sheet.titleNew');
  const inputStyle = [
    textRole(pairing, 'body'),
    styles.input,
    { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2 },
  ];
  const labelStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const errorStyle = { ...textRole(pairing, 'label'), color: colors.danger };
  const scopeLabel = scope === 'shared' ? t('categories.rules.sheet.scopeShared') : t('categories.rules.sheet.scopeMine');

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <Text style={labelStyle}>{t('categories.rules.sheet.keyword')}</Text>
        <TextInput
          accessibilityLabel={t('categories.rules.sheet.keyword')}
          value={keyword}
          onChangeText={setKeyword}
          placeholder={t('categories.rules.sheet.keywordPlaceholder')}
          style={inputStyle}
          placeholderTextColor={colors.inkFaint}
        />
        {submitted && keywordError ? (
          <Text style={errorStyle}>{keywordError}</Text>
        ) : (
          <Text style={labelStyle}>{t('categories.rules.sheet.keywordHelper')}</Text>
        )}

        <Row
          label={t('categories.rules.sheet.category')}
          value={chosen ? categoryName(chosen, t) : t('categories.rules.sheet.choose')}
          leading={
            chosen ? <CategoryGlyph colorKey={chosen.color_key} letter={categoryName(chosen, t).charAt(0).toUpperCase()} /> : undefined
          }
          chevron
          onPress={() => setPicking(true)}
        />
        {submitted && categoryMissing ? <Text style={errorStyle}>{t('categories.rules.sheet.categoryRequired')}</Text> : null}

        {editing ? (
          <>
            <Row label={t('categories.rules.sheet.scope')} value={scopeLabel} />
            <Text style={labelStyle}>{t('categories.rules.sheet.scopeFixed')}</Text>
          </>
        ) : (
          <>
            <Text style={labelStyle}>{t('categories.rules.sheet.scope')}</Text>
            <View style={styles.chips}>
              <Chip label={t('categories.rules.sheet.scopeMine')} selected={scope === 'personal'} onPress={() => setScope('personal')} />
              <Chip label={t('categories.rules.sheet.scopeShared')} selected={scope === 'shared'} onPress={() => setScope('shared')} />
            </View>
            <Text style={labelStyle}>
              {scope === 'shared' ? t('categories.rules.sheet.scopeSharedSub') : t('categories.rules.sheet.scopeMineSub')}
            </Text>
          </>
        )}

        <Pill
          label={editing ? t('categories.rules.sheet.saveChanges') : t('categories.rules.sheet.save')}
          variant="primary"
          onPress={save}
        />
        {editing ? <Pill label={t('categories.rules.sheet.remove')} variant="danger" onPress={doRemove} /> : null}
      </SheetScroll>
      <CategoryPicker
        visible={picking}
        hideUncategorised
        categories={choices}
        selectedId={categoryId}
        onSelect={(id) => {
          setCategoryId(id);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: space.gapSm,
    paddingBottom: space.gapMd,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  input: {
    minHeight: space.touchMin,
    paddingHorizontal: space.cardPad,
    paddingVertical: space.gapSm,
  },
});
