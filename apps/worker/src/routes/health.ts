import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/live', async () => ({ status: 'ok' }));

  app.get('/ready', async (_req, res) => {
    let pg: 'ok' | 'down' = 'down';
    let redis: 'ok' | 'degraded' = 'degraded';
    try {
      await app.pg.query('SELECT 1');
      pg = 'ok';
    } catch (err) {
      app.log.error({ err }, 'pg readiness check failed');
      return res.status(503).send({ status: 'down', pg: 'down', redis });
    }
    try {
      if (app.redis.status === 'ready' && (await app.redis.ping()) === 'PONG') {
        redis = 'ok';
      }
    } catch {
      // intentional
    }
    return { status: redis === 'ok' ? 'ok' : 'degraded', pg, redis };
  });
};
