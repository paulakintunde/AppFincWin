import { buildLogLine, errorClassOf, type LogMeta } from './logMeta';

const base: LogMeta = { outcome: 'ok', durationMs: 12, pageCount: 3, byteSize: 1000, removed: true, errorClass: null };

describe('errorClassOf', () => {
  it.each(['PasswordException', 'InvalidPDFException', 'MissingPDFException', 'FormatError', 'UnknownErrorException', 'AbortException'])(
    'passes %s through',
    (name) => expect(errorClassOf({ name })).toBe(name)
  );
  it('maps unknown names and non-objects to Other', () => {
    expect(errorClassOf({ name: 'ALEX SAMPLE' })).toBe('Other');
    expect(errorClassOf('boom')).toBe('Other');
    expect(errorClassOf(null)).toBe('Other');
    expect(errorClassOf({})).toBe('Other');
  });
});

describe('buildLogLine', () => {
  it('emits exactly the allow-listed keys', () => {
    const parsed = JSON.parse(buildLogLine(base));
    expect(Object.keys(parsed)).toEqual(['fn', 'outcome', 'durationMs', 'pageCount', 'byteSize', 'removed', 'errorClass']);
    expect(parsed.fn).toBe('read-pdf-statement');
  });
  it('drops keys outside the allow-list', () => {
    const line = buildLogLine({ ...base, text: 'ALEX SAMPLE', path: 'x/y' } as unknown as LogMeta);
    expect(line).not.toContain('ALEX');
    expect(line).not.toContain('"path"');
  });
  it('nulls non-finite or non-integer numbers', () => {
    const p = JSON.parse(buildLogLine({ ...base, durationMs: NaN, pageCount: 1.5, byteSize: Infinity }));
    expect(p.durationMs).toBeNull();
    expect(p.pageCount).toBeNull();
    expect(p.byteSize).toBeNull();
  });
  it('keeps null counts null', () => {
    const p = JSON.parse(buildLogLine({ ...base, pageCount: null, byteSize: null }));
    expect(p.pageCount).toBeNull();
  });
  it('replaces an unknown outcome with internal', () => {
    expect(JSON.parse(buildLogLine({ ...base, outcome: 'ALEX' as never })).outcome).toBe('internal');
    expect(JSON.parse(buildLogLine({ ...base, outcome: 'too-large' })).outcome).toBe('too-large');
  });
  it('coerces removed to boolean and errorClass to the closed list', () => {
    const p = JSON.parse(buildLogLine({ ...base, removed: 1 as never, errorClass: 'ALEX' as never }));
    expect(p.removed).toBe(true);
    expect(p.errorClass).toBe('Other');
    expect(JSON.parse(buildLogLine({ ...base, errorClass: 'StorageError' })).errorClass).toBe('StorageError');
  });
});
