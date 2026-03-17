'use strict';

import path from 'path';
import { JSEngine } from './engine/js-engine';
import { ScriptRegistry } from './registry/script-registry';
import { createServer } from './api/server';
import { getLogger } from './logger/logger';

const logger = getLogger({ source: 'JsEngine' });

logger.info('Starting');

if (require.main === module) {
  const token     = process.env.HASS_TOKEN;
  const url       = process.env.HASS_URL;
  const scriptsDir = process.env.SCRIPTS_DIR
    ? path.resolve(process.env.SCRIPTS_DIR)
    : path.resolve(__dirname, '../scripts');
  const port = parseInt(process.env.ENGINE_PORT ?? '3000', 10);

  if (!token) {
    console.error('HASS_TOKEN environment variable not set');
    process.exit(2);
  }

  if (!url) {
    console.error('HASS_URL environment variable not set');
    process.exit(2);
  }

  const registry = new ScriptRegistry(scriptsDir);
  const engine   = new JSEngine({ scriptsDir, token, url }, logger);
  const server   = createServer(engine, registry);

  const shutdown = async () => {
    await server.close();
    engine.stop(); // fire-and-forget: stop() is synchronous in current implementation
  };

  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (err: any) => {
    logger.error(err);
    process.exit(1);
  });

  server.listen({ port, host: '0.0.0.0' }).then(() => {
    logger.info(`API listening on port ${port}`);
  }).catch((e: any) => {
    logger.error('Failed to start API server:', e);
    shutdown();
  });

  engine.start().catch((e: any) => {
    logger.error('Failed to connect to Home Assistant:', e);
    // Server stays up — HA connection issues are non-fatal for the API
  });
}

export = JSEngine;
