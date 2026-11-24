// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Label as RadixLabel } from 'radix-ui';
import { createElement, type ComponentProps, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Label } from '@/components/ui/label';

afterEach(cleanup);

const CLASSES = 'text-foreground text-sm font-medium';

const SLOT = { 'data-slot': 'label' };

const radix = ({ className, ...props }: ComponentProps<'label'>) =>
  createElement(RadixLabel.Root, {
    ...SLOT,
    className: className ? `${CLASSES} ${className}` : CLASSES,
    ...props,
  });

const pressOn = (target: Element, detail: number) =>
  fireEvent.mouseDown(target, { detail });

const withInput = (
  Component: typeof Label,
  input: ComponentProps<'input'> = {},
  children: ReactNode = 'Назва',
) =>
  render(
    createElement(
      'div',
      null,
      createElement(Component, { htmlFor: 'field' }, children),
      createElement('input', { id: 'field', ...input }),
    ),
  );

describe.each([
  ['native', Label],
  ['Radix reference', radix],
])('Label behaviour: %s [PERF-04]', (_name, Component) => {
  it('names its control through htmlFor', () => {
    withInput(Component);
    const input = screen.getByRole('textbox', { name: 'Назва' });
    expect(screen.getByText('Назва')).toHaveProperty('control', input);
  });

  it('names and activates a nested control', () => {
    render(
      createElement(
        Component,
        null,
        'Згода',
        createElement('input', { type: 'checkbox' }),
      ),
    );
    const box = screen.getByRole<HTMLInputElement>('checkbox', {
      name: 'Згода',
    });
    fireEvent.click(screen.getByText('Згода'));
    expect(box.checked).toBe(true);
  });

  it('activates the control on click through htmlFor', () => {
    withInput(Component, { type: 'checkbox' });
    const box = screen.getByRole<HTMLInputElement>('checkbox');
    fireEvent.click(screen.getByText('Назва'));
    expect(box.checked).toBe(true);
  });

  it('does not activate a disabled control', () => {
    withInput(Component, { type: 'checkbox', disabled: true });
    const box = screen.getByRole<HTMLInputElement>('checkbox');
    fireEvent.click(screen.getByText('Назва'));
    expect(box.checked).toBe(false);
  });

  it('blocks text selection only from the second press', () => {
    withInput(Component);
    const label = screen.getByText('Назва');
    expect(pressOn(label, 1)).toBe(true);
    expect(pressOn(label, 2)).toBe(false);
    expect(pressOn(label, 3)).toBe(false);
  });

  it.each(['button', 'input', 'select', 'textarea'])(
    'leaves a double press on a nested %s alone',
    (tag) => {
      const onMouseDown = vi.fn();
      render(
        createElement(
          Component,
          { onMouseDown },
          createElement(tag, { 'data-testid': 'inner' }),
        ),
      );
      expect(pressOn(screen.getByTestId('inner'), 2)).toBe(true);
      expect(onMouseDown).not.toHaveBeenCalled();
    },
  );

  it('calls the caller handler once for a press on the label', () => {
    const onMouseDown = vi.fn();
    render(createElement(Component, { onMouseDown }, 'Назва'));
    pressOn(screen.getByText('Назва'), 2);
    expect(onMouseDown).toHaveBeenCalledTimes(1);
  });
});

describe('Label markup [PERF-04]', () => {
  it.each([
    [{ htmlFor: 'a' }],
    [{ htmlFor: 'b', className: 'flex flex-col gap-1' }],
    [{ id: 'c', 'aria-hidden': true }],
  ])('renders the same element as Radix for %j', (props) => {
    const own = render(createElement(Label, props, 'Текст')).container
      .innerHTML;
    cleanup();
    const reference = render(createElement(radix, props, 'Текст')).container
      .innerHTML;
    expect(own).toBe(reference);
  });

  it('keeps the same classes next to a disabled control', () => {
    withInput(Label, { disabled: true });
    expect(screen.getByText('Назва').className).toBe(CLASSES);
  });
});
