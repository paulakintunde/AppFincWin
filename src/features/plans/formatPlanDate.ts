// 09-14 / 09-16: a plan date (an ISO instant from the server or the model) in the person's language and timezone
// (UI-SPEC section 7). Display only. Empty or invalid input gives an empty string. Without a locale the device locale is used.
export function formatPlanDate(iso: string | null | undefined, locale?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(d);
  }
}
