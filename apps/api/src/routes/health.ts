import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // Liveness — process is up. No external dependency.
  app.get('/live', async () => ({ status: 'ok' }));

  // Readiness — Postgres is the only hard dependency for boot. Redis is
  // optional: when unreachable we still serve traffic in degraded mode
  // (cache/ratelimit absent, sessions still work via JWT). Cloud Run startup
  // probes will accept the revision if PG is healthy.
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
      // intentional: redis is non-fatal
    }
    return { status: redis === 'ok' ? 'ok' : 'degraded', pg, redis };
  });
};
