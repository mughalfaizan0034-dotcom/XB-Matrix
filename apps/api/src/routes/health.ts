import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // Liveness — process is up. No DB call.
  app.get('/live', async () => ({ status: 'ok' }));

  // Readiness — DB + Redis must respond. Used by Cloud Run startup probes.
  app.get('/ready', async (_req, res) => {
    try {
      await app.pg.query('SELECT 1');
      const redisPong = await app.redis.ping();
      return { status: 'ok', pg: 'ok', redis: redisPong === 'PONG' ? 'ok' : 'degraded' };
    } catch (err) {
      app.log.error({ err }, 'readiness check failed');
      return res.status(503).send({ status: 'degraded' });
    }
  });
};
