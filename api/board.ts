import { neon } from '@neondatabase/serverless';

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

export function createHandler(sql: SqlClient) {
  return async function handler(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      const rows = await sql`select data, updated_at from board_state where id = 'main'`;
      const row = rows[0];
      if (!row) {
        return json({ data: {}, updatedAt: new Date(0).toISOString() });
      }
      return json({ data: row.data, updatedAt: row.updated_at });
    }

    if (request.method === 'PUT') {
      const body = (await request.json()) as { data: unknown };
      const rows = await sql`
        insert into board_state (id, data, updated_at)
        values ('main', ${JSON.stringify(body.data)}::jsonb, now())
        on conflict (id) do update set data = excluded.data, updated_at = now()
        returning data, updated_at
      `;
      const row = rows[0];
      return json({ data: row.data, updatedAt: row.updated_at });
    }

    return new Response('Method Not Allowed', { status: 405 });
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
