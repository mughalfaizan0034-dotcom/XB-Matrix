import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { loadCurrentUser, signIn } from '../services/auth-service.js';

const SignInBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/sign-in', async (req, res) => {
    const body = SignInBody.parse(req.body);
    const { token, user } = await signIn(app, body.email, body.password);

    res.setCookie(app.config.auth.sessionCookieName, token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'none', // cross-origin (web on github.io, api on run.app)
      maxAge: 60 * 60 * 24 * 7,
      ...(app.config.auth.sessionCookieDomain
        ? { domain: app.config.auth.sessionCookieDomain }
        : {}),
    });

    return {
      ok: true,
      data: { user },
      requestId: req.id,
    };
  });

  app.post('/sign-out', async (req, res) => {
    res.clearCookie(app.config.auth.sessionCookieName, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    return { ok: true, data: { signedOut: true }, requestId: req.id };
  });

  app.get('/me', async (req) => {
    if (!req.actor) {
      return { ok: true, data: { user: null }, requestId: req.id };
    }
    const user = await loadCurrentUser(app, req.actor);
    return { ok: true, data: { user }, requestId: req.id };
  });
};
