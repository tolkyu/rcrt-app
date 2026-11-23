'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';
import type { EditorDocumentResult } from '@/lib/rich-text-editor-document';
import type { VacancyContent } from '@/lib/schemas/vacancy-content';
import {
  CONTENT_FIELDS,
  baselineContent,
  changeContent,
  clearContent,
  contentDirty,
  emptyContentFields,
  fieldDocument,
  invalidContentFields,
  isEditableStatus,
  loadContentSubmit,
  sameContent,
  undoContentClear,
  type ContentFeedback,
  type ContentField,
} from '@/lib/vacancy-content-form';
import { refreshVacancy } from '@/lib/vacancy-refresh';
import type { useVacancyContentAccess } from './use-vacancy-content-access';
import { useSubmissionLock } from './use-submission-lock';

const freshForm = (
  id: string,
  baseline: VacancyContent | null = null,
  feedback: ContentFeedback = { kind: 'idle' },
) => ({
  id,
  baseline,
  fields: emptyContentFields(),
  ready: { descriptionDoc: false, requirementsDoc: false },
  resetKeys: { descriptionDoc: 0, requirementsDoc: 0 },
  stale: false,
  closed: false,
  needsFresh: false,
  feedback,
});
export function useEditVacancyContent({
  id: rawId,
  access,
}: {
  id: string;
  access: ReturnType<typeof useVacancyContentAccess>;
}) {
  const id = rawId.toLowerCase();
  const client = useQueryClient();
  const { mountedRef, busyRef, tryLock } = useSubmissionLock();
  const lifetime = useRef({ id, client });
  useLayoutEffect(() => {
    busyRef.current = false;
    const scope = { id, client };
    lifetime.current = scope;
    return () => {
      lifetime.current = { id: '', client };
    };
  }, [id, client, busyRef]);
  const [form, setForm] = useState(() => freshForm(id));
  const [pending, setPending] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [owner, setOwner] = useState(client);
  const lost = access.state.kind === 'unavailable';
  const read = access.state.kind === 'readable' ? access.state : null;
  if (form.id !== id || owner !== client) {
    setForm(freshForm(id));
    setOwner(client);
    setPending(false);
    setReloading(false);
  } else if (lost && form.baseline) setForm(freshForm(id));
  else if (!form.baseline && read?.content.id === id)
    setForm({ ...form, baseline: baselineContent(read.content) });
  else if (!pending && form.baseline && read && !read.refreshing) {
    if (!form.stale && read.content.version > form.baseline.version)
      setForm({ ...form, stale: true, feedback: { kind: 'stale' } });
    else if (form.needsFresh && read.content.version >= form.baseline.version)
      setForm({ ...form, needsFresh: false });
  }
  const visible =
    !lost && form.id === id && owner === client ? form.baseline : null;
  const dirty = visible ? contentDirty(visible, form.fields) : false;
  const invalidFields = visible ? invalidContentFields(form.fields) : [];
  const closed =
    form.closed || (!!read && !isEditableStatus(read.content.status));
  const disabled =
    pending || reloading || !read?.content.canEditContent || closed;
  const canSave =
    !!visible &&
    dirty &&
    !invalidFields.length &&
    form.feedback.kind !== 'fields' &&
    !form.stale &&
    !form.needsFresh &&
    !disabled &&
    !!read?.canEdit &&
    CONTENT_FIELDS.every((field) => form.ready[field]);
  const currentForm = useRef(form);
  useLayoutEffect(() => {
    currentForm.current = form;
  }, [form]);
  const commit = (change: (old: typeof form) => typeof form) => {
    const next = change(currentForm.current);
    currentForm.current = next;
    setForm(next);
  };
  const adopt = (next: VacancyContent, reload = false) =>
    commit((old) => {
      const reset = (field: ContentField) =>
        reload ||
        old.fields[field].kind === 'clear' ||
        !old.baseline ||
        !sameContent(
          next[field],
          fieldDocument(old.baseline, field, old.fields[field]),
        );
      const resetKeys = {
        descriptionDoc:
          old.resetKeys.descriptionDoc + Number(reset('descriptionDoc')),
        requirementsDoc:
          old.resetKeys.requirementsDoc + Number(reset('requirementsDoc')),
      };
      return {
        ...old,
        baseline: baselineContent(next),
        fields: emptyContentFields(),
        stale: false,
        closed: false,
        needsFresh: !reload,
        resetKeys,
        ready: {
          descriptionDoc: !reset('descriptionDoc') && old.ready.descriptionDoc,
          requirementsDoc:
            !reset('requirementsDoc') && old.ready.requirementsDoc,
        },
      };
    });
  const submit = async () => {
    const snapshot = currentForm.current;
    if (
      !canSave ||
      snapshot.id !== id ||
      snapshot.stale ||
      snapshot.closed ||
      snapshot.needsFresh ||
      snapshot.feedback.kind === 'fields' ||
      !snapshot.baseline ||
      invalidContentFields(snapshot.fields).length ||
      !CONTENT_FIELDS.every((field) => snapshot.ready[field]) ||
      !tryLock()
    )
      return;
    const scope = lifetime.current;
    const baseline = snapshot.baseline;
    const live = () => mountedRef.current && lifetime.current === scope;
    setPending(true);
    let token: Awaited<ReturnType<typeof access.beginWrite>> = null;
    try {
      token = await access.beginWrite();
      if (!token || !token.isCurrent() || !live()) return;
      const lib = await loadContentSubmit();
      if (!token.isCurrent() || !live()) return;
      const plan = lib.buildContentPatch(baseline, snapshot.fields);
      if (plan.kind !== 'patch') {
        commit((old) => ({
          ...old,
          feedback:
            plan.kind === 'empty'
              ? { kind: 'noOp' }
              : {
                  kind: 'fields',
                  errors: plan.fields.map((field) => ({
                    path: `body.${field}`,
                    code: 'invalid',
                  })),
                },
        }));
        await access.finishWrite(token);
        return;
      }
      try {
        const saved = await lib.submitVacancyContent(id, plan.body);
        if (!token.isCurrent() || !live()) {
          await lib.invalidateLateContentSuccess(client, id);
          return;
        }
        adopt(saved);
        commit((old) => ({
          ...old,
          feedback: {
            kind: saved.version === baseline.version ? 'noOp' : 'saved',
          },
        }));
        await refreshVacancy(client, id);
        await access.finishWrite(token);
      } catch (error) {
        if (!token.isCurrent() || !live()) return;
        const feedback = lib.contentFailure(error);
        commit((old) => ({
          ...old,
          feedback,
          stale: old.stale || feedback.kind === 'stale',
          closed: old.closed || feedback.kind === 'closed',
        }));
        await access.handleWriteError(error, token);
      }
    } catch {
      if (live() && (!token || token.isCurrent()))
        commit((old) => ({ ...old, feedback: { kind: 'loadFailed' } }));
      if (token?.isCurrent()) await access.finishWrite(token).catch(() => null);
    } finally {
      if (live()) {
        busyRef.current = false;
        setPending(false);
      }
    }
  };
  const reloadConfirmed = async () => {
    if (!tryLock()) return;
    const scope = lifetime.current;
    setReloading(true);
    try {
      const next = await access.revalidate();
      if (mountedRef.current && lifetime.current === scope) {
        if (next) {
          adopt(next, true);
          commit((old) => ({ ...old, feedback: { kind: 'idle' } }));
        } else
          commit((old) => ({ ...old, feedback: { kind: 'reloadFailed' } }));
      }
    } catch {
      if (mountedRef.current && lifetime.current === scope)
        commit((old) => ({ ...old, feedback: { kind: 'reloadFailed' } }));
    } finally {
      if (lifetime.current === scope) {
        busyRef.current = false;
        setReloading(false);
      }
    }
  };
  const update = (change: (current: typeof form) => typeof form) => {
    if (
      lifetime.current.id === id &&
      lifetime.current.client === client &&
      !busyRef.current &&
      !disabled &&
      visible
    )
      commit((old) => {
        const next = change(old);
        return next.fields === old.fields
          ? next
          : {
              ...next,
              feedback:
                next.stale || next.closed ? next.feedback : { kind: 'idle' },
            };
      });
  };
  return {
    baseline: visible,
    fields: visible ? form.fields : null,
    ready: form.ready,
    resetKeys: form.resetKeys,
    dirty,
    invalidFields,
    stale: form.stale,
    closed,
    pending,
    reloading,
    canSave,
    disabled,
    protectLeave: !lost && (dirty || pending),
    feedback: form.feedback,
    change: (field: ContentField, result: EditorDocumentResult) =>
      update((old) =>
        old.baseline
          ? {
              ...old,
              fields: changeContent(old.baseline, old.fields, field, result),
            }
          : old,
      ),
    clear: (field: ContentField) =>
      update((old) => ({ ...old, fields: clearContent(old.fields, field) })),
    undoClear: (field: ContentField) =>
      update((old) => ({
        ...old,
        fields: undoContentClear(old.fields, field),
      })),
    setReady: (field: ContentField, ready: boolean) => {
      if (
        !lost &&
        lifetime.current.id === id &&
        lifetime.current.client === client
      )
        commit((old) => ({ ...old, ready: { ...old.ready, [field]: ready } }));
    },
    submit,
    reloadConfirmed,
  };
}
