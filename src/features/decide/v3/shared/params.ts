// 05.3: a value a v3 view-model hands to the screen; the screen formats it (useV3Format). Money is integer minor units.
export type ViewParam =
  | { readonly kind: 'money'; readonly minor: number }
  | { readonly kind: 'month'; readonly ym: string }
  | { readonly kind: 'date'; readonly iso: string }
  | { readonly kind: 'count'; readonly n: number };
export type ViewParams = Readonly<Record<string, ViewParam>>;
