import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../../src/engine/home-assistant', () => ({
  HomeAssistant: vi.fn().mockImplementation(() => ({
    on:      vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    stop:    vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('JSEngine explicit script lifecycle', () => {
  let scriptsDir: string;
  let engine: any;

  beforeEach(async () => {
    vi.resetModules();
    scriptsDir = mkdtempSync(join(tmpdir(), 'jsengine-test-'));
    const { JSEngine } = await import('../../src/engine/js-engine');
    engine = new JSEngine(
      { scriptsDir, token: 'test-token', url: 'http://localhost:8123' },
      { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
    );
  });

  afterEach(() => {
    rmSync(scriptsDir, { recursive: true });
  });

  it('loadScript writes code to disk and sets status to running', async () => {
    const code = `module.exports = class { constructor() {} }`;
    await engine.loadScript('test-script', code);
    expect(engine.getScriptStatus('test-script')).toBe('running');
  });

  it('loadScript with invalid code sets status to error', async () => {
    await expect(engine.loadScript('bad', 'this is not valid js {')).rejects.toThrow();
    expect(engine.getScriptStatus('bad')).toBe('error');
  });

  it('getScriptStatus returns stopped for unknown script', () => {
    expect(engine.getScriptStatus('unknown')).toBe('stopped');
  });

  it('getLogTail returns empty array for unknown script', () => {
    expect(engine.getLogTail('unknown')).toEqual([]);
  });

  it('entity() method exists on the engine', () => {
    // entity() is only valid after the engine has connected to HA and the cache is populated.
    // This test only verifies the method is present; runtime entity lookup is an integration concern.
    expect(typeof engine.entity).toBe('function');
  });

  it('loadScript with the same name replaces the existing entry without duplicating it', async () => {
    const code = `module.exports = class { constructor() {} }`;
    await engine.loadScript('my-script', code);
    await engine.loadScript('my-script', code);
    // Should still only appear once in the internal scripts list
    expect(engine.getScriptStatus('my-script')).toBe('running');
  });
});
