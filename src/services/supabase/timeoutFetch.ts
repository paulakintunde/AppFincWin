// D-88 sync (UI-SPEC R16.4): every Supabase request gets a deadline, so a stuck request can
// no longer stall the write queue for minutes. Reads 15 s, writes 20 s, long operations 120 s
// (R16.16 M2). A timeout surfaces as RequestTimeoutError, a TypeError whose message matches
// /network/i, so classifyWriteError treats it as a connectivity failure (retried, paused
// offline). A long operation's timeout carries longOp: true and is not retried automatically.

import { addBreadcrumb } from '@sentry/react-native';

export const READ_TIMEOUT_MS = 15_000;
export const WRITE_TIMEOUT_MS = 20_000;
export const LONG_OP_TIMEOUT_MS = 120_000;

// Storage requests, the account-deletion purge and statement upload functions, and the long RPCs.
const LONG_OP_PATTERNS: readonly RegExp[] = [
  /\/storage\/v1\//,
  /\/functions\/v1\/(delete-account|purge-account|purge-statement-uploads|read-pdf-statement)(\/|\?|$)/,
  /\/rest\/v1\/rpc\/(seed_sample_data|clear_sample_data|change_home_currency|delete_account|purge_account|commit_statement_import)(\/|\?|$)/,
];

export const LONG_OP_TIMEOUT_MARKER = '(long operation)';

export function isLongOperationUrl(url: string): boolean {
  return LONG_OP_PATTERNS.some((p) => p.test(url));
}

export class RequestTimeoutError extends TypeError {
  readonly longOp: boolean;
  constructor(timeoutMs: number, longOp: boolean) {
    // postgrest-js flattens a fetch failure to its message text, so the long-operation marker
    // lives in the message for writeErrors to read back (LONG_OP_TIMEOUT_MARKER).
    super(`Network request timed out after ${timeoutMs} ms${longOp ? ` ${LONG_OP_TIMEOUT_MARKER}` : ''}`);
    this.name = 'RequestTimeoutError';
    this.longOp = longOp;
  }
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const m = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : undefined);
  return (m ?? 'GET').toUpperCase();
}

/**
 * F-2 (06.1-48): the table (or RPC function) a write goes to: the path segment after /rest/v1/ or /rpc/, without the
 * query string (it can carry ids and amounts). 'other' for any other path.
 */
export function writeTableOf(url: string): string {
  const path = url.split('?')[0] ?? '';
  const m = /\/rest\/v1\/(?:rpc\/)?([^/?#]+)/.exec(path);
  return m?.[1] ?? 'other';
}

export function timeoutFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const longOp = isLongOperationUrl(urlOf(input));
  const method = methodOf(input, init);
  const timeoutMs = longOp ? LONG_OP_TIMEOUT_MS : method === 'GET' || method === 'HEAD' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;

  const controller = new AbortController();
  const outer = init?.signal ?? undefined;
  let timedOut = false;

  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', onOuterAbort);
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // F-2: only writes are traced (reads are many). Method, table, ms and status: never the query string, headers or body.
  const isWrite = method !== 'GET' && method !== 'HEAD';
  const startedAt = Date.now();
  const trace = (status: number | 'failed' | 'timeout') => {
    if (!isWrite) return;
    try {
      addBreadcrumb({
        category: 'net',
        message: 'write request',
        data: { method, table: writeTableOf(urlOf(input)), ms: Date.now() - startedAt, status },
      });
    } catch {
      // telemetry only: never turn a response into a failure
    }
  };

  return fetch(input, { ...init, signal: controller.signal })
    .then((res) => {
      trace(res.status);
      return res;
    })
    .catch((err: unknown) => {
      if (timedOut) {
        trace('timeout');
        throw new RequestTimeoutError(timeoutMs, longOp);
      }
      trace('failed');
      throw err;
    })
    .finally(() => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    });
}
