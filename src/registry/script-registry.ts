import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

export type ScriptRecord = {
  name:           string;
  enabled:        boolean;
  lastDeployedAt: string;
  typesHash:      string;
};

export class ScriptRegistry {
  readonly #filePath: string;
  readonly #records = new Map<string, ScriptRecord>();

  constructor(dataDir: string) {
    this.#filePath = path.join(dataDir, 'registry.json');
    this.#load();
  }

  #load(): void {
    if (!existsSync(this.#filePath)) return;
    const records = JSON.parse(readFileSync(this.#filePath, 'utf-8')) as ScriptRecord[];
    for (const record of records) {
      this.#records.set(record.name, record);
    }
  }

  #persist(): void {
    writeFileSync(
      this.#filePath,
      JSON.stringify([...this.#records.values()], null, 2),
      'utf-8',
    );
  }

  upsert(name: string, typesHash: string): void {
    this.#records.set(name, {
      name,
      enabled:        this.#records.get(name)?.enabled ?? true,
      lastDeployedAt: new Date().toISOString(),
      typesHash,
    });
    this.#persist();
  }

  setEnabled(name: string, enabled: boolean): void {
    const record = this.#records.get(name);
    if (!record) throw new Error(`Unknown script: ${name}`);
    record.enabled = enabled;
    this.#persist();
  }

  list(): ScriptRecord[] {
    return [...this.#records.values()];
  }

  get(name: string): ScriptRecord | undefined {
    return this.#records.get(name);
  }
}
