import { v7 as uuidv7 } from 'uuid';

/** Generate a UUIDv7 (time-ordered) primary key. */
export function newId(): string {
  return uuidv7();
}

export function nowMs(): number {
  return Date.now();
}
