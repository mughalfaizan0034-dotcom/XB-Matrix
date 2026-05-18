import { z } from 'zod';
import { LogLevel, NodeEnv } from './common.js';

const ApiConfigSchema = z.object({
  nodeEnv: NodeEnv,
  port: z.coerce.number().int().positive().default(4000),
  host: z.string().default('0.0.0.0'),
  logLevel: LogLevel,
  baseUrl: z.string().url(),

  database: z.object({
    url: z.string().min(1),
    poolMin: z.coerce.number().int().nonnegative().default(2),
    poolMax: z.coerce.number().int().positive().default(10),
  }),

  redis: z.object({
    url: z.string().min(1),
  }),

  gcp: z.object({
    projectId: z.string().optional(),
    region: z.string().optional(),
    runtimeServiceAccount: z.string().optional(),
    uploadsBucket: z.string().optional(),
    reportsBucket: z.string().optional(),
    bigqueryDataset: z.string().default('xbmatrixbq'),
    cloudTasksQueue: z.string().optional(),
    cloudTasksLocation: z.string().optional(),
  }),

  auth: z.object({
    jwtSecret: z.string().min(16),
    jwtIssuer: z.string().default('xb-matrix'),
    jwtAudience: z.string().default('xb-matrix-api'),
    sessionCookieName: z.string().default('xbm_session'),
    sessionCookieDomain: z.string().optional(),
  }),

  ai: z.object({
    defaultProvider: z.enum(['groq', 'openrouter', 'ollama']).default('groq'),
    groqApiKey: z.string().optional(),
    openrouterApiKey: z.string().optional(),
    ollamaBaseUrl: z.string().url().default('http://localhost:11434'),
  }),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return ApiConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    port: env.API_PORT,
    host: env.API_HOST,
    logLevel: env.API_LOG_LEVEL,
    baseUrl: env.API_BASE_URL ?? 'http://localhost:4000',
    database: {
      url: env.DATABASE_URL,
      poolMin: env.DATABASE_POOL_MIN,
      poolMax: env.DATABASE_POOL_MAX,
    },
    redis: {
      url: env.REDIS_URL,
    },
    gcp: {
      projectId: env.GCP_PROJECT_ID,
      region: env.GCP_REGION,
      runtimeServiceAccount: env.GCP_RUNTIME_SERVICE_ACCOUNT,
      uploadsBucket: env.GCS_UPLOADS_BUCKET,
      reportsBucket: env.GCS_REPORTS_BUCKET,
      bigqueryDataset: env.BIGQUERY_DATASET,
      cloudTasksQueue: env.CLOUD_TASKS_QUEUE,
      cloudTasksLocation: env.CLOUD_TASKS_LOCATION,
    },
    auth: {
      jwtSecret: env.JWT_SECRET,
      jwtIssuer: env.JWT_ISSUER,
      jwtAudience: env.JWT_AUDIENCE,
      sessionCookieName: env.SESSION_COOKIE_NAME,
      sessionCookieDomain: env.SESSION_COOKIE_DOMAIN,
    },
    ai: {
      defaultProvider: env.AI_DEFAULT_PROVIDER,
      groqApiKey: env.GROQ_API_KEY,
      openrouterApiKey: env.OPENROUTER_API_KEY,
      ollamaBaseUrl: env.OLLAMA_BASE_URL,
    },
  });
}
