import type { AiProvider, AiProviderKey } from './provider.js';

export class AiProviderRegistry {
  private readonly providers = new Map<AiProviderKey, AiProvider>();
  private defaultKey: AiProviderKey | null = null;

  register(provider: AiProvider, opts: { asDefault?: boolean } = {}): void {
    this.providers.set(provider.key, provider);
    if (opts.asDefault || this.defaultKey === null) {
      this.defaultKey = provider.key;
    }
  }

  get(key: AiProviderKey): AiProvider {
    const p = this.providers.get(key);
    if (!p) throw new Error(`AI provider not registered: ${key}`);
    return p;
  }

  getDefault(): AiProvider {
    if (this.defaultKey === null) throw new Error('no AI providers registered');
    return this.get(this.defaultKey);
  }

  list(): ReadonlyArray<AiProvider> {
    return Array.from(this.providers.values());
  }
}
