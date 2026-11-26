// 10.1-21 (D-06, D-09; UI-SPEC section 3): the row of 64 x 64 thumbnails above the receipt actions. A picture shows itself, a PDF
// shows the file glyph with "PDF", a scan shows its first page and its page count. A file still on the phone carries the
// savedOffline badge and "Waiting"; one that failed carries the caution glyph and "Didn't upload". Links to stored pictures are made
// on demand, held in this component's state only, and never cached (T-10.1-21-01).
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Glyph } from '@/ui/icons/Glyph';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { signedUrlFor } from '@/services/receipts/openReceipt';
import type { ReceiptGroup } from './receiptGroups';

export const THUMB = 64;

export interface ReceiptStripProps {
  groups: readonly ReceiptGroup[];
  showCents?: boolean;
  /** Opens the viewer at this group (a stored or waiting receipt) or, for one that failed, the Try again / Remove menu. */
  onOpen(groupId: string): void;
}

function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

export function ReceiptStrip({ groups, showCents = false, onOpen }: ReceiptStripProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const formatter = useMoneyFormatter(showCents);
  const [urls, setUrls] = useState<Record<string, string>>({});

  // First page of each stored picture, signed when the strip appears (a link lasts 60 s and is never kept anywhere else).
  useEffect(() => {
    let alive = true;
    for (const g of groups) {
      const page = g.pages[0];
      if (g.state !== 'stored' || page === undefined || page.objectPath === null || !isImage(page.mime)) continue;
      const path = page.objectPath;
      void signedUrlFor(path).then((url) => {
        if (alive && url !== null) setUrls((u) => (u[path] === url ? u : { ...u, [path]: url }));
      });
    }
    return () => {
      alive = false;
    };
  }, [groups]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} testID="receipt-strip">
      {groups.map((g, i) => {
        const page = g.pages[0];
        const uri = page === undefined ? null : (page.localUri ?? (page.objectPath !== null ? (urls[page.objectPath] ?? null) : null));
        const showPicture = page !== undefined && isImage(page.mime) && uri !== null;
        const kindWord = g.kind === 'file' && page !== undefined && !isImage(page.mime) ? t('receipt.kind.pdf') : t(`receipt.kind.${g.kind}`);
        const stateWord =
          g.state === 'waiting' ? t('receipt.waitingShort') : g.state === 'failed' ? t('receipt.uploadFailed.label') : null;
        const caption = [kindWord, g.state === 'stored' ? formatter.formatDate(g.createdAt.slice(0, 10), 'short') : null]
          .filter((p): p is string => p !== null)
          .join(' · ');
        const spokenKind = g.state === 'stored' ? kindWord : `${kindWord}, ${g.state === 'waiting' ? t('receipt.thumb.waiting.a11y') : t('receipt.uploadFailed.label')}`;
        return (
          <Pressable
            key={g.groupId}
            testID={`receipt-thumb-${g.groupId}`}
            accessibilityRole="button"
            accessibilityLabel={t('receipt.thumb.a11y', { n: i + 1, count: groups.length, kind: spokenKind })}
            onPress={() => onOpen(g.groupId)}
            style={styles.item}
          >
            <View style={[styles.thumb, { backgroundColor: colors.fill1 }]}>
              {showPicture ? (
                <Image source={{ uri }} style={styles.picture} accessibilityIgnoresInvertColors />
              ) : (
                <View style={styles.fileTile}>
                  <Glyph name={g.kind === 'scan' ? 'scan' : g.kind === 'photo' ? 'receipt' : 'file'} size={24} color={colors.inkMuted} />
                  {page !== undefined && !isImage(page.mime) ? (
                    <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('receipt.kind.pdf')}</Text>
                  ) : null}
                </View>
              )}
              {g.state === 'waiting' ? (
                <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                  <Glyph name="savedOffline" size={16} color={colors.inkMuted} />
                </View>
              ) : null}
              {g.state === 'failed' ? (
                <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                  <Glyph name="caution" size={16} color={colors.danger} />
                </View>
              ) : null}
            </View>
            <Text numberOfLines={2} style={{ ...textRole(pairing, 'label'), color: g.state === 'failed' ? colors.danger : colors.inkMuted }}>
              {stateWord ?? caption}
            </Text>
            {g.kind === 'scan' && g.pages.length > 1 ? (
              <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('receipt.pages', { count: g.pages.length })}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { gap: space.gapMd, paddingVertical: step.tight },
  item: { width: THUMB + step.tight, minHeight: space.touchMin, gap: step.hair },
  thumb: { width: THUMB, height: THUMB, borderRadius: radii.glyphTile, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  picture: { width: THUMB, height: THUMB },
  fileTile: { alignItems: 'center', justifyContent: 'center', gap: step.hair },
  badge: { position: 'absolute', right: 2, bottom: 2, borderRadius: radii.pill, padding: 2 },
});
