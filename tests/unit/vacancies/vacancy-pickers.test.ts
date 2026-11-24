// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useVacancyPickers } from '@/components/vacancies/use-vacancy-pickers';
import { emptyVacancyForm, type VacancyFormValues } from '@/lib/vacancy-form';
import messages from '@/messages/uk.json';

const GAMBLING = '8b1f5a0e-0c2d-4f6e-9d7a-2b3c4d5e6f70';
const CRYPTO = '9c2a6b1f-1d3e-4a7f-8e8b-3c4d5e6f7081';
const POSITION = '3f1e2d3c-4b5a-4968-8776-655443322110';
const VASYL = '5d2c7e90-1f3a-4b8c-9a6d-7e8f90a1b2c3';
const TARAS = '6e3d8fa1-2a4b-4c9d-8b7e-8f90a1b2c3d4';

beforeAll(() => import('@/lib/vacancy-form-submit'));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function setup({
  pending = false,
  start = {},
}: { pending?: boolean; start?: Partial<VacancyFormValues> } = {}) {
  const client = new QueryClient();
  const onVerticalChange = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(NextIntlClientProvider, {
        locale: 'uk',
        timeZone: 'Europe/Kyiv',
        messages,
        children,
      }),
    );
  const view = renderHook(
    () => {
      const form = useForm<VacancyFormValues>({
        defaultValues: { ...emptyVacancyForm(GAMBLING), ...start },
      });
      const verticalId = useWatch({
        control: form.control,
        name: 'verticalId',
      });
      const picker = useVacancyPickers({
        form: {
          getValues: form.getValues,
          setValue: form.setValue,
          errors: form.formState.errors,
        },
        verticalId,
        verticalName: verticalId === GAMBLING ? 'Гемблінг' : 'Крипто',
        initialVerticalId: GAMBLING,
        initialPositions: undefined,
        pending,
        onVerticalChange,
      });
      // Reading it here subscribes the form state to dirtiness.
      return { form, picker, dirty: form.formState.dirtyFields };
    },
    { wrapper },
  );
  return { ...view, onVerticalChange, client };
}

describe('vertical change clears what belongs to the old vertical [ux §2.1]', () => {
  it('clears the Team Lead and says so, without touching an empty position', () => {
    const { result, onVerticalChange } = setup({
      start: { teamLeadId: VASYL },
    });
    act(() => result.current.picker.chooseVertical(CRYPTO));
    expect(result.current.form.getValues()).toMatchObject({
      verticalId: CRYPTO,
      teamLeadId: '',
    });
    expect(result.current.picker.verticalNote).toBe('teamLead');
    expect(onVerticalChange).toHaveBeenCalledOnce();
  });

  it('clears both and keeps the note while the position reset finishes', async () => {
    const { result } = setup({
      start: { teamLeadId: VASYL, positionId: POSITION },
    });
    act(() => result.current.picker.chooseVertical(CRYPTO));
    await waitFor(() =>
      expect(result.current.form.getValues('positionId')).toBe(''),
    );
    expect(result.current.form.getValues('teamLeadId')).toBe('');
    expect(result.current.picker.verticalNote).toBe('both');
  });

  it('names only the position when no Team Lead was chosen (a Recruiter has none)', async () => {
    const { result } = setup({ start: { positionId: POSITION } });
    act(() => result.current.picker.chooseVertical(CRYPTO));
    await waitFor(() =>
      expect(result.current.form.getValues('positionId')).toBe(''),
    );
    expect(result.current.picker.verticalNote).toBe('position');
  });

  it('says nothing when there was nothing to clear, and ignores the same vertical', () => {
    const { result, onVerticalChange } = setup();
    act(() => result.current.picker.chooseVertical(GAMBLING));
    expect(onVerticalChange).not.toHaveBeenCalled();
    act(() => result.current.picker.chooseVertical(CRYPTO));
    expect(result.current.picker.verticalNote).toBeNull();
  });

  it('does nothing while a save is in flight', () => {
    const { result } = setup({ pending: true, start: { teamLeadId: VASYL } });
    act(() => result.current.picker.chooseVertical(CRYPTO));
    expect(result.current.form.getValues()).toMatchObject({
      verticalId: GAMBLING,
      teamLeadId: VASYL,
    });
  });
});

describe('Team Lead choice [STORY-VAC-01-1]', () => {
  it('sets and clears the value, dirties the form and drops the old note', () => {
    const { result } = setup({ start: { teamLeadId: VASYL } });
    act(() => result.current.picker.chooseVertical(CRYPTO));
    expect(result.current.picker.verticalNote).toBe('teamLead');
    act(() => result.current.picker.chooseTeamLead(TARAS));
    expect(result.current.form.getValues('teamLeadId')).toBe(TARAS);
    expect(result.current.picker.verticalNote).toBeNull();
    expect(result.current.dirty.teamLeadId).toBe(true);
    act(() => result.current.picker.chooseTeamLead(''));
    expect(result.current.form.getValues('teamLeadId')).toBe('');
  });

  it('ignores a choice while a save is in flight', () => {
    const { result } = setup({ pending: true });
    act(() => result.current.picker.chooseTeamLead(TARAS));
    expect(result.current.form.getValues('teamLeadId')).toBe('');
  });
});

describe('Team Lead options', () => {
  const list = {
    items: [
      { id: VASYL, fullName: 'Василь Мороз', priority: 0 },
      { id: TARAS, fullName: 'Тарас Лисенко', priority: null },
    ],
  };

  it('shows name, vertical and priority, in the order the server gave', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, list)));
    const { result } = setup();
    const options = await result.current.picker.searchTeamLeads('');
    expect(options).toEqual([
      {
        value: VASYL,
        label: 'Василь Мороз',
        avatar: true,
        description: 'Тімлід · Гемблінг · П0',
      },
      {
        value: TARAS,
        label: 'Тарас Лисенко',
        avatar: true,
        description: 'Тімлід · Гемблінг',
      },
    ]);
  });

  it('filters by name or by the secondary line', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, list)));
    const { result } = setup();
    expect(
      (await result.current.picker.searchTeamLeads('лисен')).map(
        (option) => option.value,
      ),
    ).toEqual([TARAS]);
    expect(
      (await result.current.picker.searchTeamLeads('п0')).map(
        (option) => option.value,
      ),
    ).toEqual([VASYL]);
  });

  it('reports an empty vertical whatever is typed, and clears the flag once a list with people arrives', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(json(200, { items: [] }))
      .mockResolvedValue(json(200, list));
    vi.stubGlobal('fetch', fetchSpy);
    const { result, client } = setup();
    await act(async () => {
      await result.current.picker.searchTeamLeads('вас');
    });
    expect(result.current.picker.teamLeadsEmpty).toBe(true);
    await client.invalidateQueries();
    await act(async () => {
      await result.current.picker.searchTeamLeads('');
    });
    expect(result.current.picker.teamLeadsEmpty).toBe(false);
  });

  it('a filter that matches nobody in a vertical that has people is not an empty vertical', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, list)));
    const { result } = setup();
    await act(async () => {
      expect(await result.current.picker.searchTeamLeads('жодного')).toEqual(
        [],
      );
    });
    expect(result.current.picker.teamLeadsEmpty).toBe(false);
  });

  it('lets a failed load reach the combobox, which shows its retry row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(403, { code: 'FORBIDDEN' })),
    );
    const { result } = setup();
    await expect(
      result.current.picker.searchTeamLeads(''),
    ).rejects.toMatchObject({ status: 403 });
  });
});
