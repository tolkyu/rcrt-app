import type messages from '@/messages/uk.json';

type Messages = typeof messages;

/** Every namespace the request form reads; the route's nested provider replaces the shell's messages. */
export const vacancyRequestClientMessages = ({
  vacancyRequest,
  common,
  states,
  form,
}: Messages) => ({ vacancyRequest, common, states, form });
