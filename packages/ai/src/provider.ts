export type AiProviderKey =
  | 'groq'
  | 'openrouter'
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'gemini';

export interface AiMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface AiCompletionRequest {
  readonly model: string;
  readonly messages: ReadonlyArray<AiMessage>;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly stop?: ReadonlyArray<string>;
}

export interface AiUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface AiCompletionResponse {
  readonly content: string;
  readonly model: string;
  readonly provider: AiProviderKey;
  readonly usage: AiUsage | null;
  readonly finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'other';
}

export interface AiProvider {
  readonly key: AiProviderKey;
  readonly displayName: string;
  readonly isFreeTier: boolean;
  complete(req: AiCompletionRequest): Promise<AiCompletionResponse>;
}
