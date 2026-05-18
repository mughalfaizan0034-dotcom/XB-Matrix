import fp from 'fastify-plugin';
import IORedis from 'ioredis';

/**
 * Worker is tolerant of Redis being down at boot — connection is lazy.
 * Tasks that need Redis (e.g., idempotency cache) check `app.redis.status`.
 */
export const redisPlugin = fp(async (app) => {
  const redis = new IORedis(app.config.redis.url, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    retryStrategy: (times) => (times > 10 ? null : Math.min(times * 200, 2000)),
  });

  redis.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'EACCES' || err.code === 'ETIMEDOUT') {
      app.log.warn({ url: app.config.redis.url, code: err.code }, 'redis unreachable');
      return;
    }
    app.log.warn({ err }, 'redis error');
  });

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
