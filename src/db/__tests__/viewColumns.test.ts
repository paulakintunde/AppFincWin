/**
 * Regression guard for the 05.2 walkthrough bug: a `select *` view freezes its column list when it is created, so a
 * column added to the table later is missing from the view until the view is re-created. This replays the migrations in
 * order, works out each view's final column list, and asserts every column the app selects from that view is in it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

/** Each view the app reads, and the source constant that holds the select list used against it. */
const APP_VIEW_SELECTS: { view: string; file: string; constant: string }[] = [
  { view: 'transactions_active', file: 'src/db/transactions.ts', constant: 'TRANSACTION_COLUMNS' },
  { view: 'statement_periods_live', file: 'src/db/statementPeriods.ts', constant: 'COLUMNS' },
];

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const CONSTRAINT_START = /^(constraint|primary|unique|check|foreign|exclude|like)\b/i;

function computeViewColumns(): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  const views = new Map<string, string[]>();
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

  const event =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(|alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?public\.(\w+)\s+([^;]*);|create\s+(?:or\s+replace\s+)?view\s+public\.(\w+)\s+(?:with\s*\([^)]*\)\s*)?as\s+select\s+([\s\S]*?)\s+from\s+public\.(\w+)/gi;

  for (const file of files) {
    const sql = stripComments(readFileSync(join(MIGRATIONS, file), 'utf8'));
    event.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = event.exec(sql)) !== null) {
      if (m[1]) {
        // Walk to the matching close paren of the column list.
        let depth = 1;
        let i = event.lastIndex;
        const start = i;
        while (i < sql.length && depth > 0) {
          if (sql[i] === '(') depth += 1;
          if (sql[i] === ')') depth -= 1;
          i += 1;
        }
        const cols: string[] = [];
        for (const item of splitTopLevel(sql.slice(start, i - 1))) {
          if (CONSTRAINT_START.test(item)) continue;
          cols.push((item.split(/\s+/)[0] ?? '').replace(/"/g, ''));
        }
        tables.set(m[1], cols);
      } else if (m[2]) {
        const cols = tables.get(m[2]);
        if (!cols) continue;
        for (const clause of splitTopLevel(m[3] ?? '')) {
          const addName = /^add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/i.exec(clause)?.[1];
          if (addName && !cols.includes(addName)) cols.push(addName);
          const dropName = /^drop\s+column\s+(?:if\s+exists\s+)?"?(\w+)"?/i.exec(clause)?.[1];
          if (dropName && cols.includes(dropName)) cols.splice(cols.indexOf(dropName), 1);
        }
      } else if (m[4]) {
        const list = (m[5] ?? '').trim();
        const source = tables.get(m[6] ?? '') ?? [];
        if (/^(\w+\.)?\*$/.test(list)) {
          views.set(m[4], [...source]); // a select * freezes the table's columns as they are right now
        } else {
          views.set(
            m[4],
            splitTopLevel(list).map((item) => {
              const alias = /\s+as\s+"?(\w+)"?$/i.exec(item);
              return alias?.[1] ?? (item.split('.').pop() ?? '').trim();
            })
          );
        }
      }
    }
  }
  return views;
}

/** `rate:rate::text` -> `rate`; `id` -> `id`. The name is what the select list asks the view for. */
function selectedViewColumns(list: string): string[] {
  return list.split(',').map((raw) => {
    const item = raw.trim();
    const colon = item.indexOf(':');
    const name = colon === -1 ? item : item.slice(colon + 1);
    return (name.split('::')[0] ?? '').trim();
  }).filter(Boolean);
}

describe('views expose every column the app selects from them', () => {
  const views = computeViewColumns();

  test('the parser finds the views', () => {
    expect(views.has('transactions_active')).toBe(true);
    expect(views.get('transactions_active')).toEqual(expect.arrayContaining(['id', 'deleted_at', 'goal_id']));
  });

  test.each(APP_VIEW_SELECTS)('$view has every column of $constant', ({ view, file, constant }) => {
    const source = readFileSync(join(ROOT, file), 'utf8');
    const match = new RegExp(`const ${constant} =\\s*'([^']+)'`).exec(source);
    expect(match).not.toBeNull();
    const wanted = selectedViewColumns(match?.[1] ?? "");
    expect(wanted.length).toBeGreaterThan(4);
    const have = views.get(view) ?? [];
    expect(wanted.filter((c) => !have.includes(c))).toEqual([]);
  });
});
