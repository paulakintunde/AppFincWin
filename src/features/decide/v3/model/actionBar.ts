/**
 * 05.3-18 (UI-SPEC "Action bar"). PURE. Left is always "Record as bought"; the right button depends on the code.
 * Exactly one button is the filled primary, except for needs_input where both are outlined and the primary
 * ("Help me check this") sits in the body. "Not buying it" is always the text button; "Check another price" is always offered (D-19).
 */
import type { Result } from '@/engine/decide/v3';
import type { ViewParam } from '../shared/params';

export interface ActionBarModel {
  readonly left: { readonly key: string; readonly primary: boolean };
  readonly right: { readonly key: string; readonly params?: Readonly<Record<string, ViewParam>>; readonly primary: boolean };
  readonly notBuyingKey: string;
  readonly anotherPriceKey: string;
  readonly helpInBody: boolean;
}

const K = 'decide.v3.ui.answer.';

export function actionBar(result: Pick<Result, 'code' | 'variant' | 'readyBy'>): ActionBarModel {
  const common = { notBuyingKey: `${K}notBuying`, anotherPriceKey: `${K}checkAnotherPrice` } as const;
  const bought = (primary: boolean) => ({ key: `${K}bought`, primary });
  switch (result.code) {
    case 'fits_month':
    case 'fits_unspent':
    case 'emergency_use':
      return { left: bought(true), right: { key: `${K}savePlan`, primary: false }, helpInBody: false, ...common };
    case 'not_yet': {
      const { readyBy, variant } = result;
      if (variant === 'payday' && readyBy !== null && readyBy.kind === 'date') {
        return {
          left: bought(false),
          right: { key: `${K}remindMe`, params: { date: { kind: 'date', iso: readyBy.date } }, primary: true },
          helpInBody: false,
          ...common,
        };
      }
      return { left: bought(false), right: { key: `${K}planIt`, primary: true }, helpInBody: false, ...common };
    }
    case 'monthly_short':
      return { left: bought(false), right: { key: `${K}savePlan`, primary: true }, helpInBody: false, ...common };
    case 'needs_input':
      return { left: bought(false), right: { key: `${K}savePlan`, primary: false }, helpInBody: true, ...common };
  }
}
