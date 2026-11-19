// 09-14: a plan date (an ISO instant from the server or the model) in the person's language. Display only.
export function formatPlanDate(iso: string | null, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(d);
  }
}
