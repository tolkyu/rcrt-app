// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';
import { useFieldSummary } from '@/components/vacancies/use-field-summary';
import type { VacancyFormValues } from '@/lib/vacancy-form';

afterEach(cleanup);

describe('vacancy validation summary after corrections [S3.6]', () => {
  it('keeps a submit summary on error updates, then clears it when a picker sets a value', () => {
    const { result } = renderHook(() => {
      const form = useForm<VacancyFormValues>({
        defaultValues: { title: '', positionId: '', headcount: '1' },
      });
      return { form, ...useFieldSummary(form.subscribe) };
    });
    act(() => result.current.invalidFields(['positionId', 'title']));
    expect(result.current.summary).toEqual({
      count: 2,
      attempt: 1,
      fields: ['positionId', 'title'],
    });
    act(() =>
      result.current.form.setError('title', {
        type: 'required',
        message: 'titleRequired',
      }),
    );
    expect(result.current.summary.count).toBe(2);

    act(() => result.current.form.setValue('positionId', 'chosen-position'));
    expect(result.current.summary).toEqual({
      count: 0,
      attempt: 1,
      fields: [],
    });
    expect(result.current.form.getFieldState('title').error?.message).toBe(
      'titleRequired',
    );

    act(() => result.current.invalidFields(['title']));
    expect(result.current.summary).toEqual({
      count: 1,
      attempt: 2,
      fields: ['title'],
    });
  });

  it('ignores keys that are not form fields', () => {
    const { result } = renderHook(() => {
      const form = useForm<VacancyFormValues>({ defaultValues: { title: '' } });
      return useFieldSummary(form.subscribe);
    });
    act(() => result.current.invalidFields(['body', 'salaryMax', 'title']));
    expect(result.current.summary.fields).toEqual(['title', 'salaryMax']);
  });
});
