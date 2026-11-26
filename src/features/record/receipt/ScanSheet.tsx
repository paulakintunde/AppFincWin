// 10.1-24 (SCN-01..03, SCN-05; D-10/D-18, D-12, D-13; UI-SPEC 5a, 5d): one sheet from reading to review. Reading happens on
// the phone only; the review opens with what was read (or empty rows when nothing was); nothing is written until the primary
// button, and leaving with edits asks first. Entry points (Add, the Receipt sheet's "Read this receipt") are wired in 10.1-25.
import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { hapticTap } from '@/ui/haptics';
import { useT } from '@/i18n';
import { step } from '@/theme/layout';
import { suggestItemCategory } from '@/engine/receipt';
import type { TransactionRow } from '@/db/rows';
import { useAccounts } from '@/data/queries/accounts';
import { dateOrderFor } from '@/services/locale/dateOrder';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { useGuessContext } from '../useGuessContext';
import { useRecordContext } from '../useRecordContext';
import { ReadingView } from './ReadingView';
import { ScanReview } from './ScanReview';
import { draftSignature, fromParsed, type ReviewDraft } from './scanModel';
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
}

export function ScanSheet(props: ScanSheetProps) {
  if (!props.visible) return null;
  return <ScanBody {...props} />;
}

function ScanBody({ mode, line, householdId, images, onClose, onDone, onRetake }: ScanSheetProps) {
  const t = useT();
  const rc = useRecordContext();
  const accounts = useAccounts(householdId).data;
  const account = useMemo(() => (accounts ?? []).find((a) => a.archived_at === null) ?? null, [accounts]);
  const currency = mode === 'existing' && line ? line.original_currency : (account?.currency ?? rc.homeCurrency);
  const { locale } = useDeviceLocale(rc.region);
  const reader = useReadReceipt(images, { currency, dateOrder: dateOrderFor(locale), today: rc.today });
  const { guess } = useGuessContext();
  const { confirm, conflict } = useConfirmScan({ mode, line, householdId });

  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [opened, setOpened] = useState<{ signature: string; count: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [asking, setAsking] = useState(false);

  // The review is built once, when the reading finishes (state adjusted during render, not in an effect).
  if (reader.state === 'done' && draft === null) {
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

  const readCount = opened?.count ?? null;
  useEffect(() => {
    if (readCount === null) return;
    AccessibilityInfo.announceForAccessibility(readCount > 0 ? t('scan.reading.done.a11y', { count: readCount }) : t('scan.fail.title'));
  }, [readCount, t]); // readCount is set once, when the review opens

  const dirty = draft !== null && opened !== null && draftSignature(draft) !== opened.signature;

  const stop = () => {
    reader.stop();
    onClose();
  };

  const discard = () => (dirty ? setAsking(true) : onClose());

  const submit = async () => {
    if (!draft || pending) return;
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
          />
        )}
      </SheetScroll>
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
