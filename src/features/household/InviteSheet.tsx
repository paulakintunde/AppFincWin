// Screen 3, owner side (HH-01, D-10, D-38): make an invite, then copy the code or share the link. The link is the app's own
// fincwin:// scheme only; there is no web link. The server decides who may invite and when the household is full; the sheet
// only hides what a member cannot do. `code` lets the departure card open this with a code `reinvite_removed` already made.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Pill } from '@/ui/Pill';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { step } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { queryKeys } from '@/data/keys';
import { createInvite, inviteLink, normaliseInviteCode } from '@/db/householdInvites';
import { supabase } from '@/services/supabase';
import { plansHref } from '@/features/plans/routes';
import { PLAN_SIZES } from '@/features/plans/store/catalog';
import { smallestPlanFor, useChangePlan } from '@/features/plans/useChangePlan';
import { useWriteGate } from '@/features/plans/useWriteGate';
import { usePlanState } from '@/features/plans/usePlanState';
import { useMemberSeen } from './useMemberLabel';
import { useHouseholdScope } from './useHouseholdScope';
import { useNoticeFormat } from './noticeText';
import { ownerReasonKey, type OwnerReasonKey } from './ownerReasons';
import { withExternalActivity } from '@/services/lock/externalActivity';

export interface InviteSheetProps {
  visible: boolean;
  onClose: () => void;
  /** A code made elsewhere (reinvite_removed), shown instead of making a new one. */
  code?: string | null;
  /** When `code` is given: when it stops working. */
  expiresAt?: string | null;
}

type State = { kind: 'ready'; code: string; expiresAt: string } | { kind: 'full' } | { kind: 'failed'; reason: OwnerReasonKey };

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
  const gatedOnce = useRef(false);
  const gate = useWriteGate('invite');
  const plan = usePlanState();
  const covered = plan.status === 'trial' || plan.status === 'active' || plan.status === 'grace';
  // D-20: a Solo payer with nobody else in the home changes plan before the first invite is made.
  const soloPayer =
    !code &&
    scope.isOwner &&
    (plan.status === 'trial' || plan.status === 'active') &&
    plan.planKey === 'solo' &&
    plan.payerIsMe &&
    plan.planSize > 0 &&
    plan.members >= plan.planSize;
  const change = useChangePlan(soloPayer);
  const needed = smallestPlanFor(plan.members + 1);
  const pv = change.preview(needed);
  const busy = change.flow.state === 'pending' || change.flow.state === 'waitingServer' || change.flow.state === 'slow';
  const planFull = !code && covered && plan.planKey !== null && plan.planSize > 0 && plan.members >= plan.planSize && !soloPayer;

  // A locked or sample household cannot invite: the sheet names the action and closes (TIER-09).
  useEffect(() => {
    if (code || !gate.gated || gatedOnce.current) return;
    gatedOnce.current = true;
    gate.run(() => undefined);
    onClose();
  }, [code, gate, onClose]);

  useEffect(() => {
    if (code || started.current || !scope.online || !scope.isOwner || gate.gated || soloPayer) return;
    started.current = true;
    void (async () => {
      try {
        const res = await createInvite(supabase);
        if (res.ok) {
          setMade({
            kind: 'ready',
            code: normaliseInviteCode(res.code) ?? res.code,
            expiresAt: res.expires_at,
          });
          if (scope.householdId)
            void qc.invalidateQueries({
              queryKey: queryKeys.householdInvites(scope.householdId),
            });
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
  }, [code, scope.online, scope.isOwner, scope.householdId, qc, gate.gated, soloPayer]);

  const state: State | null = code
    ? {
        kind: 'ready',
        code: normaliseInviteCode(code) ?? code,
        expiresAt: expiresAt ?? '',
      }
    : made;

  // A member never sees this sheet (D-05); the server would refuse them anyway.
  if (!scope.isOwner && !code) return null;
  if (gate.gated && !code) return null;

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
      await withExternalActivity(() => Share.share({ message })); // 10-review (L-6)
    } catch {
      // the share sheet closing is not a failure
    }
  };

  const title = t('household.join.invite.title');
  const label = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const planName = t(`plans.paywall.cards.${plan.planKey ?? 'solo'}.name`);

  // 8a: the confirm shows what the new plan is and when it starts; the store product changes only on "Change to {Plan}".
  const nowTiming = pv.timing !== 'renewal';
  const trialContinues = pv.inTrial && pv.timing === 'trialContinues';
  const thirdInTrial = pv.inTrial && pv.timing === 'now';
  const targetName = t(`plans.paywall.cards.${needed}.name`);
  const priced = pv.monthly !== null && pv.yearly !== null;
  const confirmBody = trialContinues
    ? t('plans.invite.thirdPersonTrialContinues')
    : thirdInTrial
      ? t('plans.invite.thirdPersonTrial', {
          price: pv.offer?.priceString ?? '',
        })
      : priced
        ? t('plans.invite.soloConfirm.body', {
            monthly: pv.monthly ?? '',
            yearly: pv.yearly ?? '',
          })
        : change.offersError
          ? t('plans.paywall.states.loadFailed')
          : t('plans.paywall.states.loadingPrice');
  const failed = change.flow.state === 'failed';
  const confirmOpen = soloPayer && !busy && change.flow.state !== 'done';
  const blockedLine = pv.blocked ? t('plans.paywall.states.storeProblem') : null;

  const fullLine = (
    <View style={styles.fullBox} testID="invite-plan-full">
      <Text style={label}>{t('plans.household.full', { plan: planName, count: plan.planSize })}</Text>
      {plan.payerIsMe ? (
        <Pressable
          accessibilityRole="link"
          hitSlop={LINK_HIT_SLOP}
          onPress={() => router.push(plansHref({ mode: 'change', trigger: 'invite' }))}
          style={styles.link}
        >
          <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('plans.household.seePlans')}</Text>
        </Pressable>
      ) : (
        <Text style={label}>{t('plans.household.askPayer', { payer: plan.payerName ?? '' })}</Text>
      )}
    </View>
  );

  return (
    <>
      <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
        <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
        <SheetScroll contentContainerStyle={styles.column}>
          {!scope.online && !code ? <Text style={label}>{t('household.home.offline.helper')}</Text> : null}
          {busy ? (
            <Text accessibilityLiveRegion="polite" testID="invite-plan-busy" style={label}>
              {t('plans.paywall.states.updating')}
            </Text>
          ) : null}
          {state?.kind === 'full' && plan.planKey !== null && plan.planSize > 0 ? fullLine : null}
          {state?.kind === 'full' && !(plan.planKey !== null && plan.planSize > 0) ? (
            <Text accessibilityRole="alert" testID="invite-full" style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
              {t('household.join.invite.full', { household: scope.name })}
            </Text>
          ) : null}
          {planFull && state?.kind !== 'full' ? fullLine : null}
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
              {ready.expiresAt ? (
                <Text style={label}>
                  {t('household.join.invite.note', {
                    date: day(ready.expiresAt),
                  })}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Pill
                  label={t('household.join.invite.copyCode')}
                  variant="secondary"
                  disabled={!scope.online}
                  onPress={() => void copy()}
                />
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
      <ConfirmSheet
        visible={confirmOpen}
        title={t('plans.invite.soloConfirm.title')}
        body={confirmBody}
        cancelLabel={t('plans.invite.soloConfirm.keep')}
        confirmLabel={t('plans.invite.soloConfirm.change', {
          plan: targetName,
        })}
        onCancel={onClose}
        onConfirm={() => {
          if (!priced || !pv.offer) return;
          if (!change.run(needed)) hapticFailed();
        }}
      >
        <View style={styles.fullBox} testID="invite-solo-rows">
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {t('plans.invite.soloConfirm.newPlan', {
              plan: targetName,
              count: PLAN_SIZES[needed],
            })}
          </Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
            {nowTiming ? t('plans.invite.soloConfirm.takesEffectNow') : t('plans.invite.soloConfirm.takesEffectRenewal')}
          </Text>
          {failed ? (
            <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
              {t('plans.paywall.states.failed')}{' '}
              {change.flow.notCharged ? t('plans.paywall.states.notCharged') : t('plans.paywall.states.storeProblem')}
            </Text>
          ) : null}
          {blockedLine ? <Text style={label}>{blockedLine}</Text> : null}
        </View>
      </ConfirmSheet>
    </>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.row },
  actions: { gap: step.tight },
  fullBox: { gap: step.tight },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
