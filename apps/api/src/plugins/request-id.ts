import fp from 'fastify-plugin';
import { ulid } from 'ulid';

export const requestIdPlugin = fp(async (app) => {
  app.addHook('onRequest', async (req, _res) => {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0 ? incoming : ulid();
    req.id = requestId;
    (req as unknown as { requestId: string }).requestId = requestId;
  });

  app.addHook('onSend', async (_req, res, payload) => {
    res.header('x-request-id', _req.id);
    return payload;
  });
});

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}
