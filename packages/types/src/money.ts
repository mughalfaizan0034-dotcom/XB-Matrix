import type { Brand } from './brand.js';

export type CurrencyCode = Brand<string, 'CurrencyCode'>;

export interface Money {
  readonly amount: string;
  readonly currency: CurrencyCode;
}

export type Percentage = Brand<string, 'Percentage'>;
export type Ratio = Brand<string, 'Ratio'>;
