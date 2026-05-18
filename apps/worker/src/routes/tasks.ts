import type { FastifyPluginAsync } from 'fastify';

const TASK_TYPES = [
  'upload.process',
  'report.generate',
  'forecast.run',
  'audit.archive',
  'soft_delete.purge',
] as const;

type TaskType = (typeof TASK_TYPES)[number];

interface TaskPayload {
  readonly taskType: TaskType;
  readonly idempotencyKey: string;
  readonly organizationId: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Cloud Tasks pushes HTTP POSTs to this endpoint. The taskType in the URL
 * dispatches to a per-type handler. Handlers are intentionally stubs in the
 * foundation phase — real upload processing, report generation, and forecasting
 * land in later phases.
 *
 * Cloud Tasks adds `X-CloudTasks-*` headers; verify them in production via
 * OIDC token validation before dispatching real work.
 */
export const taskRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { taskType: string }; Body: TaskPayload }>(
    '/:taskType',
    async (req, res) => {
      const { taskType } = req.params;
      if (!TASK_TYPES.includes(taskType as TaskType)) {
        return res.status(400).send({ ok: false, error: { code: 'unknown_task_type', message: `unknown task type: ${taskType}` } });
      }

      // TODO: verify Cloud Tasks OIDC token (req.headers.authorization)
      // TODO: idempotency check via Redis (key: `task:${idempotencyKey}`)
      // TODO: dispatch to per-task-type handler

      app.log.info({ taskType, idempotencyKey: req.body?.idempotencyKey }, 'received task (stub)');
      return { ok: true, data: { received: true, stub: true } };
    },
  );
};
