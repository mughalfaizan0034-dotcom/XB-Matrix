export interface EngineDescriptor {
  readonly key: string;
  readonly version: string;
  readonly description: string;
}

export interface EngineRunMeta {
  readonly engineKey: string;
  readonly engineVersion: string;
  readonly generatedAt: string;
}

export interface Engine<Input, Output> {
  readonly descriptor: EngineDescriptor;
  run(input: Input): Promise<{ output: Output; meta: EngineRunMeta }>;
}

export function makeEngineRunMeta(descriptor: EngineDescriptor): EngineRunMeta {
  return {
    engineKey: descriptor.key,
    engineVersion: descriptor.version,
    generatedAt: new Date().toISOString(),
  };
}
