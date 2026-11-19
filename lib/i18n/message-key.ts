import type messages from '@/messages/uk.json';

type Leaves<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
}[keyof T & string];

/** Every dotted key of `messages/uk.json` that holds a string, for copy chosen by data (a skeleton hint). */
export type MessageKey = Leaves<typeof messages>;
