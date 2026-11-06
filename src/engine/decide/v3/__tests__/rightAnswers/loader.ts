import * as fs from 'fs';
import * as path from 'path';
import type { RightAnswerCase, Topic } from './schema';

const CASES_DIR = path.join(__dirname, 'cases');
const RED_DIR = path.join(__dirname, 'knownRed');

export interface KnownRedEntry { id: string; fixId: string }

/** Every case in cases/*.json, sorted by id. Throws on a duplicate id across files. */
export function loadCases(dir: string = CASES_DIR): RightAnswerCase[] {
  const all: RightAnswerCase[] = [];
  const seen = new Set<string>();
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const file = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { topic: Topic; cases: RightAnswerCase[] };
    for (const c of file.cases) {
      if (seen.has(c.id)) throw new Error(`duplicate case id ${c.id} (file ${f})`);
      seen.add(c.id);
      all.push(c);
    }
  }
  return all.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function loadKnownRed(topic: Topic, dir: string = RED_DIR): KnownRedEntry[] {
  const file = JSON.parse(fs.readFileSync(path.join(dir, `${topic}.json`), 'utf8')) as { topic: Topic; red: KnownRedEntry[] };
  return file.red;
}
