import Decimal from 'decimal.js';
import type { CurrencyCode, Money } from '@xb/types';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

const MONEY_SCALE = 4;

export function money(amount: string | number | Decimal, currency: CurrencyCode): Money {
  const value = new Decimal(amount).toFixed(MONEY_SCALE);
  return { amount: value, currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(new Decimal(a.amount).plus(b.amount), a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(new Decimal(a.amount).minus(b.amount), a.currency);
}

export function multiplyMoney(a: Money, factor: string | number): Money {
  return money(new Decimal(a.amount).times(factor), a.currency);
}

export function divideMoney(a: Money, divisor: string | number): Money {
  return money(new Decimal(a.amount).dividedBy(divisor), a.currency);
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return new Decimal(a.amount).comparedTo(b.amount) as -1 | 0 | 1;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
