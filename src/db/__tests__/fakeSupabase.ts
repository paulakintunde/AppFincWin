// A small chainable recorder standing in for the subset of the supabase-js query builder
// surface src/db/*.ts uses. Not a full postgrest-js mock -- just enough to record what a
// db function called and resolve to a queued response, so tests never touch the real
// client (and never trigger @/services/supabase's eager getEnv() call).

import type { DbClient } from '../rows';

export interface FakeResponse {
  data: unknown;
  error: { message: string; code?: string } | null;
  status: number;
}

export interface RecordedCall {
  table?: string;
  method: string;
  args: unknown[];
}

export class FakeSupabase {
  readonly calls: RecordedCall[] = [];
  private readonly queue: FakeResponse[] = [];

  /** Queue the next response a terminal (awaited/`.single()`/`.maybeSingle()`) call resolves to. */
  respondWith(response: FakeResponse): this {
    this.queue.push(response);
    return this;
  }

  private next(): FakeResponse {
    const response = this.queue.shift();
    if (!response) throw new Error('FakeSupabase: no queued response left');
    return response;
  }

  from(table: string) {
    const record = (method: string, args: unknown[]): void => {
      this.calls.push({ table, method, args });
    };
    const resolve = (method: string): Promise<FakeResponse> => {
      record(method, []);
      return Promise.resolve(this.next());
    };

    const builder = {
      insert: (row: unknown) => {
        record('insert', [row]);
        return builder;
      },
      update: (patch: unknown) => {
        record('update', [patch]);
        return builder;
      },
      select: (columns?: string) => {
        record('select', [columns]);
        return builder;
      },
      eq: (column: string, value: unknown) => {
        record('eq', [column, value]);
        return builder;
      },
      is: (column: string, value: unknown) => {
        record('is', [column, value]);
        return builder;
      },
      gte: (column: string, value: unknown) => {
        record('gte', [column, value]);
        return builder;
      },
      lt: (column: string, value: unknown) => {
        record('lt', [column, value]);
        return builder;
      },
      order: (column: string, opts?: unknown) => {
        record('order', [column, opts]);
        return builder;
      },
      limit: (count: number) => {
        record('limit', [count]);
        return builder;
      },
      single: () => resolve('single'),
      maybeSingle: () => resolve('maybeSingle'),
      then: <T>(onFulfilled: (value: FakeResponse) => T, onRejected?: (reason: unknown) => T) => {
        record('then', []);
        return Promise.resolve(this.next()).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  rpc(name: string, args?: unknown) {
    this.calls.push({ method: 'rpc', args: [name, args] });
    return {
      then: <T>(onFulfilled: (value: FakeResponse) => T, onRejected?: (reason: unknown) => T) =>
        Promise.resolve(this.next()).then(onFulfilled, onRejected),
    };
  }

  /** WR-A01: what auth.getSession() reports. A signed-in session by default; tests set null. */
  session: { access_token: string } | null = { access_token: 'fake-token' };
  sessionError: { message: string } | null = null;

  auth = {
    getSession: async () => {
      this.calls.push({ method: 'auth.getSession', args: [] });
      return { data: { session: this.session }, error: this.sessionError };
    },
  };

  functions = {
    invoke: (name: string, opts?: unknown): Promise<FakeResponse> => {
      this.calls.push({ method: 'functions.invoke', args: [name, opts] });
      return Promise.resolve(this.next());
    },
  };
}

// db/*.ts functions type their first parameter as the real DbClient (= SupabaseClient),
// per this plan's <interfaces> contract -- this cast is the one place a test's fake stands
// in for that concrete class, so every call site elsewhere stays fully typed.
export function createFakeSupabase(): FakeSupabase & DbClient {
  return new FakeSupabase() as unknown as FakeSupabase & DbClient;
}
