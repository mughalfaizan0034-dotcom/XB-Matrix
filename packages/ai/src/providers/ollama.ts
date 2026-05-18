import type {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProvider,
} from '../provider.js';

export interface OllamaProviderOptions {
  readonly baseUrl: string;
}

export class OllamaProvider implements AiProvider {
  readonly key = 'ollama' as const;
  readonly displayName = 'Ollama (local)';
  readonly isFreeTier = true;

  constructor(private readonly opts: OllamaProviderOptions) {}

  async complete(_req: AiCompletionRequest): Promise<AiCompletionResponse> {
    throw new Error('OllamaProvider.complete: not implemented in foundation phase');
  }
}
