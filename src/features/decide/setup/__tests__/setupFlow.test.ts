import {
  SETUP_STEP_KEYS,
  firstUnansweredNeeded,
  isAnswered,
  isNeeded,
  remainingNeeded,
  sectionOf,
  setupStatus,
  visibleSteps,
  type SetupFacts,
  type SetupStepKey,
} from '../setupFlow';

function facts(over: Partial<SetupFacts> = {}): SetupFacts {
  return {
    incomeTypes: ['salary_or_wages'],
    hasRegularPaySeries: true,
    method: null,
    spreadMonths: null,
    steadyAmount: null,
    holdMonths: null,
    fullMonthsOfRecords: 6,
    moneyAccountIds: ['a1'],
    accountIdsWithUse: ['a1'],
    everydayOverride: null,
    unspentAnchorSet: true,
    roughTyped: false,
    setupDoneAt: null,
    ...over,
  };
}

describe('sectionOf', () => {
  it('maps every step', () => {
    const expected: Record<SetupStepKey, string | null> = {
      welcome: null,
      paid: 'income',
      pay: 'income',
      season: 'income',
      method: 'income',
      other: 'income',
      regular: 'regular',
      loans: 'regular',
      saving: 'regular',
      everyday: 'spending',
      unusual: 'spending',
      accountUse: 'money',
      emergency: 'money',
      envelopes: 'money',
      unspent: 'money',
      share: 'answers',
      detail: 'answers',
      reminders: 'answers',
      summary: null,
    };
    for (const k of SETUP_STEP_KEYS) expect(sectionOf(k)).toBe(expected[k]);
  });
});

describe('isNeeded', () => {
  it('paid, regular, everyday, unspent are always needed', () => {
    const f = facts({ incomeTypes: null });
    for (const k of ['paid', 'regular', 'everyday', 'unspent'] as const) {
      expect(isNeeded(k, f)).toBe(true);
    }
  });
  it('pay follows salary or pension', () => {
    expect(isNeeded('pay', facts({ incomeTypes: ['salary_or_wages'] }))).toBe(true);
    expect(isNeeded('pay', facts({ incomeTypes: ['pension_or_benefits'] }))).toBe(true);
    expect(isNeeded('pay', facts({ incomeTypes: ['freelance'] }))).toBe(false);
    expect(isNeeded('pay', facts({ incomeTypes: null }))).toBe(false);
  });
  it('method follows changing income', () => {
    for (const t of ['commission_or_tips', 'freelance', 'own_business', 'none']) {
      expect(isNeeded('method', facts({ incomeTypes: [t] }))).toBe(true);
    }
    expect(isNeeded('method', facts({ incomeTypes: ['salary_or_wages'] }))).toBe(false);
    expect(isNeeded('method', facts({ incomeTypes: null }))).toBe(false);
  });
  it('accountUse needs a money account', () => {
    expect(isNeeded('accountUse', facts())).toBe(true);
    expect(isNeeded('accountUse', facts({ moneyAccountIds: [] }))).toBe(false);
  });
  it('optional steps are never needed', () => {
    const optional: SetupStepKey[] = [
      'welcome', 'season', 'other', 'loans', 'saving', 'unusual', 'emergency',
      'envelopes', 'share', 'detail', 'reminders', 'summary',
    ];
    for (const k of optional) expect(isNeeded(k, facts())).toBe(false);
  });
});

describe('visibleSteps', () => {
  it('full flow, salaried, in order, unusual shown with 2+ months', () => {
    expect(visibleSteps(facts(), 'full')).toEqual([
      'welcome', 'paid', 'pay', 'season', 'other', 'regular', 'loans', 'saving',
      'everyday', 'unusual', 'accountUse', 'emergency', 'envelopes', 'unspent',
      'share', 'detail', 'reminders', 'summary',
    ]);
  });
  it('full flow hides unusual under 2 months, pay and accountUse when not applicable', () => {
    const v = visibleSteps(
      facts({ incomeTypes: ['freelance'], fullMonthsOfRecords: 1, moneyAccountIds: [] }),
      'full',
    );
    expect(v).not.toContain('unusual');
    expect(v).not.toContain('pay');
    expect(v).not.toContain('accountUse');
    expect(v.indexOf('season')).toBeLessThan(v.indexOf('method'));
    expect(v).toContain('method');
  });
  it('standalone shows only the income steps', () => {
    expect(visibleSteps(facts(), 'standalone')).toEqual(['paid', 'pay', 'season', 'other']);
    expect(visibleSteps(facts({ incomeTypes: ['own_business'] }), 'standalone')).toEqual([
      'paid', 'season', 'method', 'other',
    ]);
  });
  it('minimum setup is exactly the 6 needed screens (D-03)', () => {
    const v = visibleSteps(facts(), 'full').filter((k) => isNeeded(k, facts()));
    expect(v).toEqual(['paid', 'pay', 'regular', 'everyday', 'accountUse', 'unspent']);
    expect(v).toHaveLength(6);
  });
  it('15 screens (UI-SPEC says about 12) excluding welcome and summary for the UI-SPEC example', () => {
    const f = facts({ fullMonthsOfRecords: 1 });
    const n = visibleSteps(f, 'full').filter((k) => k !== 'welcome' && k !== 'summary').length;
    expect(n).toBe(15);
  });
});

describe('isAnswered', () => {
  it('paid', () => {
    expect(isAnswered('paid', facts())).toBe(true);
    expect(isAnswered('paid', facts({ incomeTypes: [] }))).toBe(false);
    expect(isAnswered('paid', facts({ incomeTypes: null }))).toBe(false);
  });
  it('pay', () => {
    expect(isAnswered('pay', facts())).toBe(true);
    expect(isAnswered('pay', facts({ hasRegularPaySeries: false }))).toBe(false);
  });
  it('method and its follow-ups', () => {
    expect(isAnswered('method', facts())).toBe(false);
    expect(isAnswered('method', facts({ method: 'match' }))).toBe(true);
    expect(isAnswered('method', facts({ method: 'spread' }))).toBe(false);
    expect(isAnswered('method', facts({ method: 'spread', spreadMonths: 6 }))).toBe(true);
    expect(isAnswered('method', facts({ method: 'steady' }))).toBe(false);
    expect(isAnswered('method', facts({ method: 'steady', steadyAmount: 100 }))).toBe(true);
    expect(isAnswered('method', facts({ method: 'balance' }))).toBe(false);
    expect(isAnswered('method', facts({ method: 'balance', holdMonths: 2 }))).toBe(true);
  });
  it('regular is always answered', () => {
    expect(isAnswered('regular', facts())).toBe(true);
  });
  it('everyday', () => {
    expect(isAnswered('everyday', facts({ fullMonthsOfRecords: 3 }))).toBe(true);
    expect(isAnswered('everyday', facts({ fullMonthsOfRecords: 2 }))).toBe(false);
    expect(isAnswered('everyday', facts({ fullMonthsOfRecords: 0, everydayOverride: 0 }))).toBe(true);
  });
  it('accountUse', () => {
    expect(isAnswered('accountUse', facts())).toBe(true);
    expect(isAnswered('accountUse', facts({ accountIdsWithUse: [] }))).toBe(false);
    expect(isAnswered('accountUse', facts({ moneyAccountIds: [] }))).toBe(true);
  });
  it('unspent', () => {
    expect(isAnswered('unspent', facts())).toBe(true);
    expect(isAnswered('unspent', facts({ unspentAnchorSet: false }))).toBe(false);
  });
  it('optional steps count as answered', () => {
    expect(isAnswered('season', facts())).toBe(true);
  });
});

describe('setupStatus', () => {
  it('not_started', () => {
    expect(setupStatus(facts({ incomeTypes: null }))).toBe('not_started');
  });
  it('rough when a needed step is unanswered', () => {
    expect(setupStatus(facts({ unspentAnchorSet: false }))).toBe('rough');
  });
  it('rough when started and paid is missing but setup was marked done', () => {
    expect(setupStatus(facts({ incomeTypes: null, setupDoneAt: 'x' }))).toBe('rough');
  });
  it('rough when override set under 3 months', () => {
    expect(setupStatus(facts({ everydayOverride: 500, fullMonthsOfRecords: 2 }))).toBe('rough');
  });
  it('rough when a rough figure was typed', () => {
    expect(setupStatus(facts({ roughTyped: true }))).toBe('rough');
  });
  it('done', () => {
    expect(setupStatus(facts())).toBe('done');
    expect(setupStatus(facts({ everydayOverride: 500 }))).toBe('done');
  });
});

describe('firstUnansweredNeeded / remainingNeeded', () => {
  it('returns null and empty when complete', () => {
    expect(firstUnansweredNeeded(facts())).toBeNull();
    expect(remainingNeeded(facts())).toEqual([]);
  });
  it('lists in visible order', () => {
    const f = facts({ hasRegularPaySeries: false, unspentAnchorSet: false });
    expect(firstUnansweredNeeded(f)).toBe('pay');
    expect(remainingNeeded(f)).toEqual(['pay', 'unspent']);
  });
});
