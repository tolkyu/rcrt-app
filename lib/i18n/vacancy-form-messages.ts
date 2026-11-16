import type messages from '@/messages/uk.json';

type Messages = typeof messages;

/** Every namespace the create form reads; the route's nested provider replaces the shell's messages, so a namespace missing here is a runtime missing-key. */
export const vacancyFormClientMessages = ({
  vacancyForm,
  vacancies,
  common,
  states,
  form,
}: Messages) => ({
  vacancyForm,
  vacancies: {
    draftErrors: vacancies.draftErrors,
    createErrors: vacancies.createErrors,
  },
  common,
  states,
  form,
});
