import { z } from 'zod';

export const NodeEnv = z.enum(['development', 'test', 'production']).default('development');
export type NodeEnvType = z.infer<typeof NodeEnv>;

export const LogLevel = z
  .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  .default('info');
export type LogLevelType = z.infer<typeof LogLevel>;

export function requireEnv(name: string, value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export interface LoadedConfig<T> {
  readonly value: T;
  readonly source: 'process.env' | 'override';
}
