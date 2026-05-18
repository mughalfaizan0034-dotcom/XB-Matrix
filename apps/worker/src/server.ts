import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import type { WorkerConfig } from '@xb/config/worker';

import { dbPlugin } from './plugins/db.js';
import { redisPlugin } from './plugins/redis.js';
import { healthRoutes } from './routes/health.js';
import { taskRoutes } from './routes/tasks.js';

export async function buildWorker(config: WorkerConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.nodeEnv === 'development'
        ? {
            level: config.logLevel,
            transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
          }
        : { level: config.logLevel },
    trustProxy: true,
    bodyLimit: 25 * 1024 * 1024,
  });

  app.decorate('config', config);
  await app.register(sensible);
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(taskRoutes, { prefix: '/tasks' });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: WorkerConfig;
  }
}
