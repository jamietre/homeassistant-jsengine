import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ScriptRegistry } from '../../src/registry/script-registry';

describe('ScriptRegistry', () => {
  let dataDir: string;
  let registry: ScriptRegistry;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'jsengine-registry-'));
    registry = new ScriptRegistry(dataDir);
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true });
  });

  it('list() returns empty array when no scripts registered', () => {
    expect(registry.list()).toEqual([]);
  });

  it('upsert() adds a new script enabled by default', () => {
    registry.upsert('garage', 'sha256:abc');
    const records = registry.list();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ name: 'garage', typesHash: 'sha256:abc', enabled: true });
    expect(records[0].lastDeployedAt).toBeDefined();
  });

  it('upsert() updates typesHash but preserves enabled state', () => {
    registry.upsert('garage', 'sha256:abc');
    registry.setEnabled('garage', false);
    registry.upsert('garage', 'sha256:def');
    expect(registry.list()).toHaveLength(1);
    expect(registry.get('garage')).toMatchObject({ typesHash: 'sha256:def', enabled: false });
  });

  it('setEnabled() updates the flag', () => {
    registry.upsert('garage', 'sha256:abc');
    registry.setEnabled('garage', false);
    expect(registry.get('garage')?.enabled).toBe(false);
  });

  it('setEnabled() throws for unknown script', () => {
    expect(() => registry.setEnabled('unknown', true)).toThrow('Unknown script: unknown');
  });

  it('persists to disk and survives reconstruction', () => {
    registry.upsert('garage', 'sha256:abc');
    registry.setEnabled('garage', false);

    const registry2 = new ScriptRegistry(dataDir);
    expect(registry2.get('garage')).toMatchObject({ enabled: false, typesHash: 'sha256:abc' });
  });
});
