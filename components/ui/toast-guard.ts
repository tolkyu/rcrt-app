/** Toasts live outside the modal, so Radix reads a click on one as an outside click and would close the dialog. */
export function keepOpenOnToast<E extends Event>(next?: (event: E) => void) {
  return (event: E) => {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-sonner-toaster]')) {
      event.preventDefault();
      return;
    }
    next?.(event);
  };
}
