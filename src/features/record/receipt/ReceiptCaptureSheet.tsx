// 10.1-23 (RCP-01, D-09; UI-SPEC section 3): the capture choice behind the entry sheet's "Add a receipt" row, for a line that
// is not saved yet. The same three ways to add a receipt as the Receipt sheet (photo, file, scan), the same limits and the
// same calm errors; the picked files go back to the entry sheet, which keeps them on the phone and queues them with the line
// once it is saved. Nothing here uploads, and nothing logs file names or paths.
import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Glyph } from '@/ui/icons/Glyph';
import { IconTile } from '@/ui/icons/IconTile';
import type { IconName } from '@/ui/icons/iconData';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { RECEIPT_MAX_BYTES, RECEIPT_MAX_FILES_PER_LINE } from '@/services/receipts/limits';
import type { LocalReceiptFile, ReceiptKind } from '@/services/receipts/types';
import { errorFor, pickReceipt, type ReceiptActionError, type ReceiptAddSource } from './useReceiptActions';

export interface PickedReceipt {
  kind: ReceiptKind;
  files: LocalReceiptFile[];
}

export interface ReceiptCaptureSheetProps {
  visible: boolean;
  /** Receipts already picked for this entry (a scan of many pages is one). */
  count: number;
  onClose(): void;
  onPicked(picked: PickedReceipt): void;
}

const SIZE_MB = Math.round(RECEIPT_MAX_BYTES / (1024 * 1024));

function ActionTile({ icon }: { icon: IconName }) {
  const { colors } = useTheme();
  return <IconTile icon={icon} color={colors.ink} tint={colors.fill1} />;
}

export function ReceiptCaptureSheet(props: ReceiptCaptureSheetProps) {
  if (!props.visible) return null;
  return <CaptureBody {...props} />;
}

function CaptureBody({ count, onClose, onPicked }: ReceiptCaptureSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [error, setError] = useState<ReceiptActionError | null>(null);
  const [busy, setBusy] = useState(false);
  const permissionOff = error === 'cameraOff' || error === 'photosOff';

  const add = async (source: ReceiptAddSource) => {
    setError(null);
    if (count >= RECEIPT_MAX_FILES_PER_LINE) {
      setError('tooManyFiles');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickReceipt(source);
      if (!picked.ok) {
        setError(errorFor(picked, source));
        return;
      }
      onPicked({ kind: picked.kind, files: picked.files });
    } catch {
      setError('failed');
    } finally {
      setBusy(false);
    }
  };

  const inline = (key: ReceiptActionError): string => {
    switch (key) {
      case 'tooBig':
        return t('receipt.tooBig', { size: SIZE_MB });
      case 'badType':
        return t('receipt.badType');
      case 'tooManyFiles':
        return t('receipt.tooManyFiles', { max: RECEIPT_MAX_FILES_PER_LINE });
      default:
        return t('receipt.addFailed');
    }
  };

  const noteStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={t('receipt.sheet.title')}>
      <SheetHeader title={t('receipt.sheet.title')} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        {permissionOff ? (
          <View style={[styles.card, { backgroundColor: colors.fill1 }]} testID="receipt-capture-permission">
            <IconTile icon="camera" size={48} color={colors.ink} tint={colors.surface} />
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
              {t(error === 'cameraOff' ? 'receipt.camera.off' : 'receipt.photos.off')}
            </Text>
            <Text style={noteStyle}>{t(error === 'cameraOff' ? 'receipt.camera.body' : 'receipt.photos.body')}</Text>
            <View style={styles.actions}>
              <Pill label={t('receipt.openSettings')} variant="primary" onPress={() => void Linking.openSettings()} />
              <Pill label={t('receipt.file.label')} variant="secondary" onPress={() => void add('file')} />
            </View>
          </View>
        ) : (
          <View>
            <Row label={t('receipt.photo.label')} sublabel={t('receipt.photo.sub')} leading={<ActionTile icon="camera" />} emphasis onPress={() => void add('camera')} />
            <Row label={t('receipt.file.label')} sublabel={t('receipt.file.sub')} leading={<ActionTile icon="file" />} emphasis onPress={() => void add('file')} />
            <Row label={t('receipt.scan.label')} sublabel={t('receipt.scan.sub')} leading={<ActionTile icon="scan" />} emphasis onPress={() => void add('scan')} />
          </View>
        )}

        {error !== null && !permissionOff ? (
          <View style={styles.inlineError} accessibilityLiveRegion="polite" testID="receipt-capture-error">
            <Glyph name="stateShort" size={16} color={colors.danger} />
            <Text style={[{ ...textRole(pairing, 'label'), color: colors.danger }, styles.flex]}>{inline(error)}</Text>
          </View>
        ) : null}

        <Text style={noteStyle}>{t('receipt.retention.label')}</Text>
        <Text style={noteStyle}>{t('receipt.limits', { max: RECEIPT_MAX_FILES_PER_LINE, size: SIZE_MB })}</Text>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd, paddingBottom: space.sheetPadBottom },
  flex: { flex: 1 },
  card: { gap: step.tight, padding: space.cardPad, borderRadius: radii.card },
  actions: { gap: step.tight },
  inlineError: { flexDirection: 'row', alignItems: 'flex-start', gap: step.tight },
});
