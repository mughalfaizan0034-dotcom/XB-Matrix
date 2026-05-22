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
import { authCookiePlugin } from './plugins/auth-cookie.js';
import { emailPlugin } from './plugins/email.js';
import { storagePlugin } from './plugins/storage.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { requestIdPlugin } from './plugins/request-id.js';

import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { organizationRoutes } from './routes/organizations.js';
import { workspaceRoutes } from './routes/workspaces.js';
import { auditRoutes } from './routes/audit.js';
import { userRoutes } from './routes/users.js';
import { invitationRoutes } from './routes/invitations.js';
import { uploadRoutes } from './routes/uploads.js';
import { salesRoutes } from './routes/sales.js';
import { inventoryRoutes } from './routes/inventory.js';
import { skuAliasRoutes } from './routes/sku-aliases.js';
import { unresolvedSkuRoutes } from './routes/unresolved-sku.js';
import { permissionRoutes } from './routes/permissions.js';
import { platformRoutes } from './routes/platform.js';
import { intelligenceRoutes } from './routes/intelligence.js';
import { bootstrapRoutes } from './routes/bootstrap.js';

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

  // Order: request-id first so every later plugin/log line has it.
  await app.register(requestIdPlugin);
  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });

  const allowed = new Set(config.auth.webOrigins);
  await app.register(cors, {
    credentials: true,
    origin: (origin, cb) => {
      // Same-origin or non-browser requests (no Origin header) — allow.
      if (!origin) return cb(null, true);
      if (allowed.has(origin)) return cb(null, true);
      cb(new Error(`origin not allowed: ${origin}`), false);
    },
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: config.auth.jwtSecret,
    cookie: { cookieName: config.auth.sessionCookieName, signed: false },
  });

  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(emailPlugin);
  await app.register(storagePlugin);

  // Audit context + resolver
  await app.register(auditContextPlugin);
  await app.register(resolverPlugin);

  // Session: parse JWT cookie into req.actor (or null). Public routes ignore;
  // protected routes call req.requireActor().
  await app.register(authCookiePlugin);

  await app.register(errorHandlerPlugin);

  // Routes
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(organizationRoutes, { prefix: '/v1/organizations' });
  await app.register(workspaceRoutes, { prefix: '/v1/workspaces' });
  await app.register(auditRoutes, { prefix: '/v1/audit' });
  await app.register(userRoutes, { prefix: '/v1/users' });
  await app.register(invitationRoutes, { prefix: '/v1/invitations' });
  await app.register(uploadRoutes, { prefix: '/v1/uploads' });
  await app.register(salesRoutes, { prefix: '/v1/sales' });
  await app.register(inventoryRoutes, { prefix: '/v1/inventory' });
  await app.register(skuAliasRoutes, { prefix: '/v1/sku-aliases' });
  await app.register(unresolvedSkuRoutes, { prefix: '/v1/unresolved-sku' });
  await app.register(permissionRoutes, { prefix: '/v1/permissions' });
  await app.register(platformRoutes, { prefix: '/v1/platform' });
  // Intelligence/engine layer — workspace-scoped, read-only. Backs
  // dashboard + module pages + reports + (later) AI insights. All KPI
  // math happens here; the frontend renders engine output verbatim.
  await app.register(intelligenceRoutes, { prefix: '/v1/intelligence' });
  // Temporary bootstrap / testing surface — internal-manager only.
  // Speeds up multi-user workflow validation while invitations +
  // permissions matrix UIs are still under construction.
  await app.register(bootstrapRoutes, { prefix: '/v1/bootstrap' });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: ApiConfig;
  }
}
