import { headers } from 'next/headers';
import { ContentSkeleton } from '@/components/vacancies/vacancy-content-feedback';
import { loadVacancy } from '../../../_lib/vacancy';

const CONTENT_EDIT_PATH = /^\/vacancies\/([0-9a-f-]{36})\/content\/edit\/?$/i;

/** A loading boundary gets no route params, so the id comes from the request path; the layout above already read the vacancy, so this is a cache hit and the skeleton carries the real heading. */
export default async function ContentEditLoading() {
  const path = (await headers()).get('x-pathname');
  const id = path
    ? CONTENT_EDIT_PATH.exec(path.split('?')[0]!)?.[1]
    : undefined;
  const found = id ? await loadVacancy(id) : null;
  return (
    <ContentSkeleton
      vacancy={
        found
          ? { id: found.id, number: found.number, title: found.title }
          : null
      }
    />
  );
}
