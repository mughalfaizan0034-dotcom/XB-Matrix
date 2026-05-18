import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import type { ApiConfig } from '@xb/config/api';

import { dbPlugin } from './plugins/db.js';
import { redisPlugin } from './plugins/redis.js';
import { auditContextPlugin } from './plugins/audit-context.js';
import { resolverPlugin } from './plugins/resolver.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { requestIdPlugin } from './plugins/request-id.js';

import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { organizationRoutes } from './routes/organizations.js';

export async function buildServer(config: ApiConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.nodeEnv === 'development'
        ? {
            level: config.logLevel,
            transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
          }
        : { level: config.logLevel },
    disableRequestLogging: false,
    trustProxy: true,
    bodyLimit: 10 * 1024 * 1024,
  });

  app.decorate('config', config);

  // Order matters: request-id first so every later plugin/log line has it.
  await app.register(requestIdPlugin);
  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: config.auth.jwtSecret,
    cookie: { cookieName: config.auth.sessionCookieName, signed: false },
  });

  await app.register(dbPlugin);
  await app.register(redisPlugin);

  // Audit context must run BEFORE any route handler that hits the DB, so the
  // app.* settings are set on the connection before queries execute.
  await app.register(auditContextPlugin);
  await app.register(resolverPlugin);

  await app.register(errorHandlerPlugin);

  // Routes
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(organizationRoutes, { prefix: '/v1/organizations' });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: ApiConfig;
  }
}
