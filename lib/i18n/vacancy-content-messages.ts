import type messages from '@/messages/uk.json';

type Messages = typeof messages;

/** The nested provider replaces the shell's messages, so every namespace the editor route reads is listed here and nothing else ships with it. */
export const vacancyContentClientMessages = ({
  vacancies,
  common,
  states,
  form,
  richText,
}: Messages) => ({
  vacancies: { contentEdit: vacancies.contentEdit },
  common,
  states,
  form,
  richText,
});
