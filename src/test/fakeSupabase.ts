// An in-memory stand-in for the Supabase client, for unit tests of code that reads or writes data.
//
// Use it in a test file in place of the real client:
//
//   vi.mock('@/lib/supabase', () => import('@/test/fakeSupabase'));
//   import { fakeDb } from '@/test/fakeSupabase';
//
//   beforeEach(() => fakeDb.reset());
//   fakeDb.setRows('users', [{ id: 'u1' }]);          // what a select returns
//   fakeDb.setRpcResult('my_function', { ok: true });  // what an rpc call returns
//   expect(fakeDb.inserted('notifications')).toEqual([...]);  // what the code wrote
//
// It records every query; it does not apply filters or RLS. Database rules belong in database tests.
import { vi } from 'vitest';

type Filter = [operator: string, column: string, value: unknown];

export type FakeQuery = {
  /** The table, or the function name for an rpc call. */
  table: string;
  action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc';
  payload?: unknown;
  filters: Filter[];
};

type QueryResult = { data: unknown; error: { message: string; details?: string } | null };

const state = {
  rows: new Map<string, unknown[]>(),
  rpcResults: new Map<string, unknown>(),
  errors: new Map<string, { message: string; details?: string }>(),
  queries: [] as FakeQuery[],
};

function rpc(fn: string, args?: unknown): Promise<QueryResult> {
  state.queries.push({ table: fn, action: 'rpc', payload: args, filters: [] });
  const error = state.errors.get(fn);
  return Promise.resolve(error ? { data: null, error } : { data: state.rpcResults.get(fn) ?? null, error: null });
}

function queryBuilder(table: string) {
  const query: FakeQuery = { table, action: 'select', filters: [] };
  state.queries.push(query);

  const result = (): QueryResult => {
    const error = state.errors.get(table);
    if (error) return { data: null, error };
    return { data: query.action === 'select' ? (state.rows.get(table) ?? []) : null, error: null };
  };

  const write = (action: FakeQuery['action']) => (payload?: unknown) => {
    query.action = action;
    query.payload = payload;
    return builder;
  };
  const filter = (operator: string) => (column: string, value: unknown) => {
    query.filters.push([operator, column, value]);
    return builder;
  };

  const builder = {
    // A select after a write (insert(...).select()) keeps the write.
    select: () => builder,
    insert: write('insert'),
    update: write('update'),
    upsert: write('upsert'),
    delete: write('delete'),
    eq: filter('eq'),
    neq: filter('neq'),
    in: filter('in'),
    gte: filter('gte'),
    lte: filter('lte'),
    order: () => builder,
    limit: () => builder,
    single: () => Promise.resolve(result()),
    maybeSingle: () => Promise.resolve(result()),
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  };
  return builder;
}

type AuthResult = { data: { session: unknown }; error: unknown };

function freshAuth() {
  return {
    // By default the session cannot be refreshed. Override per test with mockResolvedValueOnce.
    refreshSession: vi.fn(async (): Promise<AuthResult> => ({ data: { session: null }, error: null })),
    signOut: vi.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
  };
}

export const fakeDb = {
  auth: freshAuth(),

  /** Rows a select on `table` returns. */
  setRows(table: string, rows: unknown[]) {
    state.rows.set(table, rows);
  },
  /** What a call to the database function `fn` returns. */
  setRpcResult(fn: string, data: unknown) {
    state.rpcResults.set(fn, data);
  },
  /** Makes every query on `table` (or call to the function of that name) fail with `message`. */
  failTable(table: string, message: string, details?: string) {
    state.errors.set(table, { message, details });
  },
  /** Every query made since the last reset, in order. */
  get queries(): readonly FakeQuery[] {
    return state.queries;
  },
  /** Rows written to `table` by insert calls, flattened. */
  inserted(table: string): unknown[] {
    return state.queries
      .filter((q) => q.table === table && q.action === 'insert')
      .flatMap((q) => (Array.isArray(q.payload) ? q.payload : [q.payload]));
  },
  reset() {
    state.rows.clear();
    state.rpcResults.clear();
    state.errors.clear();
    state.queries.length = 0;
    fakeDb.auth = freshAuth();
  },
};

/** The fake client. Exported as `supabase` so it can replace `@/lib/supabase` directly. */
export const supabase = {
  from: (table: string) => queryBuilder(table),
  rpc,
  auth: {
    refreshSession: (...args: unknown[]) => fakeDb.auth.refreshSession(...(args as [])),
    signOut: (...args: unknown[]) => fakeDb.auth.signOut(...(args as [])),
  },
};
