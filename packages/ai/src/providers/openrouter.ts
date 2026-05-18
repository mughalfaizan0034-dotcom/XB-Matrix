import type {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProvider,
} from '../provider.js';

export interface OpenRouterProviderOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly siteUrl?: string;
  readonly appName?: string;
}

export class OpenRouterProvider implements AiProvider {
  readonly key = 'openrouter' as const;
  readonly displayName = 'OpenRouter';
  readonly isFreeTier = true;

  constructor(private readonly opts: OpenRouterProviderOptions) {}

  async complete(_req: AiCompletionRequest): Promise<AiCompletionResponse> {
    throw new Error('OpenRouterProvider.complete: not implemented in foundation phase');
  }
}
