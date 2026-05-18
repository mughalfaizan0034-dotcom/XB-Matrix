import type {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProvider,
} from '../provider.js';

export interface GroqProviderOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
}

export class GroqProvider implements AiProvider {
  readonly key = 'groq' as const;
  readonly displayName = 'Groq';
  readonly isFreeTier = true;

  constructor(private readonly opts: GroqProviderOptions) {}

  async complete(_req: AiCompletionRequest): Promise<AiCompletionResponse> {
    throw new Error('GroqProvider.complete: not implemented in foundation phase');
  }
}
