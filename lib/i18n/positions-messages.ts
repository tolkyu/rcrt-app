import type messages from '@/messages/uk.json';

type Messages = typeof messages;

/** Every namespace the catalog components read; the route's nested provider replaces the shell's messages, so a namespace missing here is a runtime missing-key. */
export const positionsClientMessages = ({
  positions,
  common,
  states,
  settings,
}: Messages) => ({
  positions,
  common,
  states,
  settings: { common: settings.common },
});
