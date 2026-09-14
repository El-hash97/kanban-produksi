import { describe, it, expect, vi } from 'vitest';
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
});
