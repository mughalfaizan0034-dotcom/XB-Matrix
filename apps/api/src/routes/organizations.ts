import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { OrganizationId } from '@xb/types';
import {
  archiveOrganization,
  createOrganization,
  getOrganization,
  listOrganizations,
  patchOrganization,
  reactivateOrganization,
  restoreOrganization,
  softDeleteOrganization,
  suspendOrganization,
} from '../services/organization-service.js';
import { NotFoundError } from '../lib/errors.js';
import { ok } from '../lib/http-helpers.js';

const ULID = z.string().length(26);

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  status: z.enum(['active', 'suspended', 'archived']).optional(),
});

const CreateBody = z.object({
  displayName: z.string().trim().min(1).max(200),
  legalName: z.string().trim().max(200).optional(),
  defaultCurrencyCode: z.string().regex(/^[A-Z]{3}$/, 'currency must be 3 uppercase letters'),
  defaultTimezone: z.string().trim().max(64).optional(),
});

const PatchBody = z.object({
  displayName: z.string().trim().min(1).max(200).optional(),
  legalName: z.string().trim().max(200).nullable().optional(),
  defaultCurrencyCode: z.string().regex(/^[A-Z]{3}$/).optional(),
  defaultTimezone: z.string().trim().max(64).optional(),
  expectedRowVersion: z.number().int().nonnegative(),
});

const TransitionBody = z.object({
  expectedRowVersion: z.number().int().nonnegative(),
});

const IdParam = z.object({ id: ULID });

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
    if (!org) throw new NotFoundError('organization', id);
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

  // Lifecycle transitions — POST verbs to keep the semantic distinct from
  // generic PATCH and to make audit-log entry types easier to filter.
  app.post('/:id/suspend', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const { expectedRowVersion } = TransitionBody.parse(req.body);
    const org = await suspendOrganization(app, actor, id as OrganizationId, expectedRowVersion);
    return ok({ organization: org }, req.id);
  });

  app.post('/:id/reactivate', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const { expectedRowVersion } = TransitionBody.parse(req.body);
    const org = await reactivateOrganization(app, actor, id as OrganizationId, expectedRowVersion);
    return ok({ organization: org }, req.id);
  });

  app.post('/:id/archive', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const { expectedRowVersion } = TransitionBody.parse(req.body);
    const org = await archiveOrganization(app, actor, id as OrganizationId, expectedRowVersion);
    return ok({ organization: org }, req.id);
  });

  app.delete('/:id', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const { expectedRowVersion } = TransitionBody.parse(req.body);
    const org = await softDeleteOrganization(app, actor, id as OrganizationId, expectedRowVersion);
    return ok({ organization: org }, req.id);
  });

  app.post('/:id/restore', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const org = await restoreOrganization(app, actor, id as OrganizationId);
    return ok({ organization: org }, req.id);
  });
};
