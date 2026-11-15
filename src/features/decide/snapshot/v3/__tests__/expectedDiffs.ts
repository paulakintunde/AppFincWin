// 05.5-12 (ARC-03, D-07): every named difference between the old input path (buildDecideSnapshot -> buildV3Inputs) and the new
// builder (buildInputs). Test-only data. Each entry is a path pattern into V3Inputs and the reason the new answer differs.
// builderParity.test.ts fails on a difference no entry covers, and on an entry that matches nothing (a stale entry). Plan 05.5-16
// shows this list to the owner on the changed-answers page; nothing here is approved until then.
export interface ExpectedDiff {
  /** Matches the dotted path of a differing value, such as `limits.lines[5]`. */
  readonly pathPattern: RegExp;
  /** At least 20 characters, in plain words. */
  readonly reason: string;
  /** Which rule or gap names it. */
  readonly source: string;
}

export const EXPECTED_DIFFS: readonly ExpectedDiff[] = [
  {
    pathPattern: /^limits\.lines\[\d+\]/,
    reason: 'Category limits now come from the category cap set on Activity; caps typed into the rules document no longer count.',
    source: 'D-11 cap store',
  },
  {
    pathPattern: /^debts\[\d+\]\.seriesId$/,
    reason: 'A debt now says which regular payment covers it, so the same payment is not counted a second time.',
    source: 'gap: seriesId',
  },
];
