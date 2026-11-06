/* eslint-disable import/first */
// The services/supabase client reads env at import; stub it so the real registry can load.
jest.mock('@/services/supabase', () => ({ supabase: {} }));

import { QueryClient } from '@tanstack/react-query';
import { registerMutationDefaults } from '../index';
import { registerRecordBoughtMutations } from '../boughtWrite';
import { mutationKeys } from '@/data/keys';

describe('05.3 mutation registry', () => {
  it('registerMutationDefaults does not throw and defines recordBought', () => {
    const qc = new QueryClient();
    expect(() => registerMutationDefaults(qc)).not.toThrow();
    expect(qc.getMutationDefaults(mutationKeys.recordBought)?.mutationFn).toBeDefined();
  });

  it('registerRecordBoughtMutations registers on its own', () => {
    const qc = new QueryClient();
    registerRecordBoughtMutations(qc);
    expect(qc.getMutationDefaults(mutationKeys.recordBought)?.mutationFn).toBeDefined();
  });
});
