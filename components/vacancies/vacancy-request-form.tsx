'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { filterOptions } from '@/components/ui/combobox-shared';
import { FormError } from '@/components/ui/form-error';
import { FormField } from '@/components/ui/form-field';
import { FormPageLayout } from '@/components/ui/form-page-layout';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { LeaveGuardHandle } from '@/components/ui/use-leave-guard';
import { meQuery } from '@/lib/queries/me';
import { activePositionsQuery } from '@/lib/queries/positions';
import { reasonLength } from '@/lib/reason-length';
import type { Position } from '@/lib/schemas/position';
import { useVacancyListHref } from '@/lib/vacancy-list-memory';
import {
  VACANCY_HEADCOUNT_MAX,
  VACANCY_REQUEST_COMMENT_MAX,
  VACANCY_REQUEST_COMMENT_MAX_LINES,
} from '@/lib/vacancy-limits';
import {
  REQUEST_FIELDS,
  REQUEST_FIELD_IDS,
  type RequestField,
} from '@/lib/vacancy-request-form';
import { UrgencyControl } from './urgency-control';
import { loadRequest, useRequestVacancy } from './use-request-vacancy';

export type RequestPositionSeed = {
  verticalId: string;
  items: Position[];
  loadedAt: number;
};

export function VacancyRequestForm({
  verticals,
  initialPositions,
}: {
  verticals: readonly { id: string; name: string }[];
  initialPositions: readonly RequestPositionSeed[];
}) {
  const t = useTranslations('vacancyRequest');
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery());
  const guard = useRef<LeaveGuardHandle>(null);
  const form = useRequestVacancy(guard);
  const [positions, setPositions] = useState(() =>
    initialPositions.flatMap((seed) => seed.items),
  );
  const [chosen, setChosen] = useState<Position | undefined>();
  const [catalogEmpty, setCatalogEmpty] = useState(
    () =>
      initialPositions.length === verticals.length && positions.length === 0,
  );
  const listHref = useVacancyListHref();
  useEffect(() => {
    for (const seed of initialPositions) {
      const key = activePositionsQuery(seed.verticalId).queryKey;
      if (!queryClient.getQueryData(key))
        queryClient.setQueryData(
          key,
          { items: seed.items },
          { updatedAt: seed.loadedAt },
        );
    }
  }, [initialPositions, queryClient]);
  const verticalName = (position: Position) =>
    verticals.find((vertical) => vertical.id === position.verticalId)?.name;
  const toOption = (position: Position) => ({
    value: position.id,
    label: position.name,
    description: verticalName(position),
  });
  const selected = chosen?.id === form.values.positionId ? chosen : undefined;
  const search = async (query: string) => {
    const items = await (
      await loadRequest()
    ).fetchRequestPositions(
      queryClient,
      verticals.map((vertical) => vertical.id),
    );
    setPositions(items);
    setCatalogEmpty(items.length === 0);
    return filterOptions(items.map(toOption), query);
  };
  const error = (field: RequestField) => {
    const code = form.errors[field];
    return code
      ? t(`errors.${code}`, {
          max:
            field === 'headcount'
              ? VACANCY_HEADCOUNT_MAX
              : VACANCY_REQUEST_COMMENT_MAX,
          lines: VACANCY_REQUEST_COMMENT_MAX_LINES,
        })
      : undefined;
  };
  const errorFields = REQUEST_FIELDS.filter((field) => form.errors[field]);
  return (
    <FormPageLayout
      title={t('title')}
      subtitle={t('subtitle')}
      back={{ href: listHref, label: t('back') }}
      dirty={form.dirty}
      guardRef={guard}
      onSubmit={(event) => {
        event.preventDefault();
        form.submit();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          form.submit();
        } else if (event.target instanceof HTMLInputElement)
          event.preventDefault();
      }}
      footer={
        <>
          <Button
            asChild
            variant="outline"
            className="h-11 basis-full md:basis-auto"
            aria-disabled={form.pending || undefined}
          >
            <Link
              href={listHref}
              onClick={(event) => {
                if (form.pending) event.preventDefault();
              }}
            >
              {t('exit')}
            </Link>
          </Button>
          <Button
            type="submit"
            aria-disabled={form.pending || form.notice === 'forbidden'}
            aria-busy={form.pending}
            className="h-11 basis-full md:basis-auto"
          >
            {t(form.pending ? 'pending' : 'title')}
          </Button>
        </>
      }
    >
      <FormError
        count={form.summary ? errorFields.length : 0}
        attempt={form.summary}
        links={errorFields.map((field) => ({
          id: REQUEST_FIELD_IDS[field],
          label: t(`fields.${field}`),
        }))}
      />
      <FormField
        id="request-position"
        label={t('fields.positionId')}
        required
        hint={t('positionHint')}
        error={error('positionId')}
        announce={!form.summary}
      >
        {(control) => (
          <Combobox
            {...control}
            value={form.values.positionId}
            onValueChange={(value) => {
              form.change('positionId', value);
              setChosen(positions.find((position) => position.id === value));
            }}
            onBlur={() => form.validateField('positionId')}
            selectedOption={selected && toOption(selected)}
            onSearch={search}
            readOnly={form.pending}
            placeholder={t('positionPlaceholder')}
            emptyText={t(catalogEmpty ? 'positionsEmpty' : 'searchEmpty')}
          />
        )}
      </FormField>
      <dl className="text-sm leading-4 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">{t('vertical')}</dt>
          <dd>
            {(selected && verticalName(selected)) ?? t('verticalPending')}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">{t('teamLead')}</dt>
          <dd>{me ? t('self', { name: me.user.fullName }) : ''}</dd>
        </div>
      </dl>
      <div className="grid items-start gap-6 md:grid-cols-2">
        <FormField
          id="request-headcount"
          label={t('fields.headcount')}
          required
          hint={t('headcountHint', { max: VACANCY_HEADCOUNT_MAX })}
          error={error('headcount')}
          announce={!form.summary}
        >
          {(control) => (
            <Input
              {...control}
              inputMode="numeric"
              value={form.values.headcount}
              onChange={(event) => form.change('headcount', event.target.value)}
              onBlur={() => form.validateField('headcount')}
              readOnly={form.pending}
            />
          )}
        </FormField>
        <FormField
          id="request-priority"
          label={t('fields.priority')}
          layout="group"
          error={error('priority')}
          announce={!form.summary}
        >
          {(control) => (
            <UrgencyControl
              {...control}
              options={[
                { value: 'NORMAL', label: t('normal') },
                { value: 'URGENT', label: t('urgent') },
              ]}
              value={form.values.priority}
              disabled={form.pending}
              onValueChange={(value) => {
                if (value === 'NORMAL' || value === 'URGENT')
                  form.change('priority', value);
              }}
            />
          )}
        </FormField>
      </div>
      <FormField
        id="request-comment"
        label={t('fields.comment')}
        counter={{
          count: reasonLength(form.values.comment),
          max: VACANCY_REQUEST_COMMENT_MAX,
        }}
        error={error('comment')}
        announce={!form.summary}
      >
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            value={form.values.comment}
            placeholder={t('commentPlaceholder')}
            onChange={(event) => form.change('comment', event.target.value)}
            onBlur={() => form.validateField('comment')}
            readOnly={form.pending}
          />
        )}
      </FormField>
      {form.notice && (
        <div
          role="alert"
          className="bg-destructive-subtle text-error-text rounded-lg p-3 text-sm"
        >
          <p>{t(`errors.${form.notice}`)}</p>
          {form.notice === 'forbidden' || form.notice === 'rateLimited' ? (
            <Link
              href={listHref}
              className="mt-2 inline-flex min-h-11 items-center underline"
            >
              {t('back')}
            </Link>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="mt-2 min-h-11"
              onClick={form.submit}
            >
              {t('retry')}
            </Button>
          )}
        </div>
      )}
    </FormPageLayout>
  );
}
