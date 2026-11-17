import { retried } from '@/lib/vacancy-form-load';

const importEdit = () => import('@/lib/vacancy-edit-submit');
const importEditFeedback = () =>
  import('@/components/vacancies/edit-form-feedback');

/** Kept out of `vacancy-form-load` so the create page's initial JavaScript does not carry the edit loaders (PERF-04). */
export const loadEditSubmit = () => retried(importEdit);
export const loadEditFeedback = () => retried(importEditFeedback);

export type EditModule = Awaited<ReturnType<typeof importEdit>>;
export type EditFeedbackModule = Awaited<ReturnType<typeof importEditFeedback>>;
