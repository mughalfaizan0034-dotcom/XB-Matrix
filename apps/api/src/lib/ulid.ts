import { ulid as ulidImpl } from 'ulid';
import type { Ulid } from '@xb/types';

export function ulid(): Ulid {
  return ulidImpl() as Ulid;
}
