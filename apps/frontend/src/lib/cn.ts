import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-standard class composer: merge Tailwind classes with clsx + twMerge. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
