// D-32: the ONLY place that turns a member into a label. Never read profiles.full_name.
// Returns data, not UI words: the UI translates 'you', 'former' and the "(left)" suffix.

export const MEMBER_COLOUR_NAMES = ['Green', 'Rust', 'Slate', 'Ochre', 'Plum', 'Teal'] as const;

export interface LabelMember {
  readonly userId: string | null;
  readonly displayName: string | null;
  readonly nameHidden: boolean;
  readonly colourKey: number;
  readonly left: boolean;
}

export type MemberLabel =
  | { readonly kind: 'you' }
  | { readonly kind: 'former' }
  | { readonly kind: 'colour'; readonly text: string; readonly left?: true }
  | { readonly kind: 'name'; readonly text: string; readonly left?: true };

export function memberLabel(member: LabelMember, viewerId: string): MemberLabel {
  if (member.userId === viewerId) return { kind: 'you' };
  if (member.userId === null) return { kind: 'former' };
  const leftFlag = member.left ? ({ left: true } as const) : {};
  const shown = member.displayName === null ? '' : member.displayName.trim();
  if (member.nameHidden || shown === '') {
    return { kind: 'colour', text: MEMBER_COLOUR_NAMES[member.colourKey]!, ...leftFlag };
  }
  return { kind: 'name', text: member.displayName!, ...leftFlag };
}
