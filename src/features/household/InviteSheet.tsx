// Screen 3, owner side (HH-01, D-10, D-38): make an invite, then copy the code or share the link. The link is the app's own
// fincwin:// scheme only; there is no web link. The server decides who may invite and when the household is full; the sheet
// only hides what a member cannot do. `code` lets the departure card open this with a code `reinvite_removed` already made.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { queryKeys } from '@/data/keys';
import { createInvite, inviteLink, normaliseInviteCode } from '@/db/householdInvites';
import { supabase } from '@/services/supabase';
import { useMemberSeen } from './useMemberLabel';
import { useHouseholdScope } from './useHouseholdScope';
import { useNoticeFormat } from './noticeText';
import { ownerReasonKey, type OwnerReasonKey } from './ownerReasons';

export interface InviteSheetProps {
  visible: boolean;
  onClose: () => void;
  /** A code made elsewhere (reinvite_removed), shown instead of making a new one. */
  code?: string | null;
  /** When `code` is given: when it stops working. */
  expiresAt?: string | null;
}

type State =
  | { kind: 'ready'; code: string; expiresAt: string }
  | { kind: 'full' }
  | { kind: 'failed'; reason: OwnerReasonKey };

export function InviteSheet({ visible, onClose, code, expiresAt }: InviteSheetProps) {
  // The body mounts once per opening, so each opening makes (at most) one invite and starts clean.
  if (!visible) return null;
  return <InviteBody onClose={onClose} code={code} expiresAt={expiresAt} />;
}

function InviteBody({ onClose, code, expiresAt }: Omit<InviteSheetProps, 'visible'>) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const scope = useHouseholdScope();
  const { day } = useNoticeFormat(scope.householdId, scope.name);
  const seen = useMemberSeen(scope.householdId);
  const [made, setMade] = useState<State | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (code || started.current || !scope.online || !scope.isOwner) return;
    started.current = true;
    void (async () => {
      try {
        const res = await createInvite(supabase);
        if (res.ok) {
          setMade({ kind: 'ready', code: normaliseInviteCode(res.code) ?? res.code, expiresAt: res.expires_at });
          if (scope.householdId) void qc.invalidateQueries({ queryKey: queryKeys.householdInvites(scope.householdId) });
        } else if (res.reason === 'full') {
          setMade({ kind: 'full' });
        } else {
          hapticFailed();
          setMade({ kind: 'failed', reason: ownerReasonKey(res.reason) });
        }
      } catch {
        hapticFailed();
        setMade({ kind: 'failed', reason: 'household.home.reasons.failed' });
      }
    })();
  }, [code, scope.online, scope.isOwner, scope.householdId, qc]);

  const state: State | null = code ? { kind: 'ready', code: normaliseInviteCode(code) ?? code, expiresAt: expiresAt ?? '' } : made;

  // A member never sees this sheet (D-05); the server would refuse them anyway.
  if (!scope.isOwner && !code) return null;

  const ready = state?.kind === 'ready' ? state : null;
  const inviter = scope.userId ? (seen(scope.userId).seen ?? '') : '';

  const copy = async () => {
    if (!ready || !scope.online) return;
    await Clipboard.setStringAsync(ready.code);
    hapticTap();
    AccessibilityInfo.announceForAccessibility(t('household.join.invite.codeCopied'));
    setCopied(true);
  };
  const share = async () => {
    if (!ready || !scope.online) return;
    const message = `${t('household.join.invite.shareMessage', { inviter, household: scope.name, code: ready.code })} ${inviteLink(ready.code)}`;
    try {
      await Share.share({ message });
    } catch {
      // the share sheet closing is not a failure
    }
  };

  const title = t('household.join.invite.title');
  const label = { ...textRole(pairing, 'label'), color: colors.inkMuted };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        {!scope.online && !code ? <Text style={label}>{t('household.home.offline.helper')}</Text> : null}
        {state?.kind === 'full' ? (
          <Text accessibilityRole="alert" testID="invite-full" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {t('household.join.invite.full', { household: scope.name })}
          </Text>
        ) : null}
        {state?.kind === 'failed' ? (
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {t(state.reason)}
          </Text>
        ) : null}
        {ready ? (
          <>
            <Text
              accessibilityLabel={ready.code.replace(/-/g, '').split('').join(' ')}
              testID="invite-code"
              style={{ ...textRole(pairing, 'heading'), color: colors.ink }}
            >
              {ready.code}
            </Text>
            {ready.expiresAt ? <Text style={label}>{t('household.join.invite.note', { date: day(ready.expiresAt) })}</Text> : null}
            <View style={styles.actions}>
              <Pill label={t('household.join.invite.copyCode')} variant="secondary" disabled={!scope.online} onPress={() => void copy()} />
              <Pill label={t('household.join.invite.share')} variant="primary" disabled={!scope.online} onPress={() => void share()} />
            </View>
            {copied ? (
              <Text accessibilityLiveRegion="polite" style={label}>
                {t('household.join.invite.codeCopied')}
              </Text>
            ) : null}
          </>
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.row },
  actions: { gap: step.tight },
});
