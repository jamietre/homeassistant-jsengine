import { describe, it, expect, vi } from 'vitest';
import { createServer } from '../../src/api/server';

const makeEngine = () => ({
  loadScript:      vi.fn(),
  getScriptStatus: vi.fn().mockReturnValue('running'),
  getLogTail:      vi.fn().mockReturnValue(['line 1']),
});

const makeRegistry = (records: any[] = []) => ({
  upsert:     vi.fn(),
  list:       vi.fn().mockReturnValue(records),
  get:        vi.fn(),
  setEnabled: vi.fn(),
});

const record = { name: 'garage', enabled: true, lastDeployedAt: '2026-01-01T00:00:00Z', typesHash: 'sha256:abc' };

describe('GET /scripts', () => {
  it('returns scripts with runtime status and log tail', async () => {
    const app = createServer(makeEngine() as any, makeRegistry([record]) as any);
    const res = await app.inject({ method: 'GET', url: '/scripts' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body[0]).toMatchObject({ name: 'garage', status: 'running', logTail: ['line 1'] });
  });
});

describe('POST /scripts/:name/enable', () => {
  it('calls setEnabled(true) and returns 200', async () => {
    const registry = makeRegistry([record]);
    const app = createServer(makeEngine() as any, registry as any);

    const res = await app.inject({ method: 'POST', url: '/scripts/garage/enable' });
    expect(res.statusCode).toBe(200);
    expect(registry.setEnabled).toHaveBeenCalledWith('garage', true);
  });

  it('returns 404 when registry throws unknown script', async () => {
    const registry = makeRegistry();
    registry.setEnabled.mockImplementation(() => { throw new Error('Unknown script: x'); });
    const app = createServer(makeEngine() as any, registry as any);

    const res = await app.inject({ method: 'POST', url: '/scripts/x/enable' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /scripts/:name/disable', () => {
  it('calls setEnabled(false) and returns 200', async () => {
    const registry = makeRegistry([record]);
    const app = createServer(makeEngine() as any, registry as any);

    const res = await app.inject({ method: 'POST', url: '/scripts/garage/disable' });
    expect(res.statusCode).toBe(200);
    expect(registry.setEnabled).toHaveBeenCalledWith('garage', false);
  });
});
