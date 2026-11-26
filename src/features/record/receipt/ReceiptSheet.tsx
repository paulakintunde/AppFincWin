// 10.1-21 (RCP-01, RCP-03, RCP-04, D-06..D-09, D-21; UI-SPEC section 3): the Receipt sheet. Thumbnails of what is attached, the
// three ways to add one (photo, file, scan), an optional "Read this receipt" row supplied by the scan flow, Remove all, and the
// plain sentences that say who can see the receipts, how long they stay and how many fit. Always states who can see them (D-07).
import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { ProgressRing } from '@/ui/ProgressRing';
import { Glyph } from '@/ui/icons/Glyph';
import { IconTile } from '@/ui/icons/IconTile';
import type { IconName } from '@/ui/icons/iconData';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { TransactionRow } from '@/db/rows';
import { RECEIPT_MAX_BYTES, RECEIPT_MAX_FILES_PER_LINE } from '@/services/receipts/limits';
import { signedUrlFor } from '@/services/receipts/openReceipt';
import { useRecordContext } from '../useRecordContext';
import { ReceiptStrip, THUMB } from './ReceiptStrip';
import { ReceiptViewer } from './ReceiptViewer';
import { useReceiptActions, type ReceiptActionError } from './useReceiptActions';

export interface ReceiptSheetProps {
  visible: boolean;
  line: TransactionRow;
  householdId: string;
  onClose(): void;
  /** The scan flow (10.1-24) supplies this; the "Read this receipt" row shows only when it is given and a picture is attached. */
  onRead?: (images: { uri: string; mime: string }[]) => void;
}

const SIZE_MB = Math.round(RECEIPT_MAX_BYTES / (1024 * 1024));

export function ReceiptSheet(props: ReceiptSheetProps) {
  if (!props.visible) return null;
  return <ReceiptBody {...props} />;
}

function ActionTile({ icon, tone = 'ink' }: { icon: IconName; tone?: 'ink' | 'danger' }) {
  const { colors } = useTheme();
  return <IconTile icon={icon} color={tone === 'danger' ? colors.danger : colors.ink} tint={tone === 'danger' ? colors.dangerTint3 : colors.fill1} />;
}

function ReceiptBody({ line, householdId, onClose, onRead }: ReceiptSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const actions = useReceiptActions(householdId, line.id);
  const { groups, error, busy } = actions;
  const [viewerAt, setViewerAt] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmOne, setConfirmOne] = useState<string | null>(null);

  const shared = line.is_shared === true;
  const hasFiles = groups.length > 0;
  const hasPicture = groups.some((g) => g.pages.some((p) => p.mime.startsWith('image/')));
  const permissionOff = error === 'cameraOff' || error === 'photosOff';

  const openGroup = (groupId: string) => {
    const g = groups.find((x) => x.groupId === groupId);
    if (g?.state === 'failed') setMenuFor(groupId);
    else setViewerAt(groupId);
  };

  const read = async () => {
    if (onRead === undefined) return;
    const images: { uri: string; mime: string }[] = [];
    for (const g of groups) {
      for (const p of g.pages) {
        if (!p.mime.startsWith('image/')) continue;
        const uri = p.localUri ?? (p.objectPath !== null ? await signedUrlFor(p.objectPath) : null);
        if (uri !== null) images.push({ uri, mime: p.mime });
      }
    }
    if (images.length > 0) onRead(images);
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
        {/* D-07: who can see these files, always shown and never dismissible. */}
        <View style={[styles.note, { backgroundColor: colors.fill1 }]} testID="receipt-visibility">
          <Glyph name={shared ? 'household' : 'privacy'} size={16} color={colors.inkMuted} />
          <Text style={[noteStyle, styles.flex]}>{t(shared ? 'receipt.visible.shared' : 'receipt.visible.private')}</Text>
        </View>

        {hasFiles ? <ReceiptStrip groups={groups} showCents={rc.showCents} onOpen={openGroup} /> : null}

        {menuFor !== null ? (
          <View style={[styles.menu, { backgroundColor: colors.fill1 }]} testID="receipt-failed-menu">
            <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{t('receipt.uploadFailed.label')}</Text>
            <Text style={noteStyle}>{t('receipt.uploadFailed.body')}</Text>
            <View style={styles.menuActions}>
              <Pill
                label={t('receipt.viewer.retry')}
                variant="primary"
                onPress={() => {
                  void actions.retry(menuFor);
                  setMenuFor(null);
                }}
              />
              <Pill
                label={t('receipt.viewer.remove')}
                variant="danger"
                onPress={() => {
                  setConfirmOne(menuFor);
                  setMenuFor(null);
                }}
              />
            </View>
          </View>
        ) : null}

        {busy ? (
          <View style={[styles.loading, { backgroundColor: colors.fill1 }]} accessible accessibilityLabel={t('receipt.loading.a11y')} testID="receipt-loading">
            <ProgressRing percent={30} size={36} accessibilityLabel={t('receipt.loading.a11y')} />
          </View>
        ) : null}

        {permissionOff ? (
          <View style={[styles.menu, { backgroundColor: colors.fill1 }]} testID="receipt-permission-card">
            <IconTile icon="camera" size={48} color={colors.ink} tint={colors.surface} />
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
              {t(error === 'cameraOff' ? 'receipt.camera.off' : 'receipt.photos.off')}
            </Text>
            <Text style={noteStyle}>{t(error === 'cameraOff' ? 'receipt.camera.body' : 'receipt.photos.body')}</Text>
            <View style={styles.menuActions}>
              <Pill label={t('receipt.openSettings')} variant="primary" onPress={() => void Linking.openSettings()} />
              <Pill label={t('receipt.file.label')} variant="secondary" onPress={() => void actions.add('file')} />
            </View>
          </View>
        ) : (
          <View>
            <Row
              label={t('receipt.photo.label')}
              sublabel={t('receipt.photo.sub')}
              leading={<ActionTile icon="camera" />}
              emphasis
              onPress={() => void actions.add('camera')}
            />
            <Row
              label={t('receipt.file.label')}
              sublabel={t('receipt.file.sub')}
              leading={<ActionTile icon="file" />}
              emphasis
              onPress={() => void actions.add('file')}
            />
            <Row
              label={t('receipt.scan.label')}
              sublabel={t('receipt.scan.sub')}
              leading={<ActionTile icon="scan" />}
              emphasis
              onPress={() => void actions.add('scan')}
            />
            {onRead !== undefined && hasPicture ? (
              <Row
                label={t('receipt.read.label')}
                sublabel={t('receipt.read.sub')}
                leading={<ActionTile icon="checkIt" />}
                emphasis
                onPress={() => void read()}
              />
            ) : null}
            {hasFiles ? (
              <Row
                label={t('receipt.removeAll.label')}
                sublabel={t('receipt.removeAll.sub')}
                leading={<ActionTile icon="delete" tone="danger" />}
                emphasis
                onPress={() => setConfirmAll(true)}
              />
            ) : null}
          </View>
        )}

        {error !== null && !permissionOff ? (
          <View style={styles.inlineError} accessibilityLiveRegion="polite" testID="receipt-error">
            <Glyph name="stateShort" size={16} color={colors.danger} />
            <Text style={[{ ...textRole(pairing, 'label'), color: colors.danger }, styles.flex]}>{inline(error)}</Text>
          </View>
        ) : null}

        <Text style={noteStyle}>{t('receipt.retention.label')}</Text>
        {!hasFiles ? <Text style={noteStyle}>{t('receipt.retention.export')}</Text> : null}
        <Text style={noteStyle}>{t('receipt.limits', { max: RECEIPT_MAX_FILES_PER_LINE, size: SIZE_MB })}</Text>
      </SheetScroll>

      <ReceiptViewer
        visible={viewerAt !== null}
        groups={groups}
        startGroupId={viewerAt ?? undefined}
        onClose={() => setViewerAt(null)}
        onRemove={(groupId) => void actions.removeGroup(groupId)}
      />
      <ConfirmSheet
        visible={confirmAll}
        body={t('receipt.removeAll.confirm', { count: groups.length })}
        cancelLabel={t('receipt.removeAll.keep')}
        confirmLabel={t('receipt.removeAll.label')}
        destructive
        onCancel={() => setConfirmAll(false)}
        onConfirm={() => {
          setConfirmAll(false);
          void actions.removeAll();
        }}
      />
      <ConfirmSheet
        visible={confirmOne !== null}
        body={t('receipt.removeOne.confirm')}
        cancelLabel={t('receipt.removeOne.keep')}
        confirmLabel={t('receipt.removeOne.confirmButton')}
        destructive
        onCancel={() => setConfirmOne(null)}
        onConfirm={() => {
          const id = confirmOne;
          setConfirmOne(null);
          if (id !== null) void actions.removeGroup(id);
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: space.gapMd, paddingBottom: space.sheetPadBottom },
  flex: { flex: 1 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: step.tight, padding: space.cardPad, borderRadius: radii.card },
  menu: { gap: step.tight, padding: space.cardPad, borderRadius: radii.card },
  menuActions: { gap: step.tight },
  loading: { width: THUMB, height: THUMB, borderRadius: radii.glyphTile, alignItems: 'center', justifyContent: 'center' },
  inlineError: { flexDirection: 'row', alignItems: 'flex-start', gap: step.tight },
});
