import type { FastifyPluginAsync } from 'fastify';
import type { JSEngine } from '../../engine/js-engine';
import type { ScriptRegistry } from '../../registry/script-registry';

type Options = { engine: JSEngine; registry: ScriptRegistry };

export const scriptsRoute: FastifyPluginAsync<Options> = async (app, { engine, registry }) => {
  app.get('/scripts', async (_req, reply) => {
    return reply.send(
      registry.list().map((record) => ({
        ...record,
        status:  engine.getScriptStatus(record.name),
        logTail: engine.getLogTail(record.name),
      })),
    );
  });

  app.post('/scripts/:name/enable', async (request, reply) => {
    const { name } = request.params as { name: string };
    try {
      registry.setEnabled(name, true);
      return reply.send({ ok: true });
    } catch {
      return reply.status(404).send({ error: `Unknown script: ${name}` });
    }
  });

  app.post('/scripts/:name/disable', async (request, reply) => {
    const { name } = request.params as { name: string };
    try {
      registry.setEnabled(name, false);
      return reply.send({ ok: true });
    } catch {
      return reply.status(404).send({ error: `Unknown script: ${name}` });
    }
  });
};
