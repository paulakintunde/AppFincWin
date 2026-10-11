// pdf.js via unpdf -- never a hand-rolled parser; eval disabled against font-program injection.
// The only file in this function that imports unpdf. read.ts stays pure.
import { getDocumentProxy } from 'npm:unpdf@1.8.1';
import type { PdfOpenResult, RawTextItem } from './read.ts';

export async function openPdf(bytes: Uint8Array, password: string | null): Promise<PdfOpenResult> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // isEvalSupported is honoured by pdf.js but missing from unpdf's bundled option types.
    const options = {
      password: password ?? undefined,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
    } as NonNullable<Parameters<typeof getDocumentProxy>[1]>;
    pdf = await getDocumentProxy(bytes, options);
  } catch (err) {
    const e = err as { name?: unknown; code?: unknown } | null;
    const name = e !== null && typeof e === 'object' ? e.name : undefined;
    if (name === 'PasswordException') {
      return e!.code === 2 ? { kind: 'password-incorrect' } : { kind: 'password-required' };
    }
    if (name === 'InvalidPDFException') return { kind: 'invalid' };
    throw err;
  }
  return {
    kind: 'ok',
    doc: {
      numPages: pdf.numPages,
      async page(n: number) {
        const p = await pdf.getPage(n);
        try {
          const vp = p.getViewport({ scale: 1 });
          const c = await p.getTextContent();
          const items: RawTextItem[] = [];
          for (const it of c.items as unknown[]) {
            const t = it as { str?: unknown; transform?: unknown; width?: unknown };
            if (typeof t.str !== 'string' || !Array.isArray(t.transform) || t.transform.length !== 6) continue;
            items.push({
              str: t.str,
              x: Number(t.transform[4]),
              y: Number(t.transform[5]),
              w: Number(t.width),
            });
          }
          return { width: vp.width, height: vp.height, items };
        } finally {
          p.cleanup();
        }
      },
      // unpdf's proxy has no destroy(); the pdf.js loading task owns teardown.
      destroy: async () => {
        await (pdf as unknown as { loadingTask: { destroy(): Promise<void> } }).loadingTask.destroy();
      },
    },
  };
}
