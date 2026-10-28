import { SETUP_STEP_KEYS } from '@/features/decide/setup/setupFlow';
import { i18n } from '@/i18n';
import { renderSetupStep, stepTitleKey } from '../setupRegistry';

jest.mock('expo-notifications', () => ({}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({}) }));
jest.mock('@/features/you/useProfile', () => ({ useProfile: () => ({ profile: null }) }));

describe('setup registry', () => {
  it('has a body for every step but Welcome (the shell draws it)', () => {
    for (const step of SETUP_STEP_KEYS) {
      const node = renderSetupStep(step, null, { mode: 'stepper', onReadyChange: () => undefined });
      if (step === 'welcome') expect(node).toBeNull();
      else expect({ step, drawn: node !== null }).toEqual({ step, drawn: true });
    }
  });

  it('every step title key resolves to real copy', () => {
    for (const step of SETUP_STEP_KEYS) {
      const key = stepTitleKey(step);
      expect({ key, found: i18n.exists(key) }).toEqual({ key, found: true });
    }
  });
});
