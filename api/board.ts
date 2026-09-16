import { neon, neonConfig } from '@neondatabase/serverless';

// A minimal structural type for Neon's tagged-template SQL client — just
// what this handler calls it with. Keeping it local (instead of importing
// Neon's own, much wider type) is what makes createHandler easy to test
// with a plain vi.fn() in place of a real database connection.
export type SqlClient = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    // Every device polls this endpoint expecting the latest row — a cached
    // response (browser, proxy, or CDN) would let one device silently keep
    // showing stale board state while others move on.
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

// Vercel's own function timeout kills a hung invocation with an opaque
// platform 504 and no body — useless for telling "Neon is slow to wake up"
// apart from "DATABASE_URL/network is broken". Worse, merely racing the
// query against a local timer (an earlier version of this file did that)
// leaves the real outbound HTTP request to Neon still in flight in the
// background: the response object resolves, but the invocation isn't truly
// done, and in practice the platform kept the function alive for its full
// hard limit anyway. Aborting the actual request is the only fix — done via
// neonConfig.fetchFunction below, the driver's supported hook for supplying
// its own fetch, since the tagged-template call itself takes no signal.
const QUERY_TIMEOUT_MS = 8000;

neonConfig.fetchFunction = (url: string | URL | Request, init?: RequestInit) => (
  fetch(url, { ...init, signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) })
);

function withTimeoutMessage<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((err: unknown) => {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(`Neon query timed out after ${QUERY_TIMEOUT_MS}ms — check DATABASE_URL, the board_state table, and the Neon project's status`);
    }
    throw err;
  });
}

export function createHandler(sql: SqlClient) {
  return async function handler(request: Request): Promise<Response> {
    try {
      if (request.method === 'GET') {
        const rows = await withTimeoutMessage(
          sql`select data, updated_at from board_state where id = 'main'`,
        );
        const row = rows[0];
        if (!row) {
          return json({ data: {}, updatedAt: new Date(0).toISOString() });
        }
        return json({ data: row.data, updatedAt: row.updated_at });
      }

      if (request.method === 'PUT') {
        const body = (await request.json()) as { data: unknown };
        const rows = await withTimeoutMessage(
          sql`
            insert into board_state (id, data, updated_at)
            values ('main', ${JSON.stringify(body.data)}::jsonb, now())
            on conflict (id) do update set data = excluded.data, updated_at = now()
            returning data, updated_at
          `,
        );
        const row = rows[0];
        return json({ data: row.data, updatedAt: row.updated_at });
      }

      return new Response('Method Not Allowed', { status: 405 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: message }, 500);
    }
  };
}

// neon()'s return value is callable as a tagged template exactly like
// SqlClient describes, plus extra methods (.query(), etc.) this handler
// never uses — the cast just narrows to the slice we actually call.
//
// Deferred to first call (rather than `neon(process.env.DATABASE_URL!)`
// evaluated at module load) so importing this file — e.g. from a test that
// only needs `createHandler` — doesn't throw just because DATABASE_URL
// isn't set in that environment.
function defaultSql(): SqlClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url) as unknown as SqlClient;
}

export default createHandler(((strings, ...values) => defaultSql()(strings, ...values)) as SqlClient);
