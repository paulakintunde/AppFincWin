/** 09-16: a plan date in the person's device locale and timezone (UI-SPEC section 7). Empty input gives an empty string. */
export function formatPlanDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}
