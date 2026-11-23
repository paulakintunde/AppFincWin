/**
 * 10-17 (DAT-02, RESEARCH Pattern 10): the older guard only scans src/db, so a table with no client module could slip
 * through. This one reads every migration: each table or view created in `public` must be exported or marked not user data,
 * and each exported column must exist in that table's migrations.
 */
import fs from 'fs';
import path from 'path';

import { EXPORT_MANIFEST, NOT_USER_DATA } from '../exportManifest';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');

function readMigrations(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');
}

/** Names of every public table and view the migrations create. */
export function createdRelations(sql: string): string[] {
  const names = new Set<string>();
  const re = /create\s+(?:or\s+replace\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)/gi;
  for (const m of sql.matchAll(re)) names.add((m[1] ?? '').toLowerCase());
  return [...names].sort();
}

/** The relations in `created` with no export decision. */
export function uncoveredRelations(created: readonly string[], manifest: Record<string, readonly string[]>, notUser: readonly string[]): string[] {
  const covered = new Set([...Object.keys(manifest), ...notUser]);
  return created.filter((t) => !covered.has(t));
}

describe('export coverage against the migrations (DAT-02)', () => {
  // Comments can hold semicolons and column-like words; drop them before scanning statements.
  const sql = readMigrations().replace(/--[^\n]*/g, '');

  it('finds the created tables', () => {
    expect(createdRelations(sql).length).toBeGreaterThan(40);
  });

  it('every table or view a migration creates is exported or marked not user data', () => {
    expect(uncoveredRelations(createdRelations(sql), EXPORT_MANIFEST, NOT_USER_DATA)).toEqual([]);
  });

  it('the checker fails for a table nobody decided about', () => {
    expect(uncoveredRelations([...createdRelations(sql), 'brand_new_table'], EXPORT_MANIFEST, NOT_USER_DATA)).toEqual(['brand_new_table']);
  });

  it('Phase 10 server-only tables are marked not user data', () => {
    for (const t of ['rate_limits', 'account_deletion_log', 'alert_outbox', 'reviewer_allowlist']) {
      expect(NOT_USER_DATA).toContain(t);
    }
  });

  it('every exported column appears in that table\'s migrations', () => {
    const lower = sql.toLowerCase();
    const missing: string[] = [];
    for (const [table, columns] of Object.entries(EXPORT_MANIFEST)) {
      // Only the statements that create or alter this table.
      const stmts = lower.match(new RegExp(`(?:create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?|alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?)public\\.${table}\\b[^;]*;`, 'g')) ?? [];
      const body = stmts.join('\n');
      for (const c of columns) {
        if (!new RegExp(`(^|[^a-z0-9_])${c.toLowerCase()}([^a-z0-9_]|$)`).test(body)) missing.push(`${table}.${c}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
