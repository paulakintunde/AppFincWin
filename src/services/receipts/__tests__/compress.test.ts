import { prepareImage, type CompressDeps } from '../compress';

function deps(over: Partial<CompressDeps> & { size?: { width: number; height: number }; bytes?: number } = {}): CompressDeps & {
  manipulate: jest.Mock;
} {
  const size = over.size ?? { width: 4000, height: 3000 };
  const manipulate = jest.fn(async (_uri: string, resize: { width: number } | { height: number } | null) => {
    if (resize === null) return { uri: 'file:///out.jpg', width: size.width, height: size.height };
    if ('width' in resize) return { uri: 'file:///out.jpg', width: resize.width, height: Math.round((size.height * resize.width) / size.width) };
    return { uri: 'file:///out.jpg', width: Math.round((size.width * resize.height) / size.height), height: resize.height };
  });
  return {
    getSize: over.getSize ?? (async () => size),
    manipulate: over.manipulate ?? manipulate,
    fileBytes: over.fileBytes ?? (async () => over.bytes ?? 1000),
  } as CompressDeps & { manipulate: jest.Mock };
}

describe('prepareImage', () => {
  it('resizes a 4000x3000 image to 2000x1500 as JPEG', async () => {
    const d = deps();
    const out = await prepareImage('file:///in.heic', d);
    expect(d.manipulate).toHaveBeenCalledWith('file:///in.heic', { width: 2000 }, 0.8);
    expect(out).toEqual({
      ok: true,
      file: { uri: 'file:///out.jpg', mime: 'image/jpeg', ext: 'jpg', bytes: 1000, width: 2000, height: 1500 },
    });
  });

  it('resizes a tall image by height', async () => {
    const d = deps({ size: { width: 3000, height: 4000 } });
    await prepareImage('file:///in.png', d);
    expect(d.manipulate).toHaveBeenCalledWith('file:///in.png', { height: 2000 }, 0.8);
  });

  it('does not upscale a 1200x900 image but still saves it as JPEG', async () => {
    const d = deps({ size: { width: 1200, height: 900 } });
    const out = await prepareImage('file:///in.png', d);
    expect(d.manipulate).toHaveBeenCalledWith('file:///in.png', null, 0.8);
    expect(out.ok && out.file.width).toBe(1200);
  });

  it('refuses a file over 5 MB after shrinking', async () => {
    const out = await prepareImage('file:///in.jpg', deps({ bytes: 5 * 1024 * 1024 + 1 }));
    expect(out).toEqual({ ok: false, reason: 'too_big' });
  });

  it('accepts exactly 5 MB', async () => {
    const out = await prepareImage('file:///in.jpg', deps({ bytes: 5 * 1024 * 1024 }));
    expect(out.ok).toBe(true);
  });

  it('returns failed when the manipulator throws', async () => {
    const out = await prepareImage('file:///in.jpg', deps({ manipulate: async () => { throw new Error('boom'); } }));
    expect(out).toEqual({ ok: false, reason: 'failed' });
  });
});
