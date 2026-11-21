// Screen 1 (HH-01, HH-03, HH-10): the Household home. Top to bottom: hero (name, people and currency), people, pending
// invites (owner), the removal undo card (owner, 24 h), rules, recent changes, leave, footer. A household-of-one sees the
// "Just you for now" state instead of the people and rules. Owner actions are hidden from members; the server enforces
// them (T-08-62). Every name is rendered through the member resolver (D-32). Balances (08-21) sit right after the hero.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { Chip } from '@/ui/Chip';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { Row } from '@/ui/Row';
import { Screen } from '@/ui/Screen';
import { EmptyState, accentTintOver } from '@/ui/EmptyState';
import { SyncStatusLine } from '@/ui/SyncStatusLine';
import { IconTile } from '@/ui/icons/IconTile';
import type { IconName } from '@/ui/icons/iconData';
import { FadeIn } from '@/ui/motion/FadeIn';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { useT } from '@/i18n';
import { queueToast, showToast } from '@/state/undoToast';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step, tile } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { queryKeys } from '@/data/keys';
import { useHouseholdEvents, useOpenInvites } from '@/data/queries/household';
import { cancelInvite, inviteLink, restoreInvite } from '@/db/householdInvites';
import { supabase } from '@/services/supabase';
import { plansHref } from '@/features/plans/routes';
import { usePlanState } from '@/features/plans/usePlanState';
import { ChangeLine } from './components/ChangeLine';
import { MemberAvatar } from './components/MemberAvatar';
import { DepartureCard } from './DepartureCard';
import { householdIcons } from './glyphs';
import { HouseholdCurrencySheet } from './HouseholdCurrencySheet';
import { InviteSheet } from './InviteSheet';
import { onReinvite } from './leave/reinviteRequest';
import { MemberSheet } from './MemberSheet';
import { useNoticeFormat } from './noticeText';
import { RenameHouseholdSheet } from './RenameHouseholdSheet';
import { BalancesSection } from './settle/BalancesCard';
import { DepartedBalancesCard } from './settle/DepartedBalancesCard';
import { useHouseholdScope } from './useHouseholdScope';
import { useMemberLabel } from './useMemberLabel';

/** D-10: a household holds up to six people. */
export const HOUSEHOLD_CAP = 6;

const RECENT = 5;

const href = (path: string): Href => path as Href;

export function HouseholdHomeScreen() {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const { goBack } = useBackHistory();
  const scope = useHouseholdScope();
  const { householdId, members, isOwner, online, userId } = scope;
  const label = useMemberLabel(householdId);
  const { events, unreadCount } = useHouseholdEvents(householdId, userId ?? undefined);
  const invites = useOpenInvites(householdId, isOwner).data ?? [];
  const { text, when, day } = useNoticeFormat(householdId, scope.name);
  const plan = usePlanState();

  const [memberId, setMemberId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);

  // 08-24 (D-28): Undo on the "Sam removed" toast brings a reinvite code here; the InviteSheet shows it.
  useEffect(
    () =>
      onReinvite(({ code, expiresAt }) => {
        setInviteCode({ code, expiresAt });
        setInviteOpen(true);
      }),
    [],
  );

  const alone = members.length <= 1;
  // 09-20 (UI-SPEC 13): while a plan covers the home, its size, not the old fixed six, says when the home is full. A person
  // invited past the size goes to the payer for approval, so the invite link stays.
  const planCovered = plan.status === 'trial' || plan.status === 'active' || plan.status === 'grace';
  const planKnown = planCovered && plan.planKey !== null && plan.planSize > 0;
  const full = !planCovered && members.length >= HOUSEHOLD_CAP;
  const planFull = planKnown && members.length >= plan.planSize;
  const planName = plan.planKey ? t(`plans.paywall.cards.${plan.planKey}.name`) : '';
  const payer = plan.payerName ?? '';
  const tint = accentTintOver(colors.fill1, colors.accent);
  const muted = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const metaStyle = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const refreshInvites = () => {
    if (householdId) void qc.invalidateQueries({ queryKey: queryKeys.householdInvites(householdId) });
  };

  const openInvite = () => {
    setInviteCode(null);
    setInviteOpen(true);
  };

  const copyLink = async (code: string) => {
    await Clipboard.setStringAsync(inviteLink(code));
    hapticTap();
    showToast({ kind: 'ordinary', text: { key: 'household.home.linkCopied' } });
  };

  const cancel = async (inviteId: string) => {
    try {
      const res = await cancelInvite(supabase, inviteId);
      if (!res.ok) {
        hapticFailed();
        return;
      }
      refreshInvites();
      hapticTap();
      showToast({
        kind: 'ordinary',
        text: { key: 'household.home.invites.cancelled' },
        onUndo: () => {
          void restoreInvite(supabase, inviteId)
            .then((back) => {
              if (!back.ok) queueToast({ kind: 'refusal', text: { key: 'household.home.restoreFailed' } });
              refreshInvites();
            })
            .catch(() => undefined);
        },
      });
    } catch {
      hapticFailed();
    }
  };

  const card = [styles.card, { backgroundColor: colors.surface }];
  const ruleRow = (path: string, key: 'howSplit' | 'categoryDefaults' | 'sharedAccounts', icon: IconName) => (
    <Row
      label={t(`household.home.rules.${key}`)}
      leading={<IconTile icon={icon} color={colors.accent} tint={tint} size={tile.row} />}
      chevron
      onPress={() => pushOnce(href(path))}
    />
  );

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={goBack} />
      </View>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[styles.title, { ...textRole(pairing, 'heading'), color: colors.ink }]}>
          {t('household.home.title')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? t('household.home.noticesUnread', { count: unreadCount }) : t('household.home.notices')}
          hitSlop={LINK_HIT_SLOP}
          onPress={() => pushOnce(href('/household/notices'))}
          style={styles.noticesLink}
          testID="household-notices-link"
        >
          <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('household.home.notices')}</Text>
          {unreadCount > 0 ? <Chip label={String(unreadCount)} selected /> : null}
        </Pressable>
      </View>
      <SyncStatusLine />

      <FadeIn once="household-hero" style={styles.section}>
        <View style={card}>
          <View style={styles.heroName}>
            <Text style={[styles.flex, { ...textRole(pairing, 'heading'), color: colors.ink }]}>{scope.name}</Text>
            {isOwner ? (
              <Pressable
                accessibilityRole="button"
                disabled={!online}
                accessibilityState={{ disabled: !online }}
                hitSlop={LINK_HIT_SLOP}
                onPress={() => setRenameOpen(true)}
                style={styles.linkButton}
              >
                <Text style={{ ...textRole(pairing, 'body'), color: online ? colors.accent : colors.inkFaint }}>
                  {t('household.home.rename')}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {isOwner && online ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={LINK_HIT_SLOP}
              onPress={() => setCurrencyOpen(true)}
              style={styles.linkButton}
              testID="household-currency-link"
            >
              <Text style={muted}>
                {t('household.home.sublabel', { count: members.length, currency: scope.household?.reporting_currency ?? '' })}
              </Text>
            </Pressable>
          ) : (
            <Text style={muted}>
              {t('household.home.sublabel', { count: members.length, currency: scope.household?.reporting_currency ?? '' })}
            </Text>
          )}
          {planKnown ? (
            <View style={styles.planLine} testID="household-plan-line">
              <Text style={muted}>{t('plans.household.planLine', { plan: planName, name: payer })}</Text>
              {!plan.payerIsMe ? <StatusBadge status="coveredBy" label={t('plans.household.coveredBy', { name: payer })} /> : null}
              {isOwner && !plan.payerIsMe ? <Text style={metaStyle}>{t('plans.household.notPayer', { name: payer })}</Text> : null}
            </View>
          ) : null}
          {isOwner && !online ? <Text style={metaStyle}>{t('household.home.offline.helper')}</Text> : null}
        </View>
      </FadeIn>

      {/* 08-21: balances */}
      <BalancesSection householdId={householdId} alone={alone} />
      <DepartedBalancesCard />

      {alone ? (
        <FadeIn once="household-empty" style={styles.section}>
          <EmptyState
            heading={t('household.home.empty.title')}
            body={t('household.home.empty.body')}
            icon={householdIcons.people}
            actionLabel={isOwner ? t('household.home.empty.invite') : undefined}
            onAction={isOwner ? openInvite : undefined}
          />
          <Pressable
            accessibilityRole="link"
            hitSlop={LINK_HIT_SLOP}
            onPress={() => pushOnce(href('/household/join'))}
            style={styles.centerLink}
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('household.home.empty.haveCode')}</Text>
          </Pressable>
        </FadeIn>
      ) : (
        <FadeIn once="household-people" style={styles.section}>
          <View style={card}>
            {members.map((m) => {
              const role = m.is_owner ? t('household.home.roleOwner') : m.role_label;
              return (
                <Row
                  key={m.user_id}
                  label={label(m.user_id)}
                  sublabel={role}
                  value={t('household.members.weight.value', { percent: m.weight })}
                  leading={<MemberAvatar householdId={householdId} userId={m.user_id} size={40} role={role} percent={m.weight} />}
                  chevron
                  onPress={() => setMemberId(m.user_id)}
                />
              );
            })}
            {isOwner ? (
              full ? (
                <Text style={metaStyle}>{t('household.home.people.full')}</Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !online }}
                  disabled={!online}
                  hitSlop={LINK_HIT_SLOP}
                  onPress={openInvite}
                  style={styles.linkButton}
                  testID="household-invite-link"
                >
                  <Text style={{ ...textRole(pairing, 'body'), color: online ? colors.accent : colors.inkFaint }}>
                    {t('household.home.people.invite')}
                  </Text>
                </Pressable>
              )
            ) : full ? (
              <Text style={metaStyle}>{t('household.home.people.full')}</Text>
            ) : null}
            {planFull ? (
              <View testID="household-plan-full">
                <Text style={metaStyle}>{t('plans.household.full', { plan: planName, count: plan.planSize })}</Text>
                {plan.payerIsMe ? (
                  <Pressable
                    accessibilityRole="link"
                    hitSlop={LINK_HIT_SLOP}
                    onPress={() => router.push(plansHref({ mode: 'change', trigger: 'invite' }))}
                    style={styles.linkButton}
                  >
                    <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('plans.household.seePlans')}</Text>
                  </Pressable>
                ) : (
                  <Text style={metaStyle}>{t('plans.household.askPayer', { payer })}</Text>
                )}
              </View>
            ) : null}
            {isOwner && !online ? <Text style={metaStyle}>{t('household.home.offline.helper')}</Text> : null}
          </View>
        </FadeIn>
      )}

      {isOwner && invites.length > 0 ? (
        <FadeIn once="household-invites" style={styles.section}>
          <View style={card} testID="pending-invites">
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
              {t('household.home.pendingInvites')}
            </Text>
            {invites.map((inv) => (
              <View key={inv.invite_id} style={styles.invite}>
                <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
                  {t('household.home.invites.sent', { date: day(inv.expires_at) })}
                </Text>
                <Text style={muted}>{t('household.home.invites.validForOne')}</Text>
                <View style={styles.inviteActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !online }}
                    disabled={!online}
                    hitSlop={LINK_HIT_SLOP}
                    onPress={() => void copyLink(inv.code)}
                    style={styles.linkButton}
                  >
                    <Text style={{ ...textRole(pairing, 'body'), color: online ? colors.accent : colors.inkFaint }}>
                      {t('household.home.invites.copyLink')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !online }}
                    disabled={!online}
                    hitSlop={LINK_HIT_SLOP}
                    onPress={() => void cancel(inv.invite_id)}
                    style={styles.linkButton}
                  >
                    <Text style={{ ...textRole(pairing, 'body'), color: online ? colors.danger : colors.inkFaint }}>
                      {t('household.home.invites.cancel')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </FadeIn>
      ) : null}

      <View style={styles.section}>
        <DepartureCard
          householdId={householdId}
          isOwner={isOwner}
          online={online}
          onInvite={(code, expiresAt) => {
            setInviteCode({ code, expiresAt });
            setInviteOpen(true);
          }}
        />
      </View>

      {!alone ? (
        <FadeIn once="household-rules" style={styles.section}>
          <View style={card}>
            {ruleRow('/household/split-default', 'howSplit', householdIcons.swap)}
            {ruleRow('/household/category-defaults', 'categoryDefaults', 'categories')}
            {ruleRow('/household/shared-accounts', 'sharedAccounts', 'accounts')}
          </View>
        </FadeIn>
      ) : null}

      <FadeIn once="household-changes" style={styles.section}>
        <View style={card}>
          <View style={styles.changesHead}>
            <Text accessibilityRole="header" style={[styles.flex, { ...textRole(pairing, 'bodyStrong'), color: colors.ink }]}>
              {t('household.home.recentChanges')}
            </Text>
            {events.length > RECENT ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={LINK_HIT_SLOP}
                onPress={() => pushOnce(href('/household/notices'))}
                style={styles.linkButton}
              >
                <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('household.home.seeAll')}</Text>
              </Pressable>
            ) : null}
          </View>
          {events.length === 0 ? (
            <View>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('household.home.changesEmptyTitle')}</Text>
              <Text style={muted}>{t('household.home.changesEmptyBody')}</Text>
            </View>
          ) : (
            events
              .slice(0, RECENT)
              .map((e) => <ChangeLine key={e.id} householdId={householdId} actorId={e.actor_id} text={text(e)} at={when(e.created_at)} />)
          )}
        </View>
      </FadeIn>

      {!alone ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={LINK_HIT_SLOP}
          onPress={() => pushOnce(href('/household/leave'))}
          style={[styles.linkButton, styles.leave]}
          testID="household-leave"
        >
          <Text style={{ ...textRole(pairing, 'body'), color: colors.danger }}>{t('household.members.leave')}</Text>
        </Pressable>
      ) : null}

      <Text style={[muted, styles.footer]}>{t('household.home.footer', { household: scope.name })}</Text>

      <MemberSheet visible={memberId !== null} householdId={householdId} userId={memberId ?? ''} onClose={() => setMemberId(null)} />
      <InviteSheet
        visible={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteCode(null);
          refreshInvites();
        }}
        code={inviteCode?.code ?? null}
        expiresAt={inviteCode?.expiresAt ?? null}
      />
      <RenameHouseholdSheet visible={renameOpen} onClose={() => setRenameOpen(false)} />
      <HouseholdCurrencySheet visible={currencyOpen} onClose={() => setCurrencyOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: step.row },
  title: { flexShrink: 1 },
  noticesLink: { flexDirection: 'row', alignItems: 'center', gap: step.tight, minHeight: space.touchMin },
  section: { marginTop: step.section },
  card: { padding: step.card, borderRadius: radii.card, gap: step.tight },
  flex: { flex: 1, flexShrink: 1 },
  planLine: { gap: step.hair, alignItems: 'flex-start' },
  heroName: { flexDirection: 'row', alignItems: 'center', gap: step.row },
  linkButton: { minHeight: space.touchMin, justifyContent: 'center' },
  centerLink: { minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
  invite: { gap: step.hair },
  inviteActions: { flexDirection: 'row', flexWrap: 'wrap', gap: step.card },
  changesHead: { flexDirection: 'row', alignItems: 'center', gap: step.row },
  leave: { marginTop: step.card, alignSelf: 'flex-start' },
  footer: { marginTop: step.section },
});
