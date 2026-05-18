import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/live', async () => ({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    try {
      await app.pg.query('SELECT 1');
      const pong = await app.redis.ping();
      return { status: 'ok', pg: 'ok', redis: pong === 'PONG' ? 'ok' : 'degraded' };
    } catch {
      return res.status(503).send({ status: 'degraded' });
    }
  });
};
