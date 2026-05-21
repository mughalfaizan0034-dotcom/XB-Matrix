import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  completePasswordReset,
  consumeEmailVerification,
  loadCurrentUser,
  requestEmailVerification,
  requestPasswordReset,
  signIn,
  signOut,
} from '../services/auth-service.js';
import { loadActiveWorkspaceForSession } from '../services/workspace-service.js';
import { rateLimit } from '../lib/rate-limit.js';
import { ok } from '../lib/http-helpers.js';

const SignInBody = z.object({
  // Username-first auth (2026-05-20 pivot). Email-based sign-in
  // returns when resend.com is wired up. Lower-cased here so the
  // lookup is case-insensitive while preserving display casing.
  username: z.string().trim().toLowerCase().min(1).max(120),
  password: z.string().min(1).max(200),
  rememberDevice: z.boolean().optional(),
});

const ForgotBody = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const ResetBody = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(12).max(200),
});

const VerifyEmailBody = z.object({
  token: z.string().min(20).max(200),
});

const REMEMBER_DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;           // 7 days

function setSessionCookie(
  res: import('fastify').FastifyReply,
  cookieName: string,
  token: string,
  rememberDevice = false,
): void {
  res.setCookie(cookieName, token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    // Browser-side cookie lifetime matches the server-side session TTL
    // so the cookie doesn't outlive the row (or vice-versa).
    maxAge: rememberDevice ? REMEMBER_DEVICE_COOKIE_MAX_AGE : DEFAULT_COOKIE_MAX_AGE,
  });
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/sign-in', async (req, res) => {
    const body = SignInBody.parse(req.body);
    const session = await signIn(app, body.username, body.password, {
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip ?? null,
      rememberDevice: body.rememberDevice,
    });
    setSessionCookie(
      res,
      app.config.auth.sessionCookieName,
      session.token,
      body.rememberDevice,
    );
    return ok({ user: session.user }, req.id);
  });

  app.post('/sign-out', async (req, res) => {
    if (req.actor) {
      await signOut(app, req.actor).catch((err) =>
        app.log.warn({ err, sessionId: req.actor?.sessionId }, 'sign-out revoke failed'),
      );
    }
    res.clearCookie(app.config.auth.sessionCookieName, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    return ok({ signedOut: true }, req.id);
  });

  app.get('/me', async (req) => {
    if (!req.actor) return ok({ user: null, activeWorkspace: null }, req.id);
    const user = await loadCurrentUser(app, req.actor);
    const activeWorkspace = req.actor.sessionId
      ? await loadActiveWorkspaceForSession(app, req.actor, req.actor.sessionId)
      : null;
    return ok({ user, activeWorkspace }, req.id);
  });

  /**
   * Forgot password — never reveal whether the email exists. Always
   * returns success after rate-limit + best-effort email send.
   */
  app.post('/forgot-password', async (req) => {
    const body = ForgotBody.parse(req.body);
    await rateLimit(app, {
      key: 'forgot-password:email',
      subject: body.email,
      limit: 5,
      windowSeconds: 60 * 60,
    });
    await rateLimit(app, {
      key: 'forgot-password:ip',
      subject: req.ip ?? 'unknown',
      limit: 20,
      windowSeconds: 60 * 60,
    });
    await requestPasswordReset(app, body.email, req.ip ?? null);
    return ok(
      {
        sent: true,
        message:
          'If an account exists for that email, a reset link has been sent. Check your inbox.',
      },
      req.id,
    );
  });

  app.post('/reset-password', async (req, res) => {
    const body = ResetBody.parse(req.body);
    await rateLimit(app, {
      key: 'reset-password:ip',
      subject: req.ip ?? 'unknown',
      limit: 10,
      windowSeconds: 60 * 60,
    });
    await completePasswordReset(app, body.token, body.password);
    res.clearCookie(app.config.auth.sessionCookieName, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    return ok({ reset: true }, req.id);
  });

  app.post('/verify-email', async (req) => {
    const body = VerifyEmailBody.parse(req.body);
    await consumeEmailVerification(app, body.token);
    return ok({ verified: true }, req.id);
  });

  app.post('/resend-verification', async (req) => {
    const actor = req.requireActor();
    const user = await loadCurrentUser(app, actor);
    if (user.emailVerifiedAt) {
      return ok({ alreadyVerified: true }, req.id);
    }
    await rateLimit(app, {
      key: 'resend-verification:user',
      subject: actor.actorId,
      limit: 5,
      windowSeconds: 60 * 60,
    });
    await requestEmailVerification(app, user);
    return ok({ sent: true }, req.id);
  });
};
