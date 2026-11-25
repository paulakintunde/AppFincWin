import type { LocalReceiptFile } from '../types';
import { pickFile, type PickFileDeps } from '../pickFile';
import { pickPhoto, type PickPhotoDeps } from '../pickPhoto';
import { scanDocument, type ScanDeps } from '../scanDocument';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const jpeg = (uri: string): LocalReceiptFile => ({ uri, mime: 'image/jpeg', ext: 'jpg', bytes: 100, width: 10, height: 10 });
const prepare = jest.fn(async (uri: string) => ({ ok: true as const, file: jpeg(uri) }));

beforeEach(() => prepare.mockClear());

function photoDeps(over: Partial<PickPhotoDeps> = {}): PickPhotoDeps {
  return {
    requestCamera: async () => true,
    requestLibrary: async () => true,
    launchCamera: async () => ({ canceled: false, assets: [{ uri: 'file:///cam.heic' }] }),
    launchLibrary: async () => ({ canceled: false, assets: [{ uri: 'file:///lib.png' }] }),
    prepare,
    ...over,
  };
}

describe('pickPhoto', () => {
  it('maps a denied camera permission', async () => {
    await expect(pickPhoto('camera', photoDeps({ requestCamera: async () => false }))).resolves.toEqual({ ok: false, reason: 'permission_denied' });
  });
  it('maps a cancelled pick', async () => {
    await expect(pickPhoto('library', photoDeps({ launchLibrary: async () => ({ canceled: true, assets: null }) }))).resolves.toEqual({ ok: false, reason: 'cancelled' });
  });
  it('returns one prepared jpeg on success', async () => {
    const out = await pickPhoto('camera', photoDeps());
    expect(out).toEqual({ ok: true, kind: 'photo', files: [jpeg('file:///cam.heic')] });
  });
  it('passes a prepare failure through', async () => {
    const bad = jest.fn(async () => ({ ok: false as const, reason: 'too_big' as const }));
    await expect(pickPhoto('library', photoDeps({ prepare: bad }))).resolves.toEqual({ ok: false, reason: 'too_big' });
  });
});

function fileDeps(asset: { uri: string; size?: number; mimeType?: string } | null): PickFileDeps {
  return { pick: async () => (asset === null ? { canceled: true, assets: null } : { canceled: false, assets: [asset] }), prepare };
}

describe('pickFile', () => {
  it('refuses a 6 MB pdf', async () => {
    await expect(pickFile(fileDeps({ uri: 'file:///a.pdf', size: 6 * 1024 * 1024, mimeType: 'application/pdf' }))).resolves.toEqual({ ok: false, reason: 'too_big' });
  });
  it('refuses text/plain', async () => {
    await expect(pickFile(fileDeps({ uri: 'file:///a.txt', size: 10, mimeType: 'text/plain' }))).resolves.toEqual({ ok: false, reason: 'bad_type' });
  });
  it('passes a 2 MB pdf through unchanged', async () => {
    const out = await pickFile(fileDeps({ uri: 'file:///a.pdf', size: 2 * 1024 * 1024, mimeType: 'application/pdf' }));
    expect(out).toEqual({
      ok: true,
      kind: 'file',
      files: [{ uri: 'file:///a.pdf', mime: 'application/pdf', ext: 'pdf', bytes: 2 * 1024 * 1024, width: null, height: null }],
    });
    expect(prepare).not.toHaveBeenCalled();
  });
  it('sends an image through prepareImage', async () => {
    const out = await pickFile(fileDeps({ uri: 'file:///a.heic', size: 10, mimeType: 'image/heic' }));
    expect(prepare).toHaveBeenCalledWith('file:///a.heic');
    expect(out.ok && out.files[0]?.mime).toBe('image/jpeg');
  });
  it('maps a cancelled pick', async () => {
    await expect(pickFile(fileDeps(null))).resolves.toEqual({ ok: false, reason: 'cancelled' });
  });
});

describe('scanDocument', () => {
  it('keeps three pages in order', async () => {
    const deps: ScanDeps = { scan: async () => ({ cancelled: false, pages: ['p1', 'p2', 'p3'] }), prepare };
    const out = await scanDocument(deps);
    expect(out.ok && out.kind).toBe('scan');
    expect(out.ok && out.files.map((f) => f.uri)).toEqual(['p1', 'p2', 'p3']);
  });
  it('keeps only the first ten of eleven pages', async () => {
    const pages = Array.from({ length: 11 }, (_, i) => `p${i + 1}`);
    const out = await scanDocument({ scan: async () => ({ cancelled: false, pages }), prepare });
    expect(out.ok && out.files).toHaveLength(10);
    expect(out.ok && out.files[9]?.uri).toBe('p10');
  });
  it('reports unavailable when the module is missing', async () => {
    const out = await scanDocument({ scan: async () => { throw new Error('no module'); }, prepare });
    expect(out).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('maps cancel', async () => {
    await expect(scanDocument({ scan: async () => ({ cancelled: true, pages: [] }), prepare })).resolves.toEqual({ ok: false, reason: 'cancelled' });
  });
});
