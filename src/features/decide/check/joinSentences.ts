/**
 * 05-15 (D-56 a11y): joins the verdict card's parts into one live-region label. Empty parts are dropped and each
 * part's own trailing full stop is trimmed before joining, so the label never reads "..". The last part keeps no stop,
 * matching the card's previous `{{chip}}. ... {{basis}}` shape.
 */
const TRAILING_STOPS = /[.\s]+$/;

export function joinSentences(parts: readonly string[]): string {
  return parts
    .map((p) => p.trim().replace(TRAILING_STOPS, ''))
    .filter((p) => p.length > 0)
    .join('. ');
}
