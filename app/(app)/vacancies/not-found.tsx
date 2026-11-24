import { NotFoundState } from '@/components/states/not-found-state';
import { LostClaimCardNotice } from '@/components/vacancies/lost-claim-card-notice';

/** Same view as the app 404; a card URL also repeats a lost claim's warning that the reload dropped. */
export default function VacanciesNotFound() {
  return (
    <>
      <NotFoundState />
      <LostClaimCardNotice />
    </>
  );
}
