// 08-17: one place that turns a refusal from an owner RPC into a household.home.reasons.* key. Anything unlisted says "not saved".
export type OwnerReasonKey =
  | 'household.home.reasons.not_owner'
  | 'household.home.reasons.try_again'
  | 'household.home.reasons.version_conflict'
  | 'household.home.reasons.invalid_name'
  | 'household.home.reasons.unknown_currency'
  | 'household.home.reasons.not_found'
  | 'household.home.reasons.window_closed'
  | 'household.home.reasons.already_restored'
  | 'household.home.reasons.failed';

export function ownerReasonKey(reason: string): OwnerReasonKey {
  switch (reason) {
    case 'not_owner':
      return 'household.home.reasons.not_owner';
    case 'try_again':
      return 'household.home.reasons.try_again';
    case 'version_conflict':
      return 'household.home.reasons.version_conflict';
    case 'invalid_name':
      return 'household.home.reasons.invalid_name';
    case 'unknown_currency':
      return 'household.home.reasons.unknown_currency';
    case 'not_found':
    case 'not_open':
    case 'not_restorable':
      return 'household.home.reasons.not_found';
    case 'window_closed':
      return 'household.home.reasons.window_closed';
    case 'already_restored':
      return 'household.home.reasons.already_restored';
    default:
      return 'household.home.reasons.failed';
  }
}
