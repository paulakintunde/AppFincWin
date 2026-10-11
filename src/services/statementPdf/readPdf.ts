// D-06 offline -> refuse, queue nothing. D-10/D-13 the server deletes the upload in the same call and
// keeps nothing. D-15: this module never logs and never reports to Sentry; failures are reason codes
// only. No delete call here -- clients have no delete permission; a stray upload is removed by the
// D-12 purge.
import { onlineManager } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { PDF_MAX_BYTES, STATEMENT_BUCKET, parsePdfReadResponse } from '@/engine/statement';
import type { PdfExtraction } from '@/engine/statement';

export type PdfReadFailure =
  | 'offline'
  | 'network'
  | 'too-large'
  | 'password-required'
  | 'password-incorrect'
  | 'no-text-layer'
  | 'unreadable';

export type PdfReadOutcome =
  | { kind: 'ok'; extraction: PdfExtraction }
  | { kind: 'failed'; reason: PdfReadFailure; pageCount: number | null };

export interface ReadPdfDeps {
  isOnline(): boolean;
  userId(): Promise<string | null>;
  newId(): string;
  upload(path: string, body: ArrayBuffer): Promise<{ ok: true } | { ok: false; status: number | null }>;
  invoke(body: { path: string; password?: string }): Promise<{ data: unknown; errorName: string | null }>;
}

function statusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const raw = (error as { statusCode?: unknown }).statusCode;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
  return null;
}

// Lazy so importing this module never reads env vars (client.ts reads them at load); tests never need them.
function lazySupabase(): typeof import('@/services/supabase').supabase {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@/services/supabase') as typeof import('@/services/supabase')).supabase;
}

export function defaultReadPdfDeps(): ReadPdfDeps {
  return {
    isOnline: () => onlineManager.isOnline(),
    userId: async () => {
      const supabase = lazySupabase();
      const { data } = await supabase.auth.getSession();
      return data.session?.user.id ?? null;
    },
    newId: () => randomUUID(),
    upload: async (path, body) => {
      const supabase = lazySupabase();
      const { error } = await supabase.storage
        .from(STATEMENT_BUCKET)
        .upload(path, body, { contentType: 'application/pdf', upsert: false });
      return error === null ? { ok: true } : { ok: false, status: statusOf(error) };
    },
    invoke: async (body) => {
      const supabase = lazySupabase();
      const { data, error } = await supabase.functions.invoke('read-pdf-statement', { body });
      return { data, errorName: error?.name ?? null };
    },
  };
}

const fail = (reason: PdfReadFailure, pageCount: number | null = null): PdfReadOutcome => ({
  kind: 'failed',
  reason,
  pageCount,
});

export async function readPdfStatement(
  bytes: Uint8Array,
  opts: { password: string | null },
  deps: ReadPdfDeps = defaultReadPdfDeps()
): Promise<PdfReadOutcome> {
  try {
    if (!deps.isOnline()) return fail('offline');
    if (bytes.length > PDF_MAX_BYTES) return fail('too-large');
    const uid = await deps.userId();
    if (uid === null) return fail('network');

    const path = `${uid}/${deps.newId()}.pdf`;
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const uploaded = await deps.upload(path, body);
    if (!uploaded.ok) return fail(uploaded.status === 413 ? 'too-large' : 'network');

    const request = opts.password === null ? { path } : { path, password: opts.password };
    const { data, errorName } = await deps.invoke(request);
    if (errorName !== null) return fail(errorName === 'FunctionsFetchError' ? 'network' : 'unreadable');

    const parsed = parsePdfReadResponse(data);
    if (parsed === null) return fail('unreadable');
    if (parsed.ok) return { kind: 'ok', extraction: { pageCount: parsed.pageCount, pages: parsed.pages } };

    switch (parsed.error) {
      case 'too-large':
      case 'too-many-pages':
        return fail('too-large');
      case 'password-required':
        return fail('password-required');
      case 'password-incorrect':
        return fail('password-incorrect');
      case 'no-text-layer':
        return fail('no-text-layer', parsed.pageCount ?? null);
      default:
        return fail('unreadable');
    }
  } catch {
    return fail('network');
  }
}
