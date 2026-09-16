import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { neonConfig } from '@neondatabase/serverless';
import { createHandler, createNodeHandler, type SqlClient } from './board';

function makeSql(rows: Record<string, unknown>[]): SqlClient {
  return vi.fn(async () => rows) as unknown as SqlClient;
}

describe('api/board handler', () => {
  it('GET returns empty data when no row exists yet', async () => {
    const handler = createHandler(makeSql([]));
    const res = await handler(new Request('http://test/api/board', { method: 'GET' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({});
  });

  it('GET returns the stored row', async () => {
    const sql = makeSql([{ data: { foo: 'bar' }, updated_at: '2026-09-14T00:00:00.000Z' }]);
    const handler = createHandler(sql);
    const res = await handler(new Request('http://test/api/board', { method: 'GET' }));
    const body = await res.json();
    expect(body).toEqual({ data: { foo: 'bar' }, updatedAt: '2026-09-14T00:00:00.000Z' });
  });

  it('PUT upserts and returns the new row', async () => {
    const sql = makeSql([{ data: { foo: 'baz' }, updated_at: '2026-09-14T01:00:00.000Z' }]);
    const handler = createHandler(sql);
    const res = await handler(new Request('http://test/api/board', {
      method: 'PUT',
      body: JSON.stringify({ data: { foo: 'baz' } }),
    }));
    const body = await res.json();
    expect(body).toEqual({ data: { foo: 'baz' }, updatedAt: '2026-09-14T01:00:00.000Z' });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported methods with 405', async () => {
    const handler = createHandler(makeSql([]));
    const res = await handler(new Request('http://test/api/board', { method: 'DELETE' }));
    expect(res.status).toBe(405);
  });

  it('returns a JSON 500 (not an uncaught exception) when the query rejects', async () => {
    const sql = vi.fn(async () => { throw new Error('connection refused'); }) as unknown as SqlClient;
    const handler = createHandler(sql);
    const res = await handler(new Request('http://test/api/board', { method: 'GET' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('connection refused');
  });

  it('turns a fetch TimeoutError into a clear message instead of the raw driver error', async () => {
    const timeoutError = Object.assign(new Error('signal timed out'), { name: 'TimeoutError' });
    const sql = vi.fn(async () => { throw timeoutError; }) as unknown as SqlClient;
    const handler = createHandler(sql);
    const res = await handler(new Request('http://test/api/board', { method: 'GET' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/timed out/i);
    expect(body.error).toMatch(/DATABASE_URL/);
  });

  it('configures neonConfig.fetchFunction to actually abort a hung outbound request', async () => {
    // Racing a local timer while leaving Neon's real HTTP request in flight
    // was the bug: Vercel kept the invocation alive for its full platform
    // limit regardless, because the underlying connection was never closed.
    // fetchFunction is the driver's documented hook for supplying the fetch
    // it uses internally, so this is what actually cancels that request.
    expect(neonConfig.fetchFunction).toBeTypeOf('function');
    const realFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response('{}');
    });
    vi.stubGlobal('fetch', realFetch);
    try {
      await neonConfig.fetchFunction('https://example.com/sql', {});
      expect(realFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function fakeNodeRequest(method: string, body?: string): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  return Object.assign(stream, {
    method,
    url: '/api/board',
    headers: { host: 'test.vercel.app', 'content-type': 'application/json' },
  }) as unknown as IncomingMessage;
}

function fakeNodeResponse() {
  const headers: Record<string, string> = {};
  return {
    statusCode: 0,
    body: undefined as string | undefined,
    setHeader(key: string, value: string) { headers[key] = value; },
    getHeaders() { return headers; },
    end(chunk?: Buffer) { this.body = chunk?.toString('utf8'); },
  };
}

describe('createNodeHandler (Vercel Node signature bridge)', () => {
  it('writes the Response through to res, rather than dropping it and hanging', async () => {
    const sql = makeSql([{ data: { foo: 'bar' }, updated_at: '2026-09-14T00:00:00.000Z' }]);
    const nodeHandler = createNodeHandler(createHandler(sql));
    const res = fakeNodeResponse();

    await nodeHandler(fakeNodeRequest('GET'), res as unknown as ServerResponse);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBeDefined();
    expect(JSON.parse(res.body!)).toEqual({
      data: { foo: 'bar' },
      updatedAt: '2026-09-14T00:00:00.000Z',
    });
    expect(res.getHeaders()['cache-control']).toBe('no-store');
  });

  it('uses req.body when the runtime already consumed the stream', async () => {
    // Vercel pre-parses JSON bodies onto req.body; reading the stream again
    // yields nothing, so without this every push would fail while GET kept
    // working — a silently broken sync behind a green status badge.
    const sql = makeSql([{ data: { foo: 'parsed' }, updated_at: '2026-09-14T02:00:00.000Z' }]);
    const nodeHandler = createNodeHandler(createHandler(sql));
    const res = fakeNodeResponse();
    const req = Object.assign(fakeNodeRequest('PUT'), { body: { data: { foo: 'parsed' } } });

    await nodeHandler(req, res as unknown as ServerResponse);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).data).toEqual({ foo: 'parsed' });
  });

  it('forwards a PUT body through to the handler', async () => {
    const sql = makeSql([{ data: { foo: 'baz' }, updated_at: '2026-09-14T01:00:00.000Z' }]);
    const nodeHandler = createNodeHandler(createHandler(sql));
    const res = fakeNodeResponse();

    await nodeHandler(
      fakeNodeRequest('PUT', JSON.stringify({ data: { foo: 'baz' } })),
      res as unknown as ServerResponse,
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).data).toEqual({ foo: 'baz' });
  });
});
