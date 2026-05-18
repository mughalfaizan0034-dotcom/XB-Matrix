import { z } from 'zod';
import { LogLevel, NodeEnv } from './common.js';

const WorkerConfigSchema = z.object({
  nodeEnv: NodeEnv,
  port: z.coerce.number().int().positive().default(4100),
  host: z.string().default('0.0.0.0'),
  logLevel: LogLevel,

  database: z.object({
    url: z.string().min(1),
    poolMin: z.coerce.number().int().nonnegative().default(1),
    poolMax: z.coerce.number().int().positive().default(5),
  }),

  redis: z.object({
    url: z.string().min(1),
  }),

  gcp: z.object({
    projectId: z.string().optional(),
    region: z.string().optional(),
    cloudTasksQueue: z.string().optional(),
    cloudTasksLocation: z.string().optional(),
    uploadsBucket: z.string().optional(),
    reportsBucket: z.string().optional(),
    bigqueryDataset: z.string().default('xbmatrixbq'),
  }),
});

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return WorkerConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    port: env.WORKER_PORT ?? env.PORT,
    host: env.WORKER_HOST,
    logLevel: env.WORKER_LOG_LEVEL ?? env.API_LOG_LEVEL,
    database: {
      url: env.DATABASE_URL,
      poolMin: env.DATABASE_POOL_MIN,
      poolMax: env.DATABASE_POOL_MAX,
    },
    redis: { url: env.REDIS_URL },
    gcp: {
      projectId: env.GCP_PROJECT_ID,
      region: env.GCP_REGION,
      cloudTasksQueue: env.CLOUD_TASKS_QUEUE,
      cloudTasksLocation: env.CLOUD_TASKS_LOCATION,
      uploadsBucket: env.GCS_UPLOADS_BUCKET,
      reportsBucket: env.GCS_REPORTS_BUCKET,
      bigqueryDataset: env.BIGQUERY_DATASET,
    },
  });
}
