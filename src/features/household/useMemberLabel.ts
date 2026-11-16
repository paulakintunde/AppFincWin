// D-32: the only way a component turns a user id into words. Hidden names show the colour name; a missing id is
// "Former member"; a member who left gets a "(left)" suffix. Reads members through useHouseholdMembers and
// the 08-12 copy keys household.members.you / former / leftSuffix.
import { useCallback } from 'react';
import { useHouseholdMembers } from '@/data/queries/household';
import { memberLabel } from '@/engine/household/memberLabel';
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
