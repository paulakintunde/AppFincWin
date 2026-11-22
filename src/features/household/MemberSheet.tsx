// Screen 5 (HH-03, HH-10, D-30..D-33): one member. Own row: role label, a free colour and whether others see your name or
// your colour. Owner on another member: role only. Anyone opens the weights. Roles are labels (D-31): they change nothing
// about what anyone can see or do. The server enforces every owner-only rule; the UI only hides what a person cannot do.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Text } from '@/ui/Text';
import { TextInput } from '@/ui/TextInput';
import { Chip } from '@/ui/Chip';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { SegmentedToggle } from '@/ui/SegmentedToggle';
import { WarningCard } from '@/ui/WarningCard';
import { Glyph } from '@/ui/icons/Glyph';
import { hapticFailed, hapticTap, hapticTick } from '@/ui/haptics';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useIsDirty } from '@/ui/useIsDirty';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, step } from '@/theme/layout';
import { memberColors } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { queryKeys } from '@/data/keys';
import { useHouseholdMembers } from '@/data/queries/household';
import { setMemberRole, setMyMemberDisplay, type HouseholdMemberRow, type RpcResult } from '@/db/householdMembers';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/services/supabase';
import { MemberAvatar } from './components/MemberAvatar';
import { MemberName } from './components/MemberName';
import { PartnerOptInRow } from './decide/PartnerOptInRow';
import { householdIcons } from './glyphs';
import { useMemberLabel, useMemberSeen } from './useMemberLabel';
import { WeightsSheet } from './WeightsSheet';

export interface MemberSheetProps {
  visible: boolean;
  householdId: string | null | undefined;
  userId: string;
  onClose: () => void;
}

const ROLE_KEYS = ['partner', 'flatmate', 'family', 'housemate', 'lodger'] as const;
type RoleKey = (typeof ROLE_KEYS)[number] | 'other';
const COLOUR_KEYS = ['green', 'rust', 'slate', 'ochre', 'plum', 'teal', 'navy', 'magenta', 'brown', 'orange', 'charcoal', 'brick'] as const;
export const ROLE_MAX = 24;

export function MemberSheet({ visible, householdId, userId, onClose }: MemberSheetProps) {
  const { data: members } = useHouseholdMembers(householdId);
  const row = members?.find((m) => m.user_id === userId);
  if (!visible || !row || !members) return null;
  return <MemberBody householdId={householdId} row={row} members={members} onClose={onClose} />;
}

type ReasonKey =
  | 'household.members.reasons.colour_taken'
  | 'household.members.reasons.invalid_role'
  | 'household.members.reasons.invalid_name'
  | 'household.members.reasons.not_allowed'
  | 'household.members.reasons.owner_label_fixed'
  | 'household.members.reasons.not_member'
  | 'household.members.reasons.failed';

function reasonKey(reason: string): ReasonKey {
  switch (reason) {
    case 'colour_taken':
      return 'household.members.reasons.colour_taken';
    case 'invalid_role':
      return 'household.members.reasons.invalid_role';
    case 'invalid_name':
      return 'household.members.reasons.invalid_name';
    case 'not_allowed':
      return 'household.members.reasons.not_allowed';
    case 'owner_label_fixed':
      return 'household.members.reasons.owner_label_fixed';
    case 'not_member':
      return 'household.members.reasons.not_member';
    default:
      return 'household.members.reasons.failed';
  }
}

function MemberBody({
  householdId,
  row,
  members,
  onClose,
}: {
  householdId: string | null | undefined;
  row: HouseholdMemberRow;
  members: HouseholdMemberRow[];
  onClose: () => void;
}) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const qc = useQueryClient();
  const { user } = useAuth();
  const label = useMemberLabel(householdId);
  const seen = useMemberSeen(householdId);
  const viewerRow = members.find((m) => m.user_id === user?.id);
  const isSelf = row.user_id === user?.id;
  const viewerIsOwner = viewerRow?.is_owner ?? false;
  const canEditRole = !row.is_owner && (isSelf || viewerIsOwner);
  const canEditDisplay = isSelf;
  const canRemove = viewerIsOwner && !isSelf && !row.is_owner;
  const canLeave = isSelf && !row.is_owner;

  const presetWords = ROLE_KEYS.map((k) => t(`household.members.roles.${k}`));
  const presetIndex = (presetWords as string[]).indexOf(row.role_label);
  const [roleKey, setRoleKey] = useState<RoleKey>(presetIndex >= 0 ? ROLE_KEYS[presetIndex]! : row.role_label === '' ? 'flatmate' : 'other');
  const [otherText, setOtherText] = useState(presetIndex >= 0 ? '' : row.role_label);
  const [colourKey, setColourKey] = useState(row.colour_key);
  const [nameHidden, setNameHidden] = useState(row.name_hidden);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ReasonKey | null>(null);
  const [conflict, setConflict] = useState(false);
  const [conflictBy, setConflictBy] = useState<string | null>(null);

  const roleLabel = row.is_owner
    ? t('household.members.roles.owner')
    : roleKey === 'other'
      ? otherText.trim()
      : t(`household.members.roles.${roleKey}`);
  const roleTooLong = roleKey === 'other' && otherText.trim().length > ROLE_MAX;
  const roleEmpty = roleKey === 'other' && otherText.trim().length === 0;
  const roleInvalid = canEditRole && (roleTooLong || roleEmpty);
  const roleChanged = canEditRole && roleLabel !== row.role_label;
  const displayChanged = canEditDisplay && (colourKey !== row.colour_key || nameHidden !== row.name_hidden);
  const changed = roleChanged || displayChanged;

  const [initial] = useState(() => ({ roleKey, otherText, colourKey, nameHidden }));
  const dirty = useIsDirty(initial, { roleKey, otherText, colourKey, nameHidden });

  const name = label(row.user_id);
  const preview = seen(row.user_id, { nameHidden, colourKey }).seen ?? '';
  const title = isSelf ? t('household.members.you') : name;

  const fail = (res: Extract<RpcResult, { ok: false }>) => {
    hapticFailed();
    if (res.reason === 'version_conflict') {
      setConflict(true);
      setConflictBy(typeof res.updated_by === 'string' ? res.updated_by : null);
      setFailure(null);
      if (householdId) void qc.invalidateQueries({ queryKey: queryKeys.householdMembers(householdId) });
    } else {
      setConflict(false);
      setFailure(reasonKey(res.reason));
    }
  };

  const save = async () => {
    if (saving || !changed || roleInvalid || !householdId) return;
    setSaving(true);
    setFailure(null);
    setConflict(false);
    try {
      let version = row.version;
      if (displayChanged) {
        const res = await setMyMemberDisplay(supabase, { expectedVersion: version, colourKey, nameHidden, displayName: null });
        if (!res.ok) return fail(res);
        version = typeof (res as unknown as { version?: unknown }).version === 'number' ? (res as unknown as { version: number }).version : version + 1;
      }
      if (roleChanged) {
        const res = await setMemberRole(supabase, row.user_id, roleLabel, version);
        if (!res.ok) {
          await qc.invalidateQueries({ queryKey: queryKeys.householdMembers(householdId) });
          return fail(res);
        }
      }
      await qc.invalidateQueries({ queryKey: queryKeys.householdMembers(householdId) });
      hapticTap();
      onClose();
    } catch {
      hapticFailed();
      setFailure('household.members.reasons.failed');
    } finally {
      setSaving(false);
    }
  };

  const go = (href: string) => {
    onClose();
    router.push(href as Href);
  };

  const labelStyle = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const metaStyle = { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted };

  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title} dirty={dirty}>
      <SheetHeader title={title} cancelLabel={t('record.sheet.cancel')} onCancel={onClose} />
      <SheetScroll contentContainerStyle={styles.column}>
        <View style={styles.head}>
          <MemberAvatar householdId={householdId} userId={row.user_id} size={40} />
          <View style={styles.headText}>
            <MemberName householdId={householdId} userId={row.user_id} />
            <View style={[styles.roleChip, { backgroundColor: colors.fill1 }]}>
              <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{row.is_owner ? t('household.members.roles.owner') : row.role_label}</Text>
            </View>
          </View>
        </View>

        {row.is_owner ? <Text style={labelStyle}>{t('household.members.roles.ownerHelper')}</Text> : null}

        {canEditRole ? (
          <>
            <Text style={labelStyle}>{t('household.members.roles.roleLabel')}</Text>
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('household.members.roles.roleLabel')}>
              {ROLE_KEYS.map((k) => (
                <Chip key={k} label={t(`household.members.roles.${k}`)} selected={roleKey === k} onPress={() => { hapticTick(); setRoleKey(k); }} />
              ))}
              <Chip label={t('household.members.roles.other')} selected={roleKey === 'other'} onPress={() => { hapticTick(); setRoleKey('other'); }} />
            </View>
            {roleKey === 'other' ? (
              <>
                <TextInput
                  testID="role-other-input"
                  accessibilityLabel={t('household.members.roles.otherLabel')}
                  placeholder={t('household.members.roles.otherPlaceholder')}
                  placeholderTextColor={colors.inkFaint}
                  maxLength={24}
                  value={otherText}
                  onChangeText={setOtherText}
                  style={[textRole(pairing, 'body'), styles.input, { backgroundColor: colors.fill1, color: colors.ink, borderRadius: radii.card / 2 }]}
                />
                <Text testID="role-other-counter" style={metaStyle}>
                  {t('household.members.roles.otherCounter', { count: otherText.trim().length })}
                </Text>
              </>
            ) : null}
            <Text style={labelStyle}>{t('household.members.roles.helper')}</Text>
          </>
        ) : null}

        {canEditDisplay ? (
          <>
            <Text style={labelStyle}>{t('household.members.colours.label')}</Text>
            <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel={t('household.members.colours.label')}>
              {COLOUR_KEYS.map((ck, i) => {
                const holder = members.find((m) => m.colour_key === i && m.user_id !== row.user_id);
                const colourName = t(`household.members.colours.${ck}`);
                const selected = colourKey === i;
                const spoken = holder
                  ? t('household.members.colours.takenBy', { colour: colourName, name: label(holder.user_id) })
                  : t('household.members.colours.free', { colour: colourName });
                return (
                  <View key={ck} style={styles.swatchCell}>
                    <Pressable
                      testID={`colour-${ck}`}
                      accessibilityRole="radio"
                      accessibilityLabel={spoken}
                      accessibilityState={{ checked: selected, selected, disabled: holder !== undefined }}
                      disabled={holder !== undefined}
                      onPress={() => { hapticTick(); setColourKey(i); }}
                      style={[styles.swatch, { borderColor: selected ? colors.accent : 'transparent' }]}
                    >
                      <View style={[styles.swatchFill, { backgroundColor: memberColors[i], opacity: holder ? 0.45 : 1 }]}>
                        {holder ? <MemberAvatar householdId={householdId} userId={holder.user_id} size={28} /> : null}
                      </View>
                    </Pressable>
                    <Text style={metaStyle}>{colourName}</Text>
                  </View>
                );
              })}
            </View>

            <Text style={labelStyle}>{t('household.members.nameShown.label')}</Text>
            <SegmentedToggle
              accessibilityLabel={t('household.members.nameShown.label')}
              value={nameHidden ? 'colour' : 'name'}
              onChange={(k) => setNameHidden(k === 'colour')}
              options={[
                { key: 'name', label: t('household.members.nameShown.myName') },
                { key: 'colour', label: t('household.members.nameShown.myColour') },
              ]}
            />
            <Text testID="name-preview" style={metaStyle}>
              {t('household.members.nameShown.preview', { name: preview })}
            </Text>
            <Text style={metaStyle}>{t('household.members.nameShown.helper')}</Text>
          </>
        ) : null}

        <Row
          label={t('household.members.weight.label')}
          value={t('household.members.weight.value', { percent: row.weight })}
          leading={<Glyph name={householdIcons.people} size={20} color={colors.inkDim} />}
          chevron
          onPress={() => setWeightsOpen(true)}
        />

        {!isSelf ? <PartnerOptInRow householdId={householdId} partnerId={row.user_id} /> : null}

        {conflict ? (
          <WarningCard
            tone="soft"
            title={conflictBy ? t('household.members.reasons.changedFirst', { name: label(conflictBy) }) : t('household.members.reasons.conflictTitle')}
            value=""
            body={[t('household.members.reasons.version_conflict')]}
          />
        ) : null}
        {failure ? (
          <Text accessibilityRole="alert" testID="member-failure" style={{ ...textRole(pairing, 'label'), color: colors.danger }}>
            {t(failure)}
          </Text>
        ) : null}

        {changed ? (
          <Pill label={t('household.members.saveChanges')} variant="primary" onPress={() => void save()} disabled={roleInvalid} pending={saving} />
        ) : null}

        {canRemove ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={LINK_HIT_SLOP}
            onPress={() => go(`/household/remove?userId=${row.user_id}`)}
            style={styles.textButton}
            testID="member-remove"
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.danger }}>{t('household.members.remove', { name })}</Text>
          </Pressable>
        ) : null}
        {canLeave ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={LINK_HIT_SLOP}
            onPress={() => go('/household/leave')}
            style={styles.textButton}
            testID="member-leave"
          >
            <Text style={{ ...textRole(pairing, 'body'), color: colors.danger }}>{t('household.members.leave')}</Text>
          </Pressable>
        ) : null}
      </SheetScroll>
      <WeightsSheet visible={weightsOpen} householdId={householdId} onClose={() => setWeightsOpen(false)} />
    </Sheet>
  );
}

const SWATCH = space.touchMin;

const styles = StyleSheet.create({
  column: { gap: step.tight },
  head: { flexDirection: 'row', alignItems: 'center', gap: step.row },
  headText: { flex: 1, flexShrink: 1, gap: step.hair },
  roleChip: { alignSelf: 'flex-start', paddingHorizontal: step.tight, paddingVertical: 2, borderRadius: radii.pill },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: step.tight },
  input: { paddingHorizontal: step.card, paddingVertical: space.rowPadDense, minHeight: space.touchMin },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: step.row },
  swatchCell: { alignItems: 'center', gap: step.hair },
  swatch: { width: SWATCH + 4, height: SWATCH + 4, borderRadius: (SWATCH + 4) / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatchFill: { width: SWATCH - 4, height: SWATCH - 4, borderRadius: (SWATCH - 4) / 2, alignItems: 'center', justifyContent: 'center' },
  textButton: { minHeight: space.touchMin, justifyContent: 'center' },
});
