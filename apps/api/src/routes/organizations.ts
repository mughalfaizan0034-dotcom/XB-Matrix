import type { FastifyPluginAsync } from 'fastify';

/**
 * Organizations routes — placeholder list endpoint.
 *
 * Wired against the future internal_manager-only listing; for now returns
 * an empty array so the contract shape exists for the frontend.
 */
export const organizationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    return {
      ok: true,
      data: { items: [], page: { cursor: null, hasMore: false } },
      requestId: req.id,
    };
  });
};
