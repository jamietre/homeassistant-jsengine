import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { JSEngine } from '../../engine/js-engine';
import type { ScriptRegistry } from '../../registry/script-registry';

const BundleSchema = z.object({
  scripts:   z.array(z.object({ name: z.string().min(1), code: z.string().min(1) })),
  typesHash: z.string().min(1),
});

type Options = { engine: JSEngine; registry: ScriptRegistry };

export const deployRoute: FastifyPluginAsync<Options> = async (app, { engine, registry }) => {
  app.post('/deploy', async (request, reply) => {
    const result = BundleSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.format() });
    }

    const { scripts, typesHash } = result.data;

    // Note: deploy is not atomic. If script N fails, scripts 0..N-1 are already loaded
    // and their registry entries are already written. This is a known MVP limitation.
    try {
      for (const script of scripts) {
        await engine.loadScript(script.name, script.code);
        registry.upsert(script.name, typesHash);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return reply.status(500).send({ error: message });
    }

    return reply.send({ loaded: scripts.map((s) => s.name) });
  });
};
