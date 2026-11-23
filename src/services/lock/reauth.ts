/**
 * D-29: after 10 wrong PINs the person signs in again with Apple or Google. The same user keeps the phone copy and
 * unsent queue (and sets a new PIN); a different user, or an unknown lock owner, gets the normal sign-out wipe.
 */
export function decideAfterReauth(lockedUserId: string | null, signedInUserId: string): 'keep' | 'wipe' {
  return lockedUserId !== null && lockedUserId === signedInUserId ? 'keep' : 'wipe';
}
