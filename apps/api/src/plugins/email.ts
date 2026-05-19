import fp from 'fastify-plugin';
import type { EmailProvider } from '../services/email-service.js';
import { makeEmailProvider } from '../services/email-service.js';

export const emailPlugin = fp(async (app) => {
  const provider = makeEmailProvider(app);
  app.decorate('email', provider);
});

declare module 'fastify' {
  interface FastifyInstance {
    email: EmailProvider;
  }
}
