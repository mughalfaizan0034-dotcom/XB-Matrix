import fp from 'fastify-plugin';
import type { PoolClient } from 'pg';
import type { ActorContext } from '@xb/types';

/**
 * Implements Spec 3 §1.7 — Connection Context Contract.
 *
 * Every DB transaction must `SET LOCAL` the connection context variables BEFORE
 * any query so RLS policies and audit triggers can read them. We expose a
 * `withConnection` helper that begins a transaction, sets context, runs the
 * caller's work, and commits/rolls back appropriately.
 *
 * Missing actor context is a programming error, not a permission failure.
 */
export const auditContextPlugin = fp(async (app) => {
  app.decorate(
    'withConnection',
    async <T>(
      actor: ActorContext,
      work: (client: PoolClient) => Promise<T>,
    ): Promise<T> => {
      const client = await app.pg.connect();
      try {
        await client.query('BEGIN');
        await setConnectionContext(client, actor);
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  );
});

async function setConnectionContext(client: PoolClient, actor: ActorContext): Promise<void> {
  // SET LOCAL — values persist only for the current transaction; pool connections
  // never leak context between requests.
  const settings: Array<[string, string]> = [
    ['app.current_actor_id', actor.actorId],
    ['app.current_actor_kind', actor.actorKind],
    ['app.current_request_id', actor.requestId],
    ['app.is_internal_manager', actor.isInternalManager ? 'true' : 'false'],
  ];
  if (actor.organizationId) {
    settings.push(['app.current_organization_id', actor.organizationId]);
  }
  if (actor.sessionId) {
    settings.push(['app.current_session_id', actor.sessionId]);
  }

  for (const [key, value] of settings) {
    await client.query('SELECT set_config($1, $2, true)', [key, value]);
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    withConnection<T>(
      actor: ActorContext,
      work: (client: PoolClient) => Promise<T>,
    ): Promise<T>;
  }
}
