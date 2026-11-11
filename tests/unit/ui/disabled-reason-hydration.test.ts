// @vitest-environment jsdom
import { act, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server.browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { DisabledReason } from '@/components/ui/disabled-reason';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  root?.unmount();
  container?.remove();
  root = undefined;
  container = undefined;
  cleanup();
});

const REASON = 'Заповніть посаду, щоб опублікувати.';

const action = () =>
  createElement(DisabledReason, {
    reason: REASON,
    children: createElement(Button, null, 'Опублікувати'),
  });

/** A lone child is no fork, a `[null, child]` pair is: same DOM, other `useId` path (seen in dev under load). */
const serverTree = (): ReactNode => createElement('main', null, action());
const clientTree = (): ReactNode => createElement('main', null, null, action());

/** Radix adds its own tooltip id while the bubble is open, so the texts are deduplicated. */
const describedBy = (button: Element | null) => [
  ...new Set(
    (button?.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? null),
  ),
];

describe('DisabledReason hydration [UI foundation F2, useId hydration fix]', () => {
  it('sends no id from the server, so there is nothing to mismatch', () => {
    const html = renderToString(serverTree());
    expect(html).not.toContain('aria-describedby');
    expect(html).not.toMatch(/<span[^>]* id=/);
  });

  it('keeps the description reachable when the client derives another useId than the server', async () => {
    const host = document.createElement('div');
    container = host;
    document.body.append(host);
    host.innerHTML = renderToString(serverTree());
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      root = hydrateRoot(host, clientTree());
    });
    expect(describedBy(host.querySelector('button'))).toEqual([REASON]);

    // The first keyboard focus swaps in the Radix trigger, which re-applies the client props.
    const first = host.querySelector('button');
    await userEvent.tab();
    await waitFor(() => expect(host.querySelector('button')).not.toBe(first));
    expect(describedBy(host.querySelector('button'))).toEqual([REASON]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
