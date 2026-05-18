import type { FastifyPluginAsync } from 'fastify';

/**
 * Auth routes — placeholders for the foundation phase.
 *
 * Real session/login flow is wired when the internal_users + customer_users
 * tables and the password/SSO design land. For now this returns 501 to make
 * the contract explicit.
 */
export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/sign-in', async (_req, res) => {
    return res.status(501).send({
      ok: false,
      error: {
        code: 'not_implemented',
        message: 'sign-in is not wired in the foundation phase',
      },
      requestId: _req.id,
    });
  });

  app.post('/sign-out', async (req, res) => {
    res.clearCookie(app.config.auth.sessionCookieName, { path: '/' });
    return { ok: true, data: { signedOut: true }, requestId: req.id };
  });

  app.get('/me', async (req) => {
    return {
      ok: true,
      data: { actor: null, note: 'no session in foundation phase' },
      requestId: req.id,
    };
  });
};
