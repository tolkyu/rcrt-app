/** What the edit form needs only after the user acts (diff, PATCH, publish, reload); loaded on mount, outside the page's initial JavaScript (PERF-04). */
import type { QueryClient } from '@tanstack/react-query';
import type { useTranslations } from 'next-intl';
import type { UseFormSetError } from 'react-hook-form';
import { apiRequest } from '@/lib/api-client';
import {
  retrySessionLoss,
  vacancyDetailQuery,
} from '@/lib/queries/vacancy-detail';
import { queryKeys } from '@/lib/query-keys';
import {
  vacancyDetailSchema,
  type CreateVacancyBody,
  type PatchVacancyInput,
  type VacancyDetail,
} from '@/lib/schemas/vacancy';
import { toast } from '@/lib/toast';
import {
  noteVacancyWriteFailure,
  watchVacancyAccess,
  type VacancyAccessWatch,
} from '@/lib/vacancy-detail-cache';
import {
  FILLED_CODE,
  type FilledField,
  type VacancyFormErrors,
  VACANCY_FORM_FIELDS,
  type VacancyFormMode,
  type VacancyFormValues,
} from '@/lib/vacancy-form';
import {
  planEditFailure,
  type EditFailureEffect,
} from '@/lib/vacancy-form-failure';
import {
  applyCreatedVacancy,
  markFieldErrors,
  rememberedListHref,
  showFailureToast,
  vacancyDraftLandingHref,
  type createAttemptKeys,
} from '@/lib/vacancy-form-submit';

export * from '@/lib/vacancy-form-submit';

export type PatchChanges = Omit<PatchVacancyInput, 'expectedVersion'>;

const EDIT_FIELDS = [...VACANCY_FORM_FIELDS, 'priority'] as const;
export type EditField = (typeof EDIT_FIELDS)[number];

/** Per form field, the patch keys its value maps to (`null` clears an optional column); `null` result = this state has no patch (a blank headcount or probation: neither column can be cleared). */
const PATCH_OF: Record<
  EditField,
  (body: CreateVacancyBody) => PatchChanges | null
> = {
  verticalId: () => ({}),
  positionId: ({ positionId }) => ({ positionId: positionId ?? null }),
  title: ({ title }) => ({ title }),
  headcount: ({ headcount }) =>
    headcount === undefined ? null : { headcount },
  priority: ({ priority }) => ({ priority }),
  teamLeadId: ({ teamLeadId }) => ({ teamLeadId: teamLeadId ?? null }),
  seniority: ({ seniority }) => ({ seniority: seniority ?? null }),
  workFormat: ({ workFormat }) => ({ workFormat: workFormat ?? null }),
  employmentType: ({ employmentType }) => ({
    employmentType: employmentType ?? null,
  }),
  location: ({ location }) => ({ location: location ?? null }),
  salaryMin: ({ salaryMinMinor }) => ({
    salaryMinMinor: salaryMinMinor ?? null,
  }),
  salaryMax: ({ salaryMaxMinor }) => ({
    salaryMaxMinor: salaryMaxMinor ?? null,
  }),
  salaryCurrency: ({ salaryCurrency }) => ({
    salaryCurrency: salaryCurrency ?? null,
  }),
  probationDays: ({ probationDays }) =>
    probationDays === undefined ? null : { probationDays },
};

export type PatchPlan =
  | {
      readonly ok: true;
      readonly changes: PatchChanges | null;
      /** Every field the user sees, as patch keys: what a stored draft must hold to count as «my save went through». */
      readonly everything: PatchChanges;
    }
  | { readonly ok: false; readonly errors: VacancyFormErrors };

/** Only what the user changed is sent, so a field they never touched (or one their role may not set) cannot be overwritten by an old value. A changed field that has no patch is refused, never dropped. */
export function buildPatch(
  baseline: VacancyFormValues,
  values: VacancyFormValues,
  body: CreateVacancyBody,
  shown: { readonly teamLead: boolean; readonly probation: boolean },
): PatchPlan {
  const changes: PatchChanges = {};
  const everything: PatchChanges = {};
  for (const field of EDIT_FIELDS) {
    if (field === 'teamLeadId' && !shown.teamLead) continue;
    if (field === 'probationDays' && !shown.probation) continue;
    const patch = PATCH_OF[field](body);
    if (patch) Object.assign(everything, patch);
    if (baseline[field] === values[field]) continue;
    if (!patch) {
      // Only headcount and probation have no patch for a blank value; both are in FILLED_CODE.
      const code = FILLED_CODE[field as FilledField];
      return { ok: false, errors: { [field]: code } };
    }
    Object.assign(changes, patch);
  }
  return {
    ok: true,
    changes: Object.keys(changes).length > 0 ? changes : null,
    everything,
  };
}

/** Whether the stored draft already holds every value the patch asked for. */
function holdsPatch(stored: VacancyDetail, changes: PatchChanges): boolean {
  const current: Record<string, unknown> = {
    ...stored,
    positionId: stored.position?.id ?? null,
    teamLeadId: stored.teamLead?.id ?? null,
    priority: stored.priority,
  };
  return Object.entries(changes).every(
    ([key, wanted]) => key === 'expectedVersion' || current[key] === wanted,
  );
}

const draftPath = (id: string) => `/vacancies/${encodeURIComponent(id)}`;

export const patchDraft = (
  id: string,
  changes: PatchChanges,
  expectedVersion: number,
) =>
  apiRequest(draftPath(id), {
    method: 'PATCH',
    body: { ...changes, expectedVersion },
    schema: vacancyDetailSchema,
  });

export const publishDraft = (
  id: string,
  expectedVersion: number,
  key: string,
) =>
  apiRequest(`${draftPath(id)}/publish`, {
    method: 'POST',
    body: { expectedVersion },
    headers: { 'Idempotency-Key': key },
    schema: vacancyDetailSchema,
  });

export interface EditRequest {
  readonly id: string;
  readonly version: number;
  readonly action: VacancyFormMode;
  readonly changes: PatchChanges | null;
  /** From `buildPatch`: every visible field, for the lost-answer check. */
  readonly everything: PatchChanges;
  readonly hasSalaryAmount: boolean;
}

export type EditFinalFailure = Exclude<
  EditFailureEffect,
  { readonly type: 'retry' }
>;

export type EditOutcome =
  | {
      readonly status: 'saved' | 'published';
      /** `null` when a save had nothing to send. */
      readonly vacancy: VacancyDetail | null;
    }
  | {
      readonly status: 'failed';
      readonly effect: EditFinalFailure;
      /** Which call was refused: only a refused publish says the saved draft is fine. */
      readonly stage: 'patch' | 'publish';
      /** The draft as the server stored it when the PATCH worked and the publish did not. */
      readonly saved: VacancyDetail | null;
    };

/** Cancel first: an inactive in-flight DRAFT read is not replaced by invalidation alone. */
const refreshPublished = (queryClient: QueryClient, id: string) => {
  const filter = { queryKey: queryKeys.vacancyContent(id), exact: true };
  queryClient
    .cancelQueries(filter)
    .then(() => queryClient.invalidateQueries(filter))
    .catch(() => undefined);
  queryClient
    .invalidateQueries({ queryKey: queryKeys.vacancy(id), exact: true })
    .catch(() => undefined);
};

/** The caches are updated here, before the page may have gone away: a saved or published draft must reach the lists even if the form unmounted meanwhile. */
export async function submitEdit(
  queryClient: QueryClient,
  attempts: ReturnType<typeof createAttemptKeys>,
  { id, version, action, changes, everything, hasSalaryAmount }: EditRequest,
  stillAllowed: VacancyAccessWatch = watchVacancyAccess(queryClient, id),
): Promise<EditOutcome> {
  const context = { hasSalaryAmount };
  let saved: VacancyDetail | null = null;
  if (changes) {
    try {
      saved = await patchDraft(id, changes, version);
    } catch (error) {
      noteVacancyWriteFailure(queryClient, error, id);
      const effect = planEditFailure(error, true, context);
      // A PATCH is not replayable: when its answer was lost the retry meets a newer version, so the stored draft is checked before the author is warned.
      if (effect.type === 'stale')
        saved = await findAppliedPatch(queryClient, id, version, everything);
      if (!saved)
        return { status: 'failed', effect, stage: 'patch', saved: null };
    }
    await applyCreatedVacancy(queryClient, saved, stillAllowed);
  }
  if (action === 'DRAFT') return { status: 'saved', vacancy: saved };
  const expectedVersion = saved?.version ?? version;
  for (let retried = false; ; retried = true) {
    try {
      const published = await publishDraft(
        id,
        expectedVersion,
        attempts.keyFor({ id, expectedVersion }),
      );
      await applyCreatedVacancy(queryClient, published, stillAllowed);
      refreshPublished(queryClient, id);
      return { status: 'published', vacancy: published };
    } catch (error) {
      noteVacancyWriteFailure(queryClient, error, id);
      const effect = planEditFailure(error, retried, context);
      if (effect.type !== 'retry')
        return { status: 'failed', effect, stage: 'publish', saved };
      attempts.reset();
    }
  }
}

async function findAppliedPatch(
  queryClient: QueryClient,
  id: string,
  version: number,
  everything: PatchChanges,
): Promise<VacancyDetail | null> {
  try {
    const latest = await loadLatestVacancy(queryClient, id);
    // Exactly one write since the author's version, and it holds everything on screen: an edit from another tab can never ride along into a publish.
    return latest.status === 'DRAFT' &&
      latest.version === version + 1 &&
      holdsPatch(latest, everything)
      ? latest
      : null;
  } catch {
    return null;
  }
}

/** Reads the draft again, bypassing the cache: the stale alert's «Завантажити актуальну». */
export const loadLatestVacancy = (queryClient: QueryClient, id: string) =>
  queryClient.fetchQuery({
    ...vacancyDetailQuery(id),
    staleTime: 0,
    // The author is waiting on this answer: one failure goes to the toast, whose button tries again.
    retry: retrySessionLoss,
  });

type Translate = ReturnType<typeof useTranslations<'vacancyForm'>>;

/** Announces the result and returns where the form goes next: the card after a publish, the author's «Чернетки» after a save. */
export function announceEdited(
  t: Translate,
  action: VacancyFormMode,
  vacancy: Pick<VacancyDetail, 'id' | 'number' | 'title' | 'vertical'>,
): string {
  toast.success(
    t(action === 'PUBLISH' ? 'toast.published' : 'toast.draftSaved'),
    {
      description: t('toast.summary', {
        number: vacancy.number,
        title: vacancy.title,
      }),
    },
  );
  return action === 'PUBLISH'
    ? `/vacancies/${vacancy.id}`
    : vacancyDraftLandingHref(vacancy.vertical.id, vacancy.id);
}

type EditTranslate = ReturnType<typeof useTranslations<'vacancyForm.edit'>>;

/** Title only: the alert above the form already explains it. */
export const announceStale = (t: EditTranslate, id: string) =>
  toast.warning(t('toast.stale'), { id: `stale:vacancy:${id}` });

export const announceGone = (t: EditTranslate) =>
  toast.error(t('toast.gone'), { description: t('toast.goneDescription') });

/** The draft stays saved when only the publish was refused; this points the author at the flagged fields. */
export const announceRefused = (t: EditTranslate, showFields: () => void) =>
  toast.error(t('toast.refused'), {
    description: t('toast.refusedDescription'),
    action: { label: t('toast.showFields'), onAction: showFields },
  });

/** `retry` repeats the action that failed (a save or a reload), so a toast button never runs another one. */
export function showEditFailure(
  view: {
    readonly queryClient: QueryClient;
    readonly t: Translate;
    readonly tEdit: EditTranslate;
    readonly setError: UseFormSetError<VacancyFormValues>;
    readonly invalidFields: (invalid: readonly string[]) => void;
    readonly focusFirstInvalid: (invalid: readonly string[]) => void;
    readonly id: string;
    readonly router: { refresh(): void; replace(href: string): void };
    readonly setStale: (stale: boolean) => void;
    readonly loadStaleUi: () => void;
    readonly release: () => void;
  },
  effect: EditFinalFailure,
  retry: () => void,
  publishRefused = false,
) {
  const { queryClient, t, tEdit, focusFirstInvalid, id, router } = view;
  const refreshLists = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.vacanciesAll() });
  if (effect.type === 'fields') {
    const invalid = markFieldErrors(queryClient, view.setError, effect.errors);
    view.invalidFields(invalid);
    if (publishRefused)
      announceRefused(tEdit, () => {
        focusFirstInvalid(invalid);
        // Sonner 2.0.8 hands focus back to the element focused before the toaster when the action's button blurs (`lastFocusedElementRef`, sync or a tick later); focusing again afterwards wins. Not run in WebKit here: Safari does not focus a clicked button, so nothing is handed back and the first call is the one that counts.
        setTimeout(() => focusFirstInvalid(invalid), 0);
      });
  } else if (effect.type === 'stale') {
    view.setStale(true);
    announceStale(tEdit, id);
    view.loadStaleUi();
  } else if (effect.type === 'notDraft') {
    // The page re-reads the draft and shows the not-a-draft state instead of the form.
    void refreshLists();
    void queryClient.invalidateQueries({ queryKey: queryKeys.vacancy(id) });
    router.refresh();
  } else if (effect.type === 'gone') {
    announceGone(tEdit);
    void refreshLists();
    view.release();
    router.replace(rememberedListHref());
  } else {
    showFailureToast(t, effect, retry);
    // The role was lost mid-session: the page re-reads the grants and the refused field goes away.
    if (effect.title === 'forbidden') router.refresh();
  }
}

export { planEditFailure };
