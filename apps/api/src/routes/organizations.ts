import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { OrganizationId } from '@xb/types';
import {
  createOrganization,
  getOrganization,
  listOrganizations,
  patchOrganization,
} from '../services/organization-service.js';
import { ok } from '../lib/http-helpers.js';

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  status: z.enum(['active', 'suspended', 'archived']).optional(),
});

const CreateBody = z.object({
  displayName: z.string().min(1).max(200),
  legalName: z.string().max(200).optional(),
  slug: z.string().regex(/^[a-z0-9-]{1,64}$/, 'slug must be lowercase, digits, or hyphens'),
  defaultCurrencyCode: z.string().regex(/^[A-Z]{3}$/, 'currency must be 3 uppercase letters'),
  defaultTimezone: z.string().max(64).optional(),
});

const PatchBody = z.object({
  displayName: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).nullable().optional(),
  defaultCurrencyCode: z.string().regex(/^[A-Z]{3}$/).optional(),
  defaultTimezone: z.string().max(64).optional(),
  expectedRowVersion: z.number().int().nonnegative(),
});

const IdParam = z.object({
  id: z.string().length(26, 'id must be a ULID'),
});

export const organizationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const actor = req.requireActor();
    const q = ListQuery.parse(req.query);
    const items = await listOrganizations(app, actor, q);
    return ok({ items, page: { cursor: null, hasMore: false } }, req.id);
  });

  app.get('/:id', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const org = await getOrganization(app, actor, id as OrganizationId);
    if (!org) {
      return ok({ organization: null }, req.id);
    }
    return ok({ organization: org }, req.id);
  });

  app.post('/', async (req, res) => {
    const actor = req.requireActor();
    const body = CreateBody.parse(req.body);
    const org = await createOrganization(app, actor, body);
    res.status(201);
    return ok({ organization: org }, req.id);
  });

  app.patch('/:id', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const body = PatchBody.parse(req.body);
    const org = await patchOrganization(app, actor, id as OrganizationId, body);
    return ok({ organization: org }, req.id);
  });
};
