import fp from 'fastify-plugin';
import IORedis from 'ioredis';

/**
 * Redis is required in production for caching, rate limiting, and session
 * backing. In local dev it is OK for it to be unreachable — the api should
 * still boot. The /health/ready probe surfaces "degraded" in that case so
 * Cloud Run rejects the revision if Redis is not available there.
 *
 * We connect lazily and swallow connect-time errors with a single log line.
 * Code paths that need Redis check `app.redis.status === 'ready'` first.
 */
export const redisPlugin = fp(async (app) => {
  const redis = new IORedis(app.config.redis.url, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      if (times > 10) return null;
      return Math.min(times * 200, 2000);
    },
  });

  // Don't crash the server if Redis is unreachable. Just log it.
  redis.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'EACCES' || err.code === 'ETIMEDOUT') {
      app.log.warn({ url: app.config.redis.url, code: err.code }, 'redis unreachable');
      return;
    }
    app.log.warn({ err }, 'redis error');
  });

  // Kick off an initial connect attempt, but do not await — ioredis will
  // retry under `retryStrategy` and the readiness probe will catch a
  // long-running outage.
  void redis.connect().catch(() => undefined);

  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    if (redis.status !== 'end') {
      await redis.quit().catch(() => undefined);
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    redis: IORedis;
  }
}
