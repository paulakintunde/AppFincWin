// 10.1-25 (SCN-01, D-13; UI-SPEC section 4): the capture choice behind Add's "Scan a receipt": take a photo, choose an image
// from files, or scan a document. The picked files go back as they are (LocalReceiptFile, so their size reaches the upload
// outbox) and the caller owns them from then on. A PDF cannot be read on the phone, so the file picker asks for images only.
// The same calm errors and permission card as the Receipt sheet. Nothing here uploads, and nothing logs file names or paths.
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
import { RECEIPT_MAX_BYTES } from '@/services/receipts/limits';
import { defaultPickFileDeps, pickFile } from '@/services/receipts/pickFile';
import { pickPhoto } from '@/services/receipts/pickPhoto';
import { scanDocument } from '@/services/receipts/scanDocument';
import type { LocalReceiptFile, PickResult, ReceiptKind } from '@/services/receipts/types';
import { discardFiles } from './scanFiles';
import { errorFor, type ReceiptActionError } from './useReceiptActions';

type Source = 'camera' | 'file' | 'scan';

export interface CaptureChooserProps {
  visible: boolean;
  onClose(): void;
  /** The pages in order (a scan gives one per page). The caller deletes them when the scan is closed. */
  onPicked(images: LocalReceiptFile[], kind: ReceiptKind): void;
}

const SIZE_MB = Math.round(RECEIPT_MAX_BYTES / (1024 * 1024));
const IMAGES_ONLY: readonly string[] = ['image/*'];

function capture(source: Source): Promise<PickResult> {
  if (source === 'camera') return pickPhoto('camera');
  if (source === 'scan') return scanDocument();
  return pickFile(defaultPickFileDeps(IMAGES_ONLY));
}

function ActionTile({ icon }: { icon: IconName }) {
  const { colors } = useTheme();
  return <IconTile icon={icon} color={colors.ink} tint={colors.fill1} />;
}

export function CaptureChooser(props: CaptureChooserProps) {
  if (!props.visible) return null;
  return <ChooserBody {...props} />;
}

function ChooserBody({ onClose, onPicked }: CaptureChooserProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const [error, setError] = useState<ReceiptActionError | null>(null);
  const [busy, setBusy] = useState(false);
  const permissionOff = error === 'cameraOff' || error === 'photosOff';

  const add = async (source: Source) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const picked = await capture(source);
      if (!picked.ok) {
        setError(errorFor(picked, source));
        return;
      }
      if (picked.files.some((f) => f.mime === 'application/pdf')) {
        discardFiles(picked.files.map((f) => f.uri));
        setError('badType');
        return;
      }
      onPicked(picked.files, picked.kind);
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
      default:
        return t('receipt.addFailed');
    }
  };

  const noteStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const title = t('shell.quick.scanReceipt');

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        {permissionOff ? (
          <View style={[styles.card, { backgroundColor: colors.fill1 }]} testID="capture-chooser-permission">
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
          <View style={styles.inlineError} accessibilityLiveRegion="polite" testID="capture-chooser-error">
            <Glyph name="stateShort" size={16} color={colors.danger} />
            <Text style={[{ ...textRole(pairing, 'label'), color: colors.danger }, styles.flex]}>{inline(error)}</Text>
          </View>
        ) : null}
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
