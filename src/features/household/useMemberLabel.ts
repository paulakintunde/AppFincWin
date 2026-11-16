// D-32: the only way a component turns a user id into words. Hidden names show the colour name; a missing id is
// "Former member"; a member who left gets a "(left)" suffix. Reads members through useHouseholdMembers and
// the 08-12 copy keys household.members.you / former / leftSuffix.
import { useCallback } from 'react';
import { useHouseholdMembers } from '@/data/queries/household';
import { MEMBER_COLOUR_NAMES, memberLabel } from '@/engine/household/memberLabel';
import { useAuth } from '@/features/auth/AuthProvider';
import { useT } from '@/i18n';

export interface MemberLabelOptions {
  /** The person has since left the household. */
  left?: boolean;
}

export function useMemberLabel(householdId: string | null | undefined): (userId: string | null, opts?: MemberLabelOptions) => string {
  const t = useT();
  const { user } = useAuth();
  const viewerId = user?.id ?? '';
  const { data: members } = useHouseholdMembers(householdId);

  return useCallback(
    (userId, opts) => {
      const row = userId === null ? undefined : members?.find((m) => m.user_id === userId);
      // A person who is no longer in the member list has no colour or name to show: say "Former member", not a made-up colour.
      if (userId !== null && userId !== viewerId && members && !row) return t('household.members.former');
      const label = memberLabel(
        {
          userId,
          displayName: row?.display_name ?? null,
          nameHidden: row?.name_hidden ?? false,
          colourKey: row?.colour_key ?? 0,
          left: opts?.left ?? false,
        },
        viewerId,
      );
      if (label.kind === 'you') return t('household.members.you');
      if (label.kind === 'former') return t('household.members.former');
      return label.left ? t('household.members.leftSuffix', { name: label.text }) : label.text;
    },
    [members, viewerId, t],
  );
}

export interface MemberSeen {
  /** 0 to 5, an index into the six member colours. */
  colourKey: number;
  /** What other members see for this person: their shown name, or the colour name when it is hidden. Null for someone not listed. */
  seen: string | null;
  /** The colour name, whatever the name setting. */
  colourName: string;
}

/**
 * D-32: what OTHER members see for a person, even when that person is the viewer (useMemberLabel says "You" for the
 * viewer). Used by the avatar initial and the member sheet's "Others see" preview. `override` previews an unsaved
 * name-hidden or colour choice. Lives here so no other feature file reads the name columns.
 */
export function useMemberSeen(
  householdId: string | null | undefined,
): (userId: string, override?: { nameHidden?: boolean; colourKey?: number }) => MemberSeen {
  const { data: members } = useHouseholdMembers(householdId);
  return useCallback(
    (userId, override) => {
      const row = members?.find((m) => m.user_id === userId);
      const colourKey = override?.colourKey ?? row?.colour_key ?? 0;
      const colourName = MEMBER_COLOUR_NAMES[colourKey] ?? MEMBER_COLOUR_NAMES[0];
      if (!row) return { colourKey, seen: null, colourName };
      const label = memberLabel(
        {
          userId,
          displayName: row.display_name,
          nameHidden: override?.nameHidden ?? row.name_hidden,
          colourKey,
          left: false,
        },
        '',
      );
      return { colourKey, seen: label.kind === 'name' || label.kind === 'colour' ? label.text : null, colourName };
    },
    [members],
  );
}
