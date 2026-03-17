import { describe, it, expect, vi } from 'vitest';
import { createServer } from '../../src/api/server';

const makeEngine = () => ({
  loadScript:      vi.fn().mockResolvedValue(undefined),
  getScriptStatus: vi.fn().mockReturnValue('running'),
  getLogTail:      vi.fn().mockReturnValue([]),
});

const makeRegistry = () => ({
  upsert:     vi.fn(),
  list:       vi.fn().mockReturnValue([]),
  get:        vi.fn(),
  setEnabled: vi.fn(),
});

describe('POST /deploy', () => {
  it('returns 200 with loaded names on valid bundle', async () => {
    const engine = makeEngine();
    const registry = makeRegistry();
    const app = createServer(engine as any, registry as any);

    const res = await app.inject({
      method:  'POST',
      url:     '/deploy',
      payload: {
        scripts:   [{ name: 'garage', code: 'module.exports = class {}' }],
        typesHash: 'sha256:abc',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ loaded: ['garage'] });
    expect(engine.loadScript).toHaveBeenCalledWith('garage', 'module.exports = class {}');
    expect(registry.upsert).toHaveBeenCalledWith('garage', 'sha256:abc');
  });

  it('returns 400 on invalid bundle shape', async () => {
    const app = createServer(makeEngine() as any, makeRegistry() as any);
    const res = await app.inject({ method: 'POST', url: '/deploy', payload: { bad: true } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when engine.loadScript throws', async () => {
    const engine = makeEngine();
    engine.loadScript.mockRejectedValue(new Error('syntax error'));
    const app = createServer(engine as any, makeRegistry() as any);

    const res = await app.inject({
      method:  'POST',
      url:     '/deploy',
      payload: { scripts: [{ name: 'bad', code: 'invalid' }], typesHash: 'sha256:abc' },
    });

    expect(res.statusCode).toBe(500);
  });
});
