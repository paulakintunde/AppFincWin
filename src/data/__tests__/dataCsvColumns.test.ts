import { DATA_CSV_SCHEMAS, type DataTable } from '../../engine/dataCsv';
import { EXPORT_MANIFEST } from '../exportManifest';

describe('data CSV schemas stay inside the export manifest (10-07)', () => {
  const tables = Object.keys(DATA_CSV_SCHEMAS) as DataTable[];
  it.each(tables)('%s: every required and allowed column is exported', (t) => {
    const exported = new Set(EXPORT_MANIFEST[t]);
    const s = DATA_CSV_SCHEMAS[t];
    expect([...s.required, ...s.allowed].filter((c) => !exported.has(c))).toEqual([]);
  });
  it.each(tables)('%s: money, enum and date columns are allowed columns', (t) => {
    const s = DATA_CSV_SCHEMAS[t];
    const allowed = new Set(s.allowed);
    const used = [...s.money, ...s.dates, ...Object.keys(s.enums)];
    expect(used.filter((c) => !allowed.has(c))).toEqual([]);
  });
});
