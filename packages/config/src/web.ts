import { z } from 'zod';

const WebPublicConfigSchema = z.object({
  apiBaseUrl: z.string().url(),
  appName: z.string().default('xB Matrix'),
});

export type WebPublicConfig = z.infer<typeof WebPublicConfigSchema>;

export function loadWebPublicConfig(env: NodeJS.ProcessEnv = process.env): WebPublicConfig {
  return WebPublicConfigSchema.parse({
    apiBaseUrl: env.NEXT_PUBLIC_API_BASE_URL,
    appName: env.NEXT_PUBLIC_APP_NAME,
  });
}
