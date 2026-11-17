const importSubmit = () => import('@/lib/vacancy-form-submit');
const importFeedback = () => import('@/components/vacancies/form-feedback');

/** A chunk that failed to load gets one more try; the heavy parts stay out of the create page's initial JavaScript (PERF-04). */
export const retried = <T>(load: () => Promise<T>, retry = true): Promise<T> =>
  load().catch((error: unknown) => {
    if (!retry) throw error;
    return retried(load, false);
  });

export const loadSubmit = () => retried(importSubmit);
export const loadFeedback = () => retried(importFeedback);

export type SubmitModule = Awaited<ReturnType<typeof importSubmit>>;
export type FeedbackModule = Awaited<ReturnType<typeof importFeedback>>;
