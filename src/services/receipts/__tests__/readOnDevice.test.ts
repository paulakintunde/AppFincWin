import { readOnDevice, type ReadDeps } from '../readOnDevice';

const size = async () => ({ width: 2000, height: 1500 });

describe('readOnDevice', () => {
  it('keeps module order and frames', async () => {
    const deps: ReadDeps = {
      recognize: async () => ({
        lines: [
          { text: 'MILK 3.20', frame: { left: 1, top: 2, width: 3, height: 4 } },
          { text: 'TOTAL 3.20', frame: { left: 5, top: 6, width: 7, height: 8 } },
        ],
      }),
      imageSize: size,
    };
    const out = await readOnDevice('file:///r.jpg', deps);
    expect(out).toEqual({
      ok: true,
      result: {
        lines: [
          { text: 'MILK 3.20', frame: { left: 1, top: 2, width: 3, height: 4 } },
          { text: 'TOTAL 3.20', frame: { left: 5, top: 6, width: 7, height: 8 } },
        ],
        imageWidth: 2000,
        imageHeight: 1500,
      },
    });
  });

  it('gives null frames for a text-only module', async () => {
    const out = await readOnDevice('file:///r.jpg', { recognize: async () => ({ lines: ['A 1.00', 'B 2.00'] }), imageSize: size });
    expect(out.ok && out.result.lines).toEqual([
      { text: 'A 1.00', frame: null },
      { text: 'B 2.00', frame: null },
    ]);
  });

  it('reports empty when there are no lines', async () => {
    await expect(readOnDevice('file:///r.jpg', { recognize: async () => ({ lines: [' '] }), imageSize: size })).resolves.toEqual({ ok: false, reason: 'empty' });
  });

  it('reports unavailable when the module is missing', async () => {
    const out = await readOnDevice('file:///r.jpg', { recognize: async () => { throw new Error('not linked'); }, imageSize: size });
    expect(out).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('never logs the text', async () => {
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
    await readOnDevice('file:///r.jpg', { recognize: async () => ({ lines: ['SECRET 9.99'] }), imageSize: size });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
  });
});
