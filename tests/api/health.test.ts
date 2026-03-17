import { describe, it, expect } from 'vitest';
import { createServer } from '../../src/api/server';

describe('GET /health', () => {
  it('returns 200 with { ok: true }', async () => {
    const app = createServer({} as any, {} as any);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });
});
