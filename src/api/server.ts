import Fastify from 'fastify';
import type { JSEngine } from '../engine/js-engine';
import type { ScriptRegistry } from '../registry/script-registry';
import { healthRoute } from './routes/health';
import { deployRoute } from './routes/deploy';

export function createServer(engine: JSEngine, registry: ScriptRegistry) {
  const app = Fastify({ logger: false });
  app.register(healthRoute);
  app.register(deployRoute, { engine, registry });
  return app;
}
