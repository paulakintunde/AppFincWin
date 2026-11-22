// Pure (no React or I/O). 09-21: maps the shared income steps' saved answers onto levelFor's `shape` input.
// 'paid' (Q4) gives income_types, 'season' (Q6) gives income_pattern. Lumpy when any paid answer is irregular or the
// person says income changes by season; otherwise steady. Salary, pension or benefits and "no fixed income" read steady.

const IRREGULAR_PAID: readonly string[] = ['commission_or_tips', 'freelance', 'own_business'];

export function deriveIncomeShape(
  incomeTypes: readonly string[] | null | undefined,
  incomePattern: 'steady' | 'variable' | 'seasonal' | null | undefined
): 'steady' | 'lumpy' {
  if (incomePattern === 'variable' || incomePattern === 'seasonal') return 'lumpy';
  if ((incomeTypes ?? []).some((v) => IRREGULAR_PAID.includes(v))) return 'lumpy';
  return 'steady';
}
