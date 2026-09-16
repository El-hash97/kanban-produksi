import type { IncomingMessage, ServerResponse } from 'node:http';
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

// Diagnostic-only: proves in Vercel's Runtime Logs whether the driver ever
// actually dispatches a request and, if so, how long it took to settle —
// the one thing not visible from a bare "Task timed out after 300s" line.
// Read with `grep '\[board]'` on the log for the failing invocation.
neonConfig.fetchFunction = (url: string | URL | Request, init?: RequestInit) => {
  const label = typeof url === 'string' ? url : url.toString();
  const startedAt = Date.now();
  console.log(`[board] fetchFunction: dispatching to ${label}`);
  return fetch(url, { ...init, signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) }).then(
    (res) => {
      console.log(`[board] fetchFunction: got HTTP ${res.status} after ${Date.now() - startedAt}ms`);
      return res;
    },
    (err) => {
      console.error(`[board] fetchFunction: rejected after ${Date.now() - startedAt}ms:`, err);
      throw err;
    },
  );
};

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
    const startedAt = Date.now();
    console.log(`[board] ${request.method} start`);
    try {
      if (request.method === 'GET') {
        const rows = await withTimeoutMessage(
          sql`select data, updated_at from board_state where id = 'main'`,
        );
        console.log(`[board] GET sql resolved after ${Date.now() - startedAt}ms, rows=${rows.length}`);
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
        console.log(`[board] PUT sql resolved after ${Date.now() - startedAt}ms`);
        const row = rows[0];
        return json({ data: row.data, updatedAt: row.updated_at });
      }

      return new Response('Method Not Allowed', { status: 405 });
    } catch (err) {
      console.error(`[board] ${request.method} failed after ${Date.now() - startedAt}ms:`, err);
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: message }, 500);
    }
  };
}

async function readBody(req: IncomingMessage): Promise<string | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function toHeaders(raw: IncomingMessage['headers']): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value !== undefined) headers.set(key, value);
  }
  return headers;
}

/**
 * Bridges Vercel's Node.js function signature to the Web-standard handler
 * above.
 *
 * This is the bug that made the shared board never work: written as a bare
 * `(Request) => Response` default export, Vercel's Node runtime invoked it
 * as `(req, res)` instead. `req.method` reads the same on an IncomingMessage,
 * so the query ran and logged fine (`sql resolved after 17ms, rows=1`) — but
 * the returned Response was dropped on the floor, nothing ever called
 * `res.end()`, and every request hung until the platform killed it at its
 * 300s limit. Every device fell back to localStorage, which is exactly the
 * "each device shows different data" symptom this all started with.
 */
export function createNodeHandler(webHandler: (request: Request) => Promise<Response>) {
  return async function nodeHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const host = req.headers.host ?? 'localhost';
    const request = new Request(`https://${host}${req.url ?? '/'}`, {
      method: req.method,
      headers: toHeaders(req.headers),
      body: await readBody(req),
    });
    const response = await webHandler(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
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
  // Logs only the host, never credentials — confirms what this specific
  // running instance actually resolved process.env.DATABASE_URL to, which
  // can differ from what the dashboard shows if the wrong environment
  // scope, a stale cached instance, or a typo'd var name is in play.
  try {
    console.log(`[board] DATABASE_URL host: ${new URL(url).host}`);
  } catch {
    console.error('[board] DATABASE_URL is set but not a valid URL');
  }
  return neon(url) as unknown as SqlClient;
}

export default createNodeHandler(
  createHandler(((strings, ...values) => defaultSql()(strings, ...values)) as SqlClient),
);
