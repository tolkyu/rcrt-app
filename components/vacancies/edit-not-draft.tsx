import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FormPageHeading } from '@/components/ui/form-page-frame';
import { useEditSubtitle } from '@/components/vacancies/edit-subtitle';
import { FormAlert } from '@/components/vacancies/form-alert';
import type { VacancyDetail } from '@/lib/schemas/vacancy';

/** A published, closed or cancelled vacancy has no edit form (VAC-08 edits opened ones): the heading, the reason and the way to its card. */
export function EditNotDraft({ vacancy }: { vacancy: VacancyDetail }) {
  const t = useTranslations('vacancyForm');
  const tVacancies = useTranslations('vacancies');
  const subtitle = useEditSubtitle(vacancy);
  return (
    <>
      <FormPageHeading
        title={t('edit.title')}
        subtitle={subtitle}
        back={{ href: '/vacancies', label: t('back') }}
      />
      <FormAlert
        action={
          <Link href={`/vacancies/${vacancy.id}`} className="underline">
            {t('edit.notDraft.link')}
          </Link>
        }
      >
        {tVacancies('draftErrors.notDraft')}
      </FormAlert>
    </>
  );
}
