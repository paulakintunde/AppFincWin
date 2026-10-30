import type { ConfidenceReason } from '@/engine/decide/v3';
import en from '@/i18n/locales/en';
import { confidenceChip } from '../confidence';

jest.setTimeout(60000);

describe('confidenceChip', () => {
  it('firm shows nothing', () => {
    expect(confidenceChip({ level: 'firm', reasons: [] }).show).toBe(false);
  });

  it('rough from typed figures reads "Rough, from your figures" (D-57)', () => {
    const c = confidenceChip({ level: 'rough', reasons: ['rough_figures'] });
    expect(c.show).toBe(true);
    expect(c.labelKey).toBe('decide.v3.ui.answer.rough');
    expect(c.tone).toBe('warn');
  });

  it('fair lists its reason keys', () => {
    const c = confidenceChip({ level: 'fair', reasons: ['few_months'] });
    expect(c).toEqual({
      show: true,
      labelKey: 'decide.v3.ui.confidence.level.fair',
      tone: 'neutral',
      reasonKeys: ['decide.v3.ui.confidence.reason.few_months'],
    });
  });

  it('rough without typed figures is a warn chip with the level label', () => {
    const c = confidenceChip({ level: 'rough', reasons: ['no_setup'] });
    expect(c.labelKey).toBe('decide.v3.ui.confidence.level.rough');
    expect(c.tone).toBe('warn');
  });

  it('one key per reason, and every key exists in en.ts', () => {
    const all: ConfidenceReason[] = [
      'few_months', 'early_in_month', 'under_logged', 'unsaved_changes', 'unspent_stale', 'unspent_drifted',
      'rough_figures', 'provisional_rates', 'no_setup', 'user_said_cover', 'pay_missed',
    ];
    const c = confidenceChip({ level: 'fair', reasons: all });
    expect(c.reasonKeys).toHaveLength(all.length);
    const ui = (en as unknown as { decide: { v3: { ui: { confidence: { reason: Record<string, string> } } } } }).decide.v3.ui.confidence.reason;
    for (const r of all) expect(ui[r]).toBeTruthy();
  });
});
