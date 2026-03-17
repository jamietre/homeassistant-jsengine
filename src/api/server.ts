import Fastify from 'fastify';
import type { JSEngine } from '../engine/js-engine';
import type { ScriptRegistry } from '../registry/script-registry';
import { healthRoute } from './routes/health';
import { deployRoute } from './routes/deploy';
import { scriptsRoute } from './routes/scripts';

export function createServer(engine: JSEngine, registry: ScriptRegistry) {
  const app = Fastify({ logger: false });
  app.register(healthRoute);
  app.register(deployRoute, { engine, registry });
  app.register(scriptsRoute, { engine, registry });
  return app;
}
