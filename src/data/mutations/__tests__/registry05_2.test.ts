// The services/supabase client reads env at import; stub it so the real registry can load.
jest.mock('@/services/supabase', () => ({ supabase: {} }));

import { QueryClient } from '@tanstack/react-query';
import { registerMutationDefaults } from '../index';
import { registerDecideSetupMutations } from '../decideSetup';
import { registerAccountUseMutations } from '../accountUse';
import { registerSeriesAttributeMutations } from '../seriesAttributes';
import { registerDismissalMutations } from '../dismissals';
import { registerIncomeTagMutations } from '../incomeTags';
import { registerRefundLinkMutations } from '../refundLinks';
import { registerDecideAnswerMutations } from '../decideAnswers';

describe('05.2 mutation registry', () => {
  it('exports the seven register functions', () => {
    for (const fn of [
      registerDecideSetupMutations,
      registerAccountUseMutations,
      registerSeriesAttributeMutations,
      registerDismissalMutations,
      registerIncomeTagMutations,
      registerRefundLinkMutations,
      registerDecideAnswerMutations,
    ]) {
      expect(typeof fn).toBe('function');
      expect(() => fn(new QueryClient())).not.toThrow();
    }
  });

  it('registerMutationDefaults runs without throwing', () => {
    expect(() => registerMutationDefaults(new QueryClient())).not.toThrow();
  });
});
