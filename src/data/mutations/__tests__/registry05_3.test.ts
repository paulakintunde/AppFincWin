/* eslint-disable import/first */
// The services/supabase client reads env at import; stub it so the real registry can load.
jest.mock('@/services/supabase', () => ({ supabase: {} }));

import { QueryClient } from '@tanstack/react-query';
import { registerMutationDefaults } from '../index';
import { registerDecideGoAheadMutations } from '../decideGoAhead';
import { mutationKeys } from '@/data/keys';

// 08.1-09: Record as bought has one writer (the Go ahead mutation); the old recordBought key is gone.
describe('05.3 mutation registry', () => {
  it('registerMutationDefaults does not throw and defines the Go ahead write', () => {
    const qc = new QueryClient();
    expect(() => registerMutationDefaults(qc)).not.toThrow();
    expect(qc.getMutationDefaults(mutationKeys.decideGoAhead)?.mutationFn).toBeDefined();
    expect('recordBought' in mutationKeys).toBe(false);
  });

  it('registerDecideGoAheadMutations registers on its own', () => {
    const qc = new QueryClient();
    registerDecideGoAheadMutations(qc);
    expect(qc.getMutationDefaults(mutationKeys.decideGoAhead)?.mutationFn).toBeDefined();
  });
});
