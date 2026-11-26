// 10.1-24 (SCN-01..03, SCN-05; D-10/D-18, D-12, D-13; UI-SPEC 5a, 5d): one sheet from reading to review. Reading happens on
// the phone only; the review opens with what was read (or empty rows when nothing was); nothing is written until the primary
// button, and leaving with edits asks first. Entry points (Add, the Receipt sheet's "Read this receipt") are wired in 10.1-25.
// 10.1-27 (D-14..D-17): on a shared line (with split by item on) the draft gets the household's members and starts on the
// line's usual people; `prefill` reopens a saved split by item without reading. "Edit parts" opens the split sheet with the
// parts built from the items; once those parts are saved the item split stops and the review only closes.
import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { hapticTap } from '@/ui/haptics';
import { useT } from '@/i18n';
import { step } from '@/theme/layout';
import { suggestItemCategory } from '@/engine/receipt';
import type { StoredItemSplit, TransactionRow } from '@/db/rows';
import { monthOf } from '@/engine/time';
import type { Part } from '@/engine/parts';
import { useFeatureAccess } from '@/features/levels/useFeatureAccess';
import { CategorySplitSheet } from '../split/CategorySplitSheet';
import { useAccounts } from '@/data/queries/accounts';
import { dateOrderFor } from '@/services/locale/dateOrder';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { useGuessContext } from '../useGuessContext';
import { useRecordContext } from '../useRecordContext';
import { ReadingView } from './ReadingView';
import { ScanReview } from './ScanReview';
import { draftSignature, fromParsed, fromStored, setByItem, toPrivateSave, withMembers, type ReviewDraft } from './scanModel';
import { useScanPeople } from './useScanPeople';
import { useConfirmScan } from './useConfirmScan';
import { useReadReceipt } from './useReadReceipt';

export interface ScanSheetProps {
  visible: boolean;
  mode: 'new' | 'existing';
  line?: TransactionRow;
  householdId: string;
  /** The receipt pages in order. Passing the picked LocalReceiptFile objects keeps their size for the upload outbox. */
  images: { uri: string; mime: string }[];
  onClose(): void;
  onDone(lineId: string): void;
  /** "Try another photo" on an empty review; without it the sheet closes so the user can start again. */
  onRetake?(): void;
  /** 10.1-27: a saved split by item; the sheet skips reading and opens the review on these items and people. */
  prefill?: StoredItemSplit | null;
}

export function ScanSheet(props: ScanSheetProps) {
  if (!props.visible) return null;
  return <ScanBody {...props} />;
}

function ScanBody({ mode, line, householdId, images, onClose, onDone, onRetake, prefill = null }: ScanSheetProps) {
  const t = useT();
  const rc = useRecordContext();
  const accounts = useAccounts(householdId).data;
  const account = useMemo(() => (accounts ?? []).find((a) => a.archived_at === null) ?? null, [accounts]);
  const currency = mode === 'existing' && line ? line.original_currency : (account?.currency ?? rc.homeCurrency);
  const { locale } = useDeviceLocale(rc.region);
  const reader = useReadReceipt(images, { currency, dateOrder: dateOrderFor(locale), today: rc.today });
  const { guess } = useGuessContext();
  const { confirm, conflict } = useConfirmScan({ mode, line, householdId });
  const itemSplitOn = useFeatureAccess('hh.itemSplit').visible;
  const splitOn = useFeatureAccess('splitLine').visible;
  const people = useScanPeople(line, householdId, mode === 'existing' && itemSplitOn);
  const lineSign: 1 | -1 = line && line.original_amount > 0 ? 1 : -1;

  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [opened, setOpened] = useState<{ signature: string; count: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [asking, setAsking] = useState(false);
  const [peopleKey, setPeopleKey] = useState<string | null>(null);
  const [editParts, setEditParts] = useState<{ parts: Part[] | null } | null>(null);
  const [partsEdited, setPartsEdited] = useState(false);

  // 10.1-27: a saved split by item opens straight on the review (no reading).
  if (prefill !== null && mode === 'existing' && draft === null) {
    const built = fromStored(prefill, {
      lineTotal: line?.original_amount ?? 0,
      lineCategoryId: line?.category_id ?? null,
      names: { tax: t('scan.review.tax'), tip: t('scan.review.tip') },
    });
    setDraft(built);
    setOpened({ signature: draftSignature(built), count: built.items.length });
  }

  // The review is built once, when the reading finishes (state adjusted during render, not in an effect).
  if (prefill === null && reader.state === 'done' && draft === null) {
    const built = fromParsed(reader.outcome, {
      mode,
      images: images.map((img, i) => ({ ...img, width: reader.pageSizes[i]?.width ?? null, height: reader.pageSizes[i]?.height ?? null })),
      lineTotal: line?.original_amount,
      lineCategoryId: line?.category_id ?? null,
      pageOffsets: reader.pageOffsets,
      suggest: (name, store) => suggestItemCategory(name, store, guess),
    });
    setDraft(built);
    setOpened({ signature: draftSignature(built), count: built.items.length });
  }

  // 10.1-27 (D-14): the people arrive with the household's members (and again with the stored split). They are put on the
  // draft only while the user has not changed anything, so a late load never undoes a choice.
  const nextPeopleKey = people === null ? null : JSON.stringify([people.members, people.usual]);
  if (people !== null && draft !== null && opened !== null && nextPeopleKey !== peopleKey && draftSignature(draft) === opened.signature) {
    const next = withMembers(draft, people.members, people.usual, { keepPeople: prefill !== null });
    setDraft(next);
    setOpened({ signature: draftSignature(next), count: opened.count });
    setPeopleKey(nextPeopleKey);
  }

  const readCount = opened?.count ?? null;
  useEffect(() => {
    if (readCount === null) return;
    AccessibilityInfo.announceForAccessibility(readCount > 0 ? t('scan.reading.done.a11y', { count: readCount }) : t('scan.fail.title'));
  }, [readCount, t]); // readCount is set once, when the review opens

  // After "Edit parts" saved, nothing is left unsaved here, so closing asks nothing.
  const dirty = !partsEdited && draft !== null && opened !== null && draftSignature(draft) !== opened.signature;

  const stop = () => {
    reader.stop();
    onClose();
  };

  const discard = () => (dirty ? setAsking(true) : onClose());

  const submit = async () => {
    if (!draft || pending) return;
    // The parts were saved by hand from "Edit parts": there is nothing left for the review to write.
    if (partsEdited && line) {
      hapticTap();
      onDone(line.id);
      return;
    }
    setPending(true);
    const res = await confirm(draft);
    setPending(false);
    if (res.ok) {
      hapticTap();
      onDone(res.lineId);
    }
  };

  const title = draft === null ? t('scan.reading.label') : t('scan.review.title');

  return (
    <Sheet visible onDismiss={draft === null ? stop : onClose} accessibilityLabel={title} dirty={dirty} onDiscard={onClose}>
      {draft !== null ? <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={discard} /> : null}
      <SheetScroll contentContainerStyle={styles.column}>
        {draft === null ? (
          <ReadingView page={reader.page} pageCount={reader.pageCount} onStop={stop} />
        ) : (
          <ScanReview
            draft={draft}
            currency={currency}
            onChange={setDraft}
            onConfirm={() => void submit()}
            onDiscard={discard}
            onTryAnother={onRetake ?? onClose}
            pending={pending}
            conflict={conflict}
            householdId={householdId}
            lineSign={lineSign}
            lineCategoryId={line?.category_id ?? null}
            ruleWord={people ? t(`scan.byItem.rule.${people.rule}`) : undefined}
            onEditParts={
              mode === 'existing' && line && splitOn
                ? () => setEditParts({ parts: toPrivateSave(draft, lineSign, line.category_id).parts })
                : undefined
            }
            partsEdited={partsEdited}
          />
        )}
      </SheetScroll>
      {line && editParts !== null ? (
        <CategorySplitSheet
          visible
          line={line}
          householdId={householdId}
          month={monthOf(line.local_date)}
          currency={line.original_currency}
          initialParts={editParts.parts}
          onSaved={() => {
            setPartsEdited(true);
            setDraft((d) => (d === null ? d : setByItem(d, false)));
          }}
          onClose={() => setEditParts(null)}
        />
      ) : null}
      <ConfirmSheet
        visible={asking}
        title={t('scan.review.discardTitle')}
        cancelLabel={t('scan.review.keepEditing')}
        confirmLabel={t('scan.review.discard')}
        destructive
        onConfirm={() => {
          setAsking(false);
          onClose();
        }}
        onCancel={() => setAsking(false)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.row },
});
