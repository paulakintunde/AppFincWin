// Screen 3, invitee side (HH-01, HH-02, HH-15, D-04, D-06, D-09, D-38): enter or paste a code (or arrive with one from the
// fincwin://invite link), see who invited you and which household, then join with one tap. Joining needs a connection.
// Every code that cannot be used (unknown, used, expired, cancelled) gets the same message, so the screen never says which
// (HH-15). Too many tries, a full household and being in another household each have their own plain message. Nothing joins
// until the person taps Join: a link only fills the code and shows the preview (T-08-66).
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { Pill } from '@/ui/Pill';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { WarningCard } from '@/ui/WarningCard';
import { StatusBadge } from '@/ui/status/StatusBadge';
import { FadeIn } from '@/ui/motion/FadeIn';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { BackButton } from '@/shell/header/BackButton';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { useAccounts } from '@/data/queries/accounts';
import { resetHouseholdScope, useHouseholdId } from '@/data/queries/household';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { normaliseInviteCode, previewInvite, redeemInvite, type InvitePreview } from '@/db/householdInvites';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/services/supabase';
import { formatPlanDate } from '@/features/plans/formatPlanDate';
import { storefrontCountry } from '@/features/plans/store/purchasesClient';
import { onboardingHref } from '@/features/plans/routes';
import { useUserSetup } from '@/features/levels/useUserSetup';
import { setupDone } from '@/features/onboarding/firstRun';
import { useSaveUserSetup } from '@/data/mutations/userSetup';
import { useInviterLabel } from '../useMemberLabel';
import { WhatsSharedSheet } from './WhatsSharedSheet';
import { formatTypedCode, takePendingInvite } from './pendingInvite';

export const WHATS_SHARED_SEEN_KEY = (householdId: string) => `fincwin.whatsSharedSeen.${householdId}`;

const href = (path: string): Href => path as Href;

/** D-39: the support route for a refused switch. A plain mail link; the text never names the store country. */
const SUPPORT_URL = 'mailto:support@fincwin.com';

type Phase =
  | { kind: 'enter' }
  | { kind: 'checking' }
  | { kind: 'preview'; code: string; preview: InvitePreview }
  | { kind: 'waiting'; payer: string }
  | { kind: 'switchRule'; code: string; preview: InvitePreview; openFrom: string }
  | { kind: 'error'; text: string };

export interface JoinScreenProps {
  /** A code from the fincwin://invite link, when the screen was opened by one. */
  initialCode?: string;
}

export function JoinScreen({ initialCode }: JoinScreenProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const { goBack } = useBackHistory();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const oldHouseholdId = useHouseholdId(userId ?? undefined).data ?? null;
  const hasAccounts = (useAccounts(oldHouseholdId ?? undefined).data ?? []).length > 0;
  const { isOnline: online } = useSyncStatus();
  const inviterName = useInviterLabel();
  const setup = useUserSetup();
  const { saveUserSetup } = useSaveUserSetup();
  // 09-23 (D-30): a person with no finished setup goes on to the partner questions after joining, not to the household.
  const needsSetup = !setup.loading && !setupDone(setup.data);
  const afterJoin = () => {
    if (needsSetup && userId !== null) {
      saveUserSetup({ userId, patch: { partnerVersion: true }, baseVersion: setup.data?.version ?? 0 });
      router.replace(onboardingHref('partner'));
      return;
    }
    router.replace(href('/household'));
  };
  // A new person who arrived here first (an invite waiting at sign-in) and does not join goes on to the first-run questions.
  const leave = () => {
    if (needsSetup) router.replace(onboardingHref('first_run'));
    else goBack();
  };

  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'enter' });
  const [joining, setJoining] = useState(false);
  const [shared, setShared] = useState<{ household: string } | null>(null);
  const started = useRef(false);

  const code = normaliseInviteCode(input);

  const errorText = (reason: string, household?: string | null, inviter?: string): string => {
    if (reason === 'slow_down') return t('household.join.errors.rateLimited');
    if (reason === 'full') return t('household.join.errors.full', { household: household ?? '' });
    // HH-15: unknown, used, expired and cancelled all end here, with the same words.
    return t('household.join.errors.invalid', { inviter: inviter ?? t('household.join.inviterFallback') });
  };

  const check = async (value: string) => {
    const normal = normaliseInviteCode(value);
    if (normal === null) return;
    if (!online) {
      setPhase({ kind: 'error', text: t('household.join.errors.offline') });
      return;
    }
    setPhase({ kind: 'checking' });
    try {
      const res = await previewInvite(supabase, normal);
      if (!res.ok) {
        hapticFailed();
        setPhase({ kind: 'error', text: errorText(res.reason) });
        return;
      }
      if (res.already_member) {
        router.replace(href('/household'));
        return;
      }
      if (res.full) {
        hapticFailed();
        setPhase({ kind: 'error', text: errorText('full', res.household_name) });
        return;
      }
      setPhase({ kind: 'preview', code: normal, preview: res });
    } catch {
      hapticFailed();
      setPhase({ kind: 'error', text: t('household.reasons.try_again') });
    }
  };

  // A code that arrived with the link or was stored before sign-in fills the field and shows the preview (never joins).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const waiting = initialCode ?? (await takePendingInvite().catch(() => null));
      if (!waiting) return;
      const normal = normaliseInviteCode(waiting);
      if (normal === null) return;
      setInput(normal);
      void check(normal);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on arrival
  }, []);

  const join = async (value: string, preview: InvitePreview) => {
    if (joining || userId === null) return;
    setJoining(true);
    try {
      // Read once for the server's switch rule and passed straight on; it is never stored or shown (T-09-70).
      const country = await storefrontCountry().catch(() => null);
      const res = await redeemInvite(supabase, value, country);
      if (!res.ok) {
        if (res.reason === 'needs_approval') {
          // D-21: the person waits; they cannot join, even provisionally, until the payer's bigger plan goes through.
          setPhase({ kind: 'waiting', payer: inviterName(preview) });
          return;
        }
        hapticFailed();
        if (res.reason === 'switch_rule') {
          setPhase({ kind: 'switchRule', code: value, preview, openFrom: typeof res.open_from === 'string' ? res.open_from : '' });
          return;
        }
        if (res.reason === 'in_other_household') {
          setPhase({ kind: 'preview', code: value, preview: { ...preview, in_other_household: true } });
        } else {
          setPhase({ kind: 'error', text: errorText(res.reason, preview.household_name) });
        }
        return;
      }
      resetHouseholdScope(qc, userId, oldHouseholdId);
      // 06.2 D-20: joining is a light tap, not a milestone.
      hapticTap();
      const household = res.household_name ?? preview.household_name ?? '';
      let seen = false;
      try {
        seen = (await AsyncStorage.getItem(WHATS_SHARED_SEEN_KEY(res.household_id))) !== null;
        if (!seen) await AsyncStorage.setItem(WHATS_SHARED_SEEN_KEY(res.household_id), '1');
      } catch {
        // If the mark cannot be read or written the card shows once more rather than never.
      }
      if (seen) afterJoin();
      else setShared({ household });
    } catch {
      hapticFailed();
      setPhase({ kind: 'error', text: t('household.reasons.try_again') });
    } finally {
      setJoining(false);
    }
  };

  const spelled = [...input.replace(/-/g, '')].join(', ');
  const meta = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };
  const checking = phase.kind === 'checking';

  return (
    <Screen scroll>
      <View style={styles.back}>
        <BackButton variant="compact" onPress={leave} />
      </View>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
        {t('household.join.title')}
      </Text>

      <View style={styles.section}>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{t('household.join.codeLabel')}</Text>
        <TextInput
          testID="join-code-input"
          accessibilityLabel={spelled ? t('household.join.codeA11y', { spelled }) : t('household.join.codeLabel')}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          maxLength={14}
          value={input}
          onChangeText={(text) => {
            setInput(formatTypedCode(text));
            if (phase.kind !== 'enter') setPhase({ kind: 'enter' });
          }}
          style={[
            textRole(pairing, 'body'),
            styles.input,
            { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2 },
          ]}
        />
        <Text style={meta}>{t('household.join.codeHelper')}</Text>
        {phase.kind !== 'preview' && phase.kind !== 'waiting' && phase.kind !== 'switchRule' ? (
          <Pill
            label={t('household.join.check')}
            variant="primary"
            disabled={code === null || !online}
            pending={checking}
            onPress={() => void check(input)}
          />
        ) : null}
        {!online ? <Text style={meta}>{t('household.join.errors.offline')}</Text> : null}
      </View>

      {phase.kind === 'error' ? (
        <View style={styles.section} testID="join-error">
          <Text accessibilityRole="alert" style={{ ...textRole(pairing, 'body'), color: colors.danger }}>
            {phase.text}
          </Text>
        </View>
      ) : null}

      {phase.kind === 'waiting' ? (
        <FadeIn style={styles.section} testID="join-waiting">
          <View style={styles.badge}>
            <StatusBadge status="waitingApproval" label={t('plans.invite.waiting.badge')} />
          </View>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.ink }}>
            {t('plans.invite.waiting.heading', { payer: phase.payer })}
          </Text>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.inkDim }}>
            {t('plans.invite.waiting.body', { payer: phase.payer })}
          </Text>
          <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={leave} style={styles.notNow}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('household.join.gotIt')}</Text>
          </Pressable>
        </FadeIn>
      ) : null}

      {phase.kind === 'switchRule' ? (
        <FadeIn style={styles.section} testID="join-switch-rule">
          <WarningCard
            tone="soft"
            title={t('plans.switchRule.title', { date: formatPlanDate(phase.openFrom) })}
            value=""
            body={[t('plans.switchRule.body')]}
          />
          <Pressable
            accessibilityRole="link"
            hitSlop={LINK_HIT_SLOP}
            onPress={() => void Linking.openURL(SUPPORT_URL)}
            style={styles.notNow}
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('plans.switchRule.contact')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={leave} style={styles.notNow}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('household.join.notNow')}</Text>
          </Pressable>
        </FadeIn>
      ) : null}

      {phase.kind === 'preview' ? (
        <FadeIn style={styles.section}>
          <View style={[styles.card, { backgroundColor: colors.fill1 }]} testID="join-preview">
            <Text style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
              {t('household.join.preview', { inviter: inviterName(phase.preview), household: phase.preview.household_name ?? '' })}
            </Text>
            <Text style={meta}>{t('household.join.previewCount', { count: phase.preview.member_count })}</Text>
            {hasAccounts ? <Text style={meta}>{t('household.join.recordsMoveIn')}</Text> : null}
          </View>
          {phase.preview.in_other_household ? (
            <View style={styles.section} testID="join-in-other">
              <WarningCard tone="soft" title={t('household.join.inAnother.title')} value="" body={[]} />
              <Pill label={t('household.join.inAnother.go')} variant="secondary" onPress={() => router.replace(href('/household'))} />
            </View>
          ) : (
            <View style={styles.section}>
              <Pill
                label={t('household.join.joinCta', { household: phase.preview.household_name ?? '' })}
                variant="primary"
                disabled={!online}
                pending={joining}
                onPress={() => void join(phase.code, phase.preview)}
              />
            </View>
          )}
          <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={leave} style={styles.notNow}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('household.join.notNow')}</Text>
          </Pressable>
        </FadeIn>
      ) : null}

      <WhatsSharedSheet
        visible={shared !== null}
        household={shared?.household ?? ''}
        onDone={() => {
          setShared(null);
          afterJoin();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: space.gapMd },
  section: { marginTop: step.section, gap: step.tight },
  input: { paddingHorizontal: step.card, paddingVertical: space.rowPadDense, minHeight: space.touchMin },
  card: { padding: step.card, borderRadius: radii.card, gap: step.hair },
  badge: { alignSelf: 'flex-start' },
  notNow: { minHeight: space.touchMin, justifyContent: 'center', alignSelf: 'flex-start' },
});
