import { describe, it, expect, vi } from 'vitest';
import { neonConfig } from '@neondatabase/serverless';
import { createHandler, type SqlClient } from './board';

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
