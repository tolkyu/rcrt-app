// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDraftLeaveHandlers } from '@/components/vacancies/use-draft-leave';
import type { VacancySummary } from '@/lib/schemas/vacancy';

const row = (id: string) => ({ id }) as VacancySummary;
const A = 'a';
const B = 'b';
const C = 'c';

let select: ReturnType<typeof vi.fn<(id: string | undefined) => void>>;
let results: HTMLElement;

beforeEach(() => {
  // jsdom has no layout, so every element would look hidden.
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return document.body;
    },
  });
  select = vi.fn();
  results = document.createElement('section');
  results.tabIndex = -1;
  document.body.append(results);
  for (const id of [A, B, C]) {
    const link = document.createElement('a');
    link.href = `/vacancies/${id}`;
    link.dataset.vacancyLink = id;
    document.body.append(link);
  }
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function mount(initial: string[], selectedId: string | undefined) {
  return renderHook(
    (props: { ids: string[]; selected: string | undefined }) =>
      useDraftLeaveHandlers({
        items: props.ids.map(row),
        selectedId: props.selected,
        select,
        results: { current: results },
      }),
    { initialProps: { ids: initial, selected: selectedId } },
  );
}
const focused = () =>
  (document.activeElement as HTMLElement | null)?.dataset.vacancyLink ??
  document.activeElement?.tagName;

describe('useDraftLeaveHandlers: selection and focus when a draft leaves the list [ux §6.4]', () => {
  it('the selected row leaves: selection and focus go to the next row', () => {
    const view = mount([A, B, C], B);
    act(() => view.result.current.removed(B));
    expect(select).toHaveBeenCalledWith(C);
    view.rerender({ ids: [A, C], selected: C });
    expect(focused()).toBe(C);
  });

  it('the last row leaves: the previous row is chosen', () => {
    const view = mount([A, B, C], C);
    act(() => view.result.current.removed(C));
    expect(select).toHaveBeenCalledWith(B);
    view.rerender({ ids: [A, B], selected: B });
    expect(focused()).toBe(B);
  });

  it('the only row leaves: selection is cleared and focus goes to the results region', () => {
    const view = mount([A], A);
    act(() => view.result.current.removed(A));
    expect(select).toHaveBeenCalledWith(undefined);
    view.rerender({ ids: [], selected: undefined });
    expect(document.activeElement).toBe(results);
  });

  it('another row was selected: the selection stays, focus still moves off the removed row', () => {
    const view = mount([A, B, C], A);
    act(() => view.result.current.removed(B));
    expect(select).not.toHaveBeenCalled();
    view.rerender({ ids: [A, C], selected: A });
    expect(focused()).toBe(C);
  });

  it('focus waits for the render that dropped the row', () => {
    const view = mount([A, B], B);
    act(() => view.result.current.removed(B));
    view.rerender({ ids: [A, B], selected: B });
    expect(document.activeElement).toBe(document.body);
    view.rerender({ ids: [A], selected: A });
    expect(focused()).toBe(A);
  });

  it('a refused publish puts the selection and the focus back on the row', () => {
    const view = mount([A, B, C], B);
    act(() => view.result.current.removed(B));
    view.rerender({ ids: [A, C], selected: C });
    act(() => view.result.current.restored(B));
    expect(select).toHaveBeenLastCalledWith(B);
    view.rerender({ ids: [A, B, C], selected: B });
    expect(focused()).toBe(B);
  });

  it('a row that was not selected is not selected again after a refusal', () => {
    const view = mount([A, B], A);
    act(() => view.result.current.removed(B));
    view.rerender({ ids: [A], selected: A });
    act(() => view.result.current.restored(B));
    expect(select).not.toHaveBeenCalled();
  });

  it('a row that is not in the list changes nothing', () => {
    const view = mount([A, B], A);
    act(() => {
      view.result.current.removed('zzz');
    });
    expect(select).not.toHaveBeenCalled();
    expect(focused()).toBe('BODY');
  });

  it('after the list unmounted a late answer neither selects nor focuses', () => {
    const view = mount([A, B], A);
    const { removed } = view.result.current;
    view.unmount();
    removed(A);
    expect(select).not.toHaveBeenCalled();
  });

  it('tells the caller whether the list took the row over', () => {
    const view = mount([A, B], A);
    let handled = false;
    act(() => {
      handled = view.result.current.removed(B);
    });
    expect(handled).toBe(true);
    act(() => {
      handled = view.result.current.removed('zzz');
    });
    expect(handled).toBe(false);
  });

  it('a refusal for a row the list never took over is left to the caller', () => {
    const view = mount([A, B], A);
    let handled = true;
    act(() => {
      handled = view.result.current.restored(B);
    });
    expect(handled).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });

  it('a late answer after the list unmounted is left to the caller', () => {
    const view = mount([A, B], A);
    const handlers = view.result.current;
    view.unmount();
    expect(handlers.removed(A)).toBe(false);
    expect(handlers.restored(A)).toBe(false);
  });

  describe('two publishes in flight keep their own state', () => {
    it('only the draft whose selection moved selects itself again', () => {
      const view = mount([A, B, C], A);
      act(() => {
        view.result.current.removed(B);
        view.result.current.removed(A);
      });
      expect(select).toHaveBeenCalledTimes(1);
      expect(select).toHaveBeenLastCalledWith(C);
      select.mockClear();
      act(() => {
        view.result.current.restored(B);
      });
      expect(select).not.toHaveBeenCalled();
      act(() => {
        view.result.current.restored(A);
      });
      expect(select).toHaveBeenCalledExactlyOnceWith(A);
    });

    it('each removed row gets its focus move once the page no longer holds it', () => {
      const view = mount([A, B, C], C);
      act(() => {
        view.result.current.removed(B);
        view.result.current.removed(C);
      });
      view.rerender({ ids: [A], selected: A });
      expect(focused()).toBe(A);
    });

    it('a refusal for one leaves the pending focus of the other alone', () => {
      const view = mount([A, B, C], A);
      act(() => {
        view.result.current.removed(A);
        view.result.current.removed(B);
      });
      view.rerender({ ids: [C], selected: C });
      act(() => {
        view.result.current.restored(A);
      });
      view.rerender({ ids: [A, C], selected: A });
      expect(focused()).toBe(A);
    });
  });

  it('a settled publish is forgotten: a later refusal of the same id is left to the caller', () => {
    const view = mount([A, B], A);
    act(() => {
      view.result.current.removed(A);
      view.result.current.settled(A);
    });
    let handled = true;
    act(() => {
      handled = view.result.current.restored(A);
    });
    expect(handled).toBe(false);
    expect(select).toHaveBeenCalledTimes(1);
  });
});
