import fp from 'fastify-plugin';
import {
  InternalManagerProvider,
  PageOverrideProvider,
  Resolver,
  RoleProvider,
  WorkspaceGrantProvider,
} from '@xb/auth';
import type { ActorContext, PermissionScope } from '@xb/types';

/**
 * Resolver plugin — wires the centralized authorization resolver into Fastify.
 *
 * Order of providers (first to apply wins):
 *   1. internal_manager bypass
 *   2. page-level overrides
 *   3. workspace-level grants
 *   4. role-based baseline
 *
 * Deny-by-default if no provider applies.
 *
 * Workspace + page providers currently use no-op lookups — real implementations
 * arrive when Spec 2 (Permission Truth Table) lands.
 */
export const resolverPlugin = fp(async (app) => {
  const resolver = new Resolver({
    providers: [
      new InternalManagerProvider(),
      new PageOverrideProvider({ getOverride: async () => null }),
      new WorkspaceGrantProvider({ hasGrant: async () => null }),
      new RoleProvider(),
    ],
    onDecision: async (actor, scope, decision) => {
      app.log.debug(
        {
          actor: { id: actor.actorId, kind: actor.actorKind },
          scope,
          decision,
        },
        'resolver decision',
      );
      // TODO: write to xb_audit.permission_decisions in a later phase
    },
  });

  app.decorate('resolver', resolver);

  app.decorate('assertPermission', async function (
    actor: ActorContext,
    scope: PermissionScope,
  ): Promise<void> {
    await resolver.assert(actor, scope);
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    resolver: Resolver;
    assertPermission(actor: ActorContext, scope: PermissionScope): Promise<void>;
  }
}
