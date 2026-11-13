/**
 * 06.1-05 (D-18): safety-net settings (D51 / N07 locked, N07U unlocked), the unlock confirm (D52), the first-answer
 * safety-net question (D-14, D-28) and the intro gate labels around legal.decideIntro.*. Owner plan: 18.
 * Draft copy, signed under D-08. Unlocking lives only here (D-14, D-20).
 */
export const safetyNet = {
  // 06.1-58 (DN-11): the settings screen's own title, so it is not a second "Safety net" beside Setup > Safety net.
  settingsTitle: 'Safety net settings',
  settings: {
    title: 'Safety net',
    sub: 'Money kept for emergencies. Set in Grow.',
    locked: 'Locked',
    unlocked: 'Unlocked',
    tileLockedA11y: 'Locked, no answer spends it',
    tileUnlockedA11y: 'Unlocked, answers may use it',
    inNow: '{{amount}} in it now',
    // 06.1-58 (A-SN-1): the amount is said once, as the display figure; the legend under it names the two parts.
    legendInIt: 'In it now',
    legendGoal: 'Goal {{amount}}, set in Grow',
    lockSwitch: 'Safety net locked',
    lockSub: 'Answers never spend it. Answers that would need it say Not yet.',
    beforeTitle: 'Before you unlock it',
    beforeBody: 'Answers will be allowed to use your safety net. Every answer that uses it says so at the top, with how much it uses.',
    beforeLockAgain: 'You can lock it again at any time.',
    unlock: 'Unlock for answers',
    lockAgain: 'Lock it again',
    changeSize: 'Change the size in Grow',
    lockedToast: 'Safety net locked.',
    unlockedToast: 'Safety net unlocked for answers.',
    emptyTitle: 'No safety net yet',
    emptyBody: 'Answers hold nothing back until one is set. Set an amount, or choose Not set yet.',
    setAmount: 'Set an amount',
  },
  unlock: {
    title: 'Let answers use your safety net?',
    body: 'Answers can then use up to {{amount}} of it. Each one says how much it uses.',
    unlock: 'Unlock',
    keep: 'Keep it locked',
  },
  firstAnswer: {
    question: 'Do you have a safety net? About how much?',
    helper: 'Money kept for emergencies. Answers keep it out of what counts as spare.',
    amount: 'About how much',
    notSet: 'Not set yet',
    notSetNote: 'Answers then hold nothing back.',
    save: 'Save and see the answer',
  },
  intro: {
    step: 'Before your first answer',
  },
} as const;
