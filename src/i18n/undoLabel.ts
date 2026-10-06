/**
 * C-WR-06: turns an undo step's stored label (engine `labelKey` + `labelParams`, as written
 * to `undo_log` and carried on the toast) into an i18n key plus params for the toast host and
 * the History screen.
 *
 * A step for a row with no name (Phase 1 rows predate the `name` column; transfers and some
 * imports have none) carries `{}`. i18next leaves "{{name}}" in the output verbatim when the
 * param is missing, so a name-bearing label falls back to its `undo.labelUnnamed.*` variant.
 * The choice is made here, at render time, rather than by adding label keys: the key set is
 * the engine's (`UNDO_LABEL_KEYS`) and is already stored server-side.
 */
import en from './locales/en';

export interface UndoLabelText {
  key: string;
  params: Record<string, string | number>;
}

const NAMED = en.undo.label as Readonly<Record<string, string>>;
const UNNAMED = en.undo.labelUnnamed as Readonly<Record<string, string>>;

export function undoLabelText(labelKey: string, labelParams: { n?: number; name?: string }): UndoLabelText {
  const params: Record<string, string | number> = {};
  if (labelParams.n !== undefined) params.count = labelParams.n;
  if (labelParams.name) {
    params.name = labelParams.name;
    return { key: `undo.label.${labelKey}`, params };
  }
  const usesName = NAMED[labelKey]?.includes('{{name}}') ?? false;
  if (usesName && UNNAMED[labelKey] !== undefined) return { key: `undo.labelUnnamed.${labelKey}`, params };
  return { key: `undo.label.${labelKey}`, params };
}
