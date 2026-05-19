import type { FastifyInstance } from 'fastify';
import { RateLimitError } from './errors.js';

export interface RateLimitOptions {
  /** Logical bucket name, e.g. 'forgot-password' */
  readonly key: string;
  /** Stable subject — typically email or IP */
  readonly subject: string;
  /** Maximum allowed events in the window */
  readonly limit: number;
  /** Window length in seconds */
  readonly windowSeconds: number;
}

/**
 * Sliding-fixed-window rate limit via Redis INCR + EX. Fail-open: if
 * Redis is unreachable the request is allowed (we accept a small abuse
 * window in exchange for not lock-out under infra incidents).
 *
 * Throws RateLimitError(429) with retry-after set when over limit.
 */
export async function rateLimit(
  app: FastifyInstance,
  opts: RateLimitOptions,
): Promise<void> {
  if (app.redis.status !== 'ready') return;
  const redisKey = `xb:rl:${opts.key}:${opts.subject.toLowerCase()}`;
  try {
    const count = await app.redis.incr(redisKey);
    if (count === 1) await app.redis.expire(redisKey, opts.windowSeconds);
    if (count > opts.limit) {
      const ttl = await app.redis.ttl(redisKey).catch(() => opts.windowSeconds);
      throw new RateLimitError(
        `Too many ${opts.key} attempts. Try again in ${Math.max(ttl, 1)} seconds.`,
        Math.max(ttl, 1),
      );
    }
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    // Any other Redis error: fail-open.
    app.log.warn({ err, key: redisKey }, 'rate-limit redis error — failing open');
  }
}
